import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { run } from "@openai/agents";
import { fridayAgent } from "./agent/friday.js";

if (!process.env.GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY. Add it to a local .env file.");
  process.exit(1);
}

// Groq is OpenAI-compatible, so the Agents SDK can use Groq's endpoint.
process.env.OPENAI_API_KEY = process.env.GROQ_API_KEY;
process.env.OPENAI_BASE_URL = "https://api.groq.com/openai/v1";

const rl = readline.createInterface({ input, output });

console.log("\nFRIDAY v0.1 is online.");
console.log("AI provider: Groq");
console.log("Type 'exit' to shut down.\n");

try {
  while (true) {
    const message = await rl.question("You: ");

    if (message.trim().toLowerCase() === "exit") {
      console.log("Friday: Shutting down. Goodbye.");
      break;
    }

    if (!message.trim()) {
      continue;
    }

    try {
      const result = await run(fridayAgent, message, { tracingDisabled: true });
      console.log(`Friday: ${result.finalOutput}\n`);
    } catch (error) {
      console.error("Friday: I encountered an error while processing that request.");
      console.error(error);
    }
  }
} finally {
  rl.close();
}
