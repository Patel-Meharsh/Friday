import { tool } from "@openai/agents";
import { z } from "zod";

export const currentTimeTool = tool({
  name: "get_current_time",
  description: "Get the current local date and time of the machine running Friday.",
  parameters: z.object({}),
  execute: async () => {
    return new Date().toString();
  },
});
