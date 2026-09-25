import { registerTool } from "./tool-registry.js";
import { getMemoryContext, saveMemory } from "../memory/memory-store.js";
import { liveWebLookup, liveNewsLookup, liveWeatherLookup } from "./web-research.js";
import { getPermissions, isKnownCapability } from "../security/permission-manager.js";

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
    name: "get_permission_status",
    description: "Check whether a Friday capability is currently allowed for this session. Use this when the user asks whether Friday has a permission, access, or capability enabled.",
    capability: "generalAI",
    input: { capability: "string|null" },
    execute: async ({ capability = null }) => {
      const permissions = getPermissions();
      if (capability) {
        const name = String(capability).trim();
        if (!isKnownCapability(name)) return JSON.stringify({ capability: name, known: false, allowed: false });
        return JSON.stringify({ capability: name, known: true, allowed: Boolean(permissions[name]), scope: permissions[name] ? "session-or-default" : "denied" });
      }
      return JSON.stringify(permissions);
    },
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

  registerTool({
    name: "web_lookup",
    description: "Perform a live web lookup for current facts, documentation, prices, events, or other information. Returns fetched results and timestamp.",
    capability: "webResearch",
    input: { query: "string" },
    execute: async ({ query }) => JSON.stringify(await liveWebLookup(query), null, 2),
  });

  registerTool({
    name: "news_lookup",
    description: "Fetch current news results for a topic from Google News RSS.",
    capability: "webResearch",
    input: { query: "string" },
    execute: async ({ query }) => JSON.stringify(await liveNewsLookup(query), null, 2),
  });

  registerTool({
    name: "weather_lookup",
    description: "Fetch current weather for a named city or location using live Open-Meteo data.",
    capability: "webResearch",
    input: { location: "string" },
    execute: async ({ location }) => JSON.stringify(await liveWeatherLookup(location), null, 2),
  });

  initialized = true;
}
