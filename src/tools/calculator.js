import { tool } from "@openai/agents";
import { z } from "zod";

export const calculatorTool = tool({
  name: "calculator",
  description:
    "Perform basic arithmetic. Use this when the user asks you to calculate a numeric expression.",
  parameters: z.object({
    expression: z
      .string()
      .describe("A basic arithmetic expression using numbers and +, -, *, /, or parentheses."),
  }),
  execute: async ({ expression }) => {
    // V0.1 intentionally supports only a small, safe arithmetic grammar.
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
      return "I can only calculate basic arithmetic expressions in this version.";
    }

    try {
      const result = Function(`"use strict"; return (${expression})`)();

      if (typeof result !== "number" || !Number.isFinite(result)) {
        return "I could not calculate that expression.";
      }

      return String(result);
    } catch {
      return "I could not calculate that expression.";
    }
  },
});
