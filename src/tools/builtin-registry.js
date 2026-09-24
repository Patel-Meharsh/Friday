import { registerTool, toolRegistryStatus } from "./tool-registry.js";
import { getBackgroundRuntimeStatus, listScheduledTasks, scheduleTask, cancelTask } from "../runtime/background-runtime.js";
import { getPermissions } from "../security/permission-manager.js";

let initialized = false;

export function initializeToolRegistry() {
  if (initialized) return toolRegistryStatus();

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
    name: "schedule_session_task",
    description: "Schedule a temporary in-process callback for a future automation workflow. It is never persisted or installed as a system service.",
    capability: "generalAI",
    execute: async ({ name = "session-task", delayMs = 0, intervalMs = null, once = true, execute }) => {
      if (typeof execute !== "function") throw new Error("This internal tool requires a callback and is intended for trusted application code.");
      return scheduleTask({ name, delayMs, intervalMs, once, execute });
    },
    input: { name: "string", delayMs: "number", intervalMs: "number|null", once: "boolean", execute: "function" },
  });

  registerTool({
    name: "cancel_session_task",
    description: "Cancel a temporary in-process background task.",
    capability: "generalAI",
    execute: async ({ taskId }) => ({ cancelled: cancelTask(taskId) }),
    input: { taskId: "string" },
  });

  initialized = true;
  return toolRegistryStatus();
}
