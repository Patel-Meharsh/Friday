import process from "node:process";
import { randomUUID } from "node:crypto";
import { audit } from "../security/audit-log.js";
import { registerTool, toolRegistryStatus } from "../tools/tool-registry.js";
import { getPermissions } from "../security/permission-manager.js";

const MAX_TASKS = 32;
const MIN_INTERVAL_MS = 1_000;
const tasks = new Map();

let heartbeatTimer = null;
let stopping = false;
let lastHeartbeatAt = null;
let runningTasks = 0;
let runtimeToolsRegistered = false;

function normalizeDelay(value, fallback = 60_000) {
  const delay = Number(value);
  if (!Number.isFinite(delay)) return fallback;
  return Math.max(MIN_INTERVAL_MS, Math.min(Math.floor(delay), 2_147_483_647));
}

async function executeTask(task) {
  if (stopping || task.cancelled || task.running) return;
  task.running = true;
  runningTasks += 1;
  task.lastStartedAt = new Date().toISOString();

  try {
    await task.execute({ taskId: task.id, name: task.name });
    task.runCount += 1;
    task.lastCompletedAt = new Date().toISOString();
    task.lastError = null;
    await audit("background_task_completed", { taskId: task.id, name: task.name, runCount: task.runCount });
  } catch (error) {
    task.runCount += 1;
    task.lastError = String(error?.message || error).slice(0, 300);
    await audit("background_task_failed", { taskId: task.id, name: task.name, error: task.lastError });
  } finally {
    task.running = false;
    runningTasks -= 1;
    if (task.once || task.cancelled) removeTask(task.id);
  }
}

function removeTask(taskId) {
  const task = tasks.get(taskId);
  if (!task) return false;
  if (task.timer) clearTimeout(task.timer);
  tasks.delete(taskId);
  return true;
}

function armTask(task, delayMs) {
  if (stopping || task.cancelled) return;
  task.timer = setTimeout(async () => {
    await executeTask(task);
    if (!task.once && !task.cancelled && tasks.has(task.id) && !stopping) {
      armTask(task, task.intervalMs);
    }
  }, delayMs);
  task.timer.unref?.();
}

export function scheduleTask({ name, delayMs = 0, intervalMs = null, once = true, execute }) {
  if (tasks.size >= MAX_TASKS) throw new Error(`Background task limit reached (${MAX_TASKS}).`);
  if (typeof execute !== "function") throw new TypeError("A task must provide an execute function.");

  const task = {
    id: randomUUID(),
    name: String(name || "background-task").slice(0, 100),
    once: Boolean(once),
    intervalMs: normalizeDelay(intervalMs, 60_000),
    timer: null,
    execute,
    cancelled: false,
    running: false,
    runCount: 0,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastError: null,
    createdAt: new Date().toISOString(),
  };

  tasks.set(task.id, task);
  armTask(task, Math.max(0, Math.min(Number(delayMs) || 0, 2_147_483_647)));
  void audit("background_task_scheduled", { taskId: task.id, name: task.name, once: task.once, intervalMs: task.once ? null : task.intervalMs });

  return publicTask(task);
}

export function cancelTask(taskId) {
  const task = tasks.get(String(taskId));
  if (!task) return false;
  task.cancelled = true;
  return removeTask(task.id);
}

export function listScheduledTasks() {
  return [...tasks.values()].map(publicTask);
}

function publicTask(task) {
  return {
    id: task.id,
    name: task.name,
    once: task.once,
    intervalMs: task.once ? null : task.intervalMs,
    running: task.running,
    runCount: task.runCount,
    lastStartedAt: task.lastStartedAt,
    lastCompletedAt: task.lastCompletedAt,
    lastError: task.lastError,
    createdAt: task.createdAt,
  };
}

function registerRuntimeTools() {
  if (runtimeToolsRegistered) return;
  registerTool({
    name: "runtime_status",
    description: "Read Friday's safe runtime status without changing anything.",
    capability: "generalAI",
    execute: async () => ({ runtime: getBackgroundRuntimeStatus(), permissions: getPermissions() }),
  });
  registerTool({
    name: "list_tools",
    description: "List the tools currently registered with Friday.",
    capability: "generalAI",
    execute: async () => toolRegistryStatus(),
  });
  registerTool({
    name: "list_scheduled_tasks",
    description: "List temporary in-process background tasks created during this Friday session.",
    capability: "generalAI",
    execute: async () => listScheduledTasks(),
  });
  registerTool({
    name: "cancel_session_task",
    description: "Cancel a temporary in-process background task.",
    capability: "generalAI",
    execute: async ({ taskId }) => ({ cancelled: cancelTask(taskId) }),
    input: { taskId: "string" },
  });
  runtimeToolsRegistered = true;
}

export async function startBackgroundRuntime({ intervalMs = 60_000 } = {}) {
  registerRuntimeTools();
  if (heartbeatTimer) return;

  stopping = false;
  const heartbeatInterval = normalizeDelay(intervalMs, 60_000);
  await audit("background_runtime_started", { pid: process.pid, intervalMs: heartbeatInterval, maxTasks: MAX_TASKS });

  heartbeatTimer = setInterval(async () => {
    if (stopping) return;
    lastHeartbeatAt = new Date().toISOString();
    try {
      await audit("background_runtime_heartbeat", { pid: process.pid, scheduledTasks: tasks.size, runningTasks });
    } catch (error) {
      console.error(`FRIDAY runtime audit error: ${error.message}`);
    }
  }, heartbeatInterval);

  heartbeatTimer.unref?.();
}

export async function stopBackgroundRuntime(reason = "normal") {
  stopping = true;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  for (const task of tasks.values()) {
    task.cancelled = true;
    if (task.timer) clearTimeout(task.timer);
  }
  tasks.clear();

  await audit("background_runtime_stopped", { reason, pid: process.pid });
}

export function getBackgroundRuntimeStatus() {
  return {
    enabled: true,
    running: Boolean(heartbeatTimer),
    pid: process.pid,
    mode: "user-process",
    autoStart: false,
    elevated: false,
    networkExposure: "localhost-only",
    scheduledTasks: tasks.size,
    runningTasks,
    maxTasks: MAX_TASKS,
    lastHeartbeatAt,
    toolRegistry: toolRegistryStatus(),
  };
}
