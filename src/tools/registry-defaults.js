import { registerTool } from "./tool-registry.js";
import { getMemoryContext, saveMemory } from "../memory/memory-store.js";

let initialized = false;

export function registerDefaultLocalTools() {
  if (initialized) return;

  registerTool({
    name: "calculator",
    description: "Safely evaluate a basic arithmetic expression.",
    capability: "generalAI",
    input: { expression: "string" },
    execute: async ({ expression }) => {
      const text = String(expression ?? "").trim();
      if (!/^[0-9+\-*/().\s]+$/.test(text)) throw new Error("Only basic arithmetic operators are allowed.");
      const value = Function(`\"use strict\"; return (${text})`)();
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("The expression did not produce a finite number.");
      return value;
    },
  });

  registerTool({
    name: "get_current_time",
    description: "Get the current date and time from the machine running Friday.",
    capability: "generalAI",
    execute: async () => new Date().toString(),
  });

  registerTool({
    name: "remember",
    description: "Save a personal fact when the user explicitly asks Friday to remember it.",
    capability: "memory",
    input: { fact: "string" },
    execute: async ({ fact }) => saveMemory(fact, { source: "tool_registry" }),
  });

  registerTool({
    name: "recall_memory",
    description: "Retrieve relevant long-term memory from Friday's configured cloud memory.",
    capability: "memory",
    input: { query: "string" },
    execute: async ({ query = "" }) => getMemoryContext(query),
  });

  initialized = true;
}
