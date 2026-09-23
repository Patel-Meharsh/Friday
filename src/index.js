import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
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
const rl = readline.createInterface({ input, output, terminal: true });
const visionClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

let multilineMode = false;
let multilineLines = [];
let multilineResolve;
let multilineReject;

function readMultilinePrompt() {
  return new Promise((resolve, reject) => {
    multilineMode = true;
    multilineLines = [];
    multilineResolve = resolve;
    multilineReject = reject;
    console.log("Friday: Paste the complete problem/code now.");
    console.log("Friday: Type END on a new line when finished.\n");
  });
}

function imageMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  }[ext];
}

async function analyzeImage(filePath, prompt = "Analyze this image carefully. Determine what kind of problem it contains. If it contains code, an error, a programming problem, an MCQ, or a technical screenshot, identify the relevant language/topic when possible, explain what is shown, and solve or debug it. If the image is ambiguous, state what is missing.") {
  const resolvedPath = path.resolve(filePath.trim().replace(/^['"]|['"]$/g, ""));
  const mimeType = imageMimeType(resolvedPath);
  if (!mimeType) throw new Error("Unsupported image type. Use JPG, JPEG, PNG, WEBP, or GIF.");

  const image = await fs.readFile(resolvedPath);
  if (image.length > 20 * 1024 * 1024) {
    throw new Error("Image is larger than the 20 MB image-input limit.");
  }

  const base64 = image.toString("base64");
  const response = await visionClient.chat.completions.create({
    model: "qwen/qwen3.8-27b",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
      ],
    }],
  });

  return response.choices?.[0]?.message?.content || "I couldn't extract a useful answer from that image.";
}

function printBanner() {
  console.log("\nFRIDAY v0.6 is online.");
  console.log("AI provider: Groq");
  console.log("General AI core: enabled");
  console.log("Multiline problems: enabled");
  console.log("Image understanding: enabled");
  console.log("Adaptive problem/language detection: enabled");
  console.log("Memory: enabled");
  console.log("Device server: enabled");
  console.log("\nCommands: paste | solve: | explain: | debug: | image <path> | exit\n");
}

function buildMultilinePrompt(mode, body) {
  return `${mode}\n\nAnalyze the supplied content before answering. Automatically determine whether it is a general question, MCQ, coding problem, debugging task, SQL query, markup/style issue, or another type of problem. If it is a programming problem, infer the language from the supplied code/context when possible. If no language can be inferred, ask for the language only when it is genuinely necessary; otherwise give a language-agnostic explanation. Respect explicit language instructions if present.\n\nCONTENT:\n${body}`;
}

rl.on("line", async (line) => {
  if (multilineMode) {
    if (line.trim() === "END") {
      const body = multilineLines.join("\n").trim();
      const resolve = multilineResolve;
      multilineMode = false;
      multilineLines = [];
      multilineResolve = undefined;
      multilineReject = undefined;
      resolve(body);
    } else {
      multilineLines.push(line);
    }
    return;
  }

  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) {
    output.write("You: ");
    return;
  }

  if (lower === "exit") {
    console.log("Friday: Shutting down. Goodbye.");
    rl.close();
    return;
  }

  if (lower === "paste" || lower === "solve:" || lower === "explain:" || lower === "debug:") {
    const mode = lower === "paste" ? "Solve/analyze this" : trimmed.slice(0, -1);
    try {
      const body = await readMultilinePrompt();
      if (body) {
        const result = await run(fridayAgent, buildMultilinePrompt(mode, body), { tracingDisabled: true });
        console.log(`\nFriday: ${result.finalOutput}\n`);
      }
    } catch (error) {
      console.error(`Friday: ${error.message || "I encountered an error while processing that request."}`);
    }
    output.write("You: ");
    return;
  }

  if (lower.startsWith("image ")) {
    try {
      console.log("Friday: Analyzing image...\n");
      const answer = await analyzeImage(trimmed.slice(6));
      console.log(`Friday: ${answer}\n`);
    } catch (error) {
      console.error(`Friday: ${error.message || "I couldn't analyze that image."}\n`);
    }
    output.write("You: ");
    return;
  }

  try {
    const result = await run(fridayAgent, trimmed, { tracingDisabled: true });
    console.log(`Friday: ${result.finalOutput}\n`);
  } catch (error) {
    console.error(`Friday: ${error.message || "I encountered an error while processing that request."}`);
  }

  output.write("You: ");
});

rl.on("close", () => {
  if (multilineReject) multilineReject(new Error("Input closed while waiting for END."));
  deviceServer.close();
});

printBanner();
output.write("You: ");
