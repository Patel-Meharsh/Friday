import { tool } from "@openai/agents";
import { z } from "zod";
import {
  addFact,
  getMemorySummary,
  getPreferredName,
  setPreferredName,
} from "../memory/store.js";

export const rememberTool = tool({
  name: "remember",
  description:
    "Save a useful personal fact or preference that the user explicitly asks Friday to remember.",
  parameters: z.object({
    fact: z.string().describe("The personal fact or preference to remember."),
  }),
  execute: async ({ fact }) => {
    await addFact(fact);
    return `I will remember this: ${fact}`;
  },
});

export const setNameTool = tool({
  name: "set_preferred_name",
  description: "Save the name the user wants Friday to call them.",
  parameters: z.object({
    name: z.string().min(1).describe("The user's preferred name."),
  }),
  execute: async ({ name }) => {
    const savedName = await setPreferredName(name);
    return `Got it. I will call you ${savedName}.`;
  },
});

export const recallMemoryTool = tool({
  name: "recall_memory",
  description:
    "Retrieve Friday's stored personal memory when the user asks what Friday remembers about them.",
  parameters: z.object({}),
  execute: async () => {
    const memory = await getMemorySummary();
    const preferredName = await getPreferredName();

    return JSON.stringify({
      preferredName,
      facts: memory.facts,
      preferences: memory.preferences,
    });
  },
});
