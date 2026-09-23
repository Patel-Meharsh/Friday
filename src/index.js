import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import OpenAI from "openai";
import { run } from "@openai/agents";
import { fridayAgent } from "./agent/friday.js";
import { startDeviceServer } from "./device-server.js";

if (!process.env.GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY. Add it to a local .env file.");
  process.exit(1);
}

process.env.OPENAI_API_KEY = process.env.GROQ_API_KEY;
process.env.OPENAI_BASE_URL = "https://api.groq.com/openai/v1";

const deviceServer = startDeviceServer();
const rl = readline.createInterface({ input, output });
const visionClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

async function readMultilinePrompt(firstLine) {
  const lines = [];
  if (firstLine?.trim()) lines.push(firstLine);
  console.log("Friday: Paste the rest of the problem. Type END on a new line when finished.\n");

  while (true) {
    const line = await rl.question("");
    if (line.trim() === "END") break;
    lines.push(line);
  }

  return lines.join("\n").trim();
}

function imageMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return types[ext];
}

async function analyzeImage(filePath, prompt = "Analyze this image carefully. If it contains code, an error, a programming problem, an MCQ, or a screenshot of a technical issue, explain what it shows and solve or debug it. If important text is visible, transcribe the relevant text before answering.") {
  const resolvedPath = path.resolve(filePath.trim().replace(/^['"]|['"]$/g, ""));
  const mimeType = imageMimeType(resolvedPath);
  if (!mimeType) throw new Error("Unsupported image type. Use JPG, JPEG, PNG, WEBP, or GIF.");

  const image = await fs.readFile(resolvedPath);
  if (image.length > 20 * 1024 * 1024) {
    throw new Error("Image is larger than Groq's 20 MB image-input limit.");
  }

  const base64 = image.toString("base64");
  const response = await visionClient.chat.completions.create({
    model: "qwen/qwen3.8-27b",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      },
    ],
  });

  return response.choices?.[0]?.message?.content || "I couldn't extract a useful answer from that image.";
}

console.log("\nFRIDAY v0.6 is online.");
console.log("AI provider: Groq");
console.log("General AI core: enabled");
console.log("Multiline problems: enabled");
console.log("Image understanding: enabled");
console.log("Memory: enabled");
console.log("Device server: enabled");
console.log("\nCommands: paste | image <path> | exit\n");

try {
  while (true) {
    const message = await rl.question("You: ");
    const trimmed = message.trim();
    const lower = trimmed.toLowerCase();

    if (lower === "exit") {
      console.log("Friday: Shutting down. Goodbye.");
      break;
    }

    if (!trimmed) continue;

    try {
      let prompt = trimmed;

      if (lower === "paste" || lower === "solve:" || lower === "explain:" || lower === "debug:") {
        const mode = lower === "paste" ? "Solve/analyze this problem and provide the most appropriate explanation and solution." : trimmed.slice(0, -1);
        const body = await readMultilinePrompt("");
        if (!body) continue;
        prompt = `${mode}\n\n${body}`;
      } else if (lower.startsWith("image ")) {
        const imagePath = trimmed.slice(6).trim();
        console.log("Friday: Analyzing image...\n");
        const answer = await analyzeImage(imagePath);
        console.log(`Friday: ${answer}\n`);
        continue;
      }

      const result = await run(fridayAgent, prompt, { tracingDisabled: true });
      console.log(`Friday: ${result.finalOutput}\n`);
    } catch (error) {
      console.error(`Friday: ${error.message || "I encountered an error while processing that request."}`);
    }
  }
} finally {
  rl.close();
  deviceServer.close();
}
