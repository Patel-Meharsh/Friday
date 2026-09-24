import { audit } from "../security/audit-log.js";
import { assertPermission } from "../security/permission-manager.js";

const registry = new Map();
const MAX_TOOL_TIMEOUT_MS = 30_000;

function normalizeName(name) {
  const normalized = String(name ?? "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(normalized)) {
    throw new Error("Tool names must be 2-64 characters and contain only letters, numbers, '.', '-' or '_'.");
  }
  return normalized;
}

export function registerTool({ name, description, capability = "generalAI", execute, input = {} }) {
  const id = normalizeName(name);
  if (typeof execute !== "function") throw new TypeError(`Tool '${id}' must provide an execute function.`);
  if (registry.has(id)) throw new Error(`Tool '${id}' is already registered.`);

  const definition = Object.freeze({
    name: id,
    description: String(description || "").slice(0, 500),
    capability: String(capability),
    input,
    execute,
    registeredAt: new Date().toISOString(),
  });

  registry.set(id, definition);
  return publicTool(definition);
}

export function unregisterTool(name) {
  return registry.delete(normalizeName(name));
}

export function hasTool(name) {
  return registry.has(normalizeName(name));
}

export function listTools() {
  return [...registry.values()].map(publicTool);
}

export function getTool(name) {
  return publicTool(registry.get(normalizeName(name)) || null);
}

export async function executeTool(name, input = {}, { reason = "tool request", timeoutMs = 10_000 } = {}) {
  const id = normalizeName(name);
  const definition = registry.get(id);
  if (!definition) throw new Error(`Unknown tool: ${id}`);

  await assertPermission(definition.capability, { reason: `${reason}: ${id}` });

  const safeTimeout = Math.max(100, Math.min(Number(timeoutMs) || 10_000, MAX_TOOL_TIMEOUT_MS));
  const startedAt = Date.now();
  await audit("tool_execution_started", { tool: id, capability: definition.capability });

  try {
    const result = await Promise.race([
      Promise.resolve().then(() => definition.execute(input)),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool '${id}' timed out after ${safeTimeout}ms.`)), safeTimeout)),
    ]);

    await audit("tool_execution_completed", { tool: id, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    await audit("tool_execution_failed", { tool: id, durationMs: Date.now() - startedAt, error: error?.message || String(error) });
    throw error;
  }
}

function publicTool(definition) {
  if (!definition) return null;
  return {
    name: definition.name,
    description: definition.description,
    capability: definition.capability,
    input: definition.input,
    registeredAt: definition.registeredAt,
  };
}

export function toolRegistryStatus() {
  return {
    enabled: true,
    count: registry.size,
    maxExecutionTimeoutMs: MAX_TOOL_TIMEOUT_MS,
    tools: listTools(),
  };
}
