import { tool } from "@openai/agents";
import { z } from "zod";
import { executeTool } from "./tool-registry.js";
import { registerDefaultLocalTools } from "./registry-defaults.js";

registerDefaultLocalTools();

export const fridayToolRegistryTool = tool({
  name: "friday_tool",
  description: "Use one of Friday's registered local tools when a specialized local capability is needed. Only tools already registered by Friday can run.",
  parameters: z.object({
    name: z.string().describe("Exact registered tool name."),
    inputJson: z.string().default("{}").describe("JSON object containing the tool's input arguments."),
  }),
  execute: async ({ name, inputJson }) => {
    let input = {};
    try {
      input = JSON.parse(inputJson || "{}");
    } catch {
      return "Invalid tool input JSON.";
    }
    return executeTool(name, input, { reason: "Friday agent tool request" });
  },
});
