import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import OpenAI from "openai";
import { run } from "@openai/agents";
import { createFridayAgent } from "./agent/create-friday-agent.js";
import { chooseModel } from "./agent/model-router.js";
import { askWithBuiltInTools } from "./core/tool-enabled.js";
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
  baseURL: "https://api.groq.com/groq/v1",
});

let multilineMode = false;
let multilineLines = [];
let multilineResolve;
let multilineReject;
let defaultLanguage = null;
const conversation = [];
const MAX_CONTEXT_MESSAGES = 16;

function rememberConversation(role, content) {
  conversation.push({ role, content });
  if (conversation.length > MAX_CONTEXT_MESSAGES) {
    conversation.splice(0, conversation.length - MAX_CONTEXT_MESSAGES);
  }
}

function conversationContext() {
  return conversation
    .map((item) => `${item.role === "user" ? "User" : "Friday"}: ${item.content}`)
    .join("\n\n");
}

function shouldUseBuiltInTools(message) {
  const text = message.toLowerCase();
  const webSignals = [
    "latest", "today", "current", "recent", "news", "search", "look up",
    "research", "browse", "website", "web", "online", "what happened",
    "price", "weather", "documentation", "docs", "release", "released",
    "version", "update", "source", "sources", "according to",
  ];
  const codeSignals = [
    "run this", "execute this", "test this", "calculate", "compute", "verify",
    "data analysis", "plot", "simulate", "benchmark", "does this code work",
  ];
  return webSignals.some((signal) => text.includes(signal))
    || codeSignals.some((signal) => text.includes(signal));
}

async function askFriday(message, forceTools = false) {
  const context = conversationContext();
  const useTools = forceTools || shouldUseBuiltInTools(message);
  let answer;

  if (useTools) {
    answer = await askWithBuiltInTools({ message, context, defaultLanguage });
  } else {
    const routing = chooseModel(message, conversation.length);
    const preference = defaultLanguage
      ? `\nCurrent session coding-language preference: ${defaultLanguage}. Use it for ambiguous programming problems unless the user explicitly requests another language.`
      : "\nNo default coding language has been selected for this session. Never invent one for an ambiguous programming problem.";
    const prompt = `You are continuing an ongoing conversation. Use the context below naturally. Do not repeat it back to the user.${preference}\n\nCONVERSATION CONTEXT:\n${context || "No previous conversation."}\n\nCURRENT USER MESSAGE:\n${message}`;
    const agent = createFridayAgent(routing.model);
    const result = await run(agent, prompt, { tracingDisabled: true });
    answer = result.finalOutput || "I wasn't able to produce a response.";
  }

  rememberConversation("user", message);
  rememberConversation("assistant", answer);
  return answer;
}

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
  if (image.length > 20 * 1024 * 1024) throw new Error("Image is larger than the 20 MB image-input limit.");

  const base64 = image.toString("base64");
  const response = await visionClient.chat.completions.create({
    model: "qwen/qwen3.8-27b",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `${prompt}${defaultLanguage ? `\nIf code is present and the language is not explicit, prefer ${defaultLanguage}.` : ""}` },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
      ],
    }],
  });

  return response.choices?.[0]?.message?.content || "I couldn't extract a useful answer from that image.";
}

function printBanner() {
  console.log("\nFRIDAY v0.8 is online.");
  console.log("AI provider: Groq");
  console.log("Adaptive model routing: enabled");
  console.log("20B: lightweight conversations | 120B: complex reasoning");
  console.log("General AI core: enabled");
  console.log("Multiline problems: enabled");
  console.log("Image understanding: enabled");
  console.log("Adaptive language detection: enabled");
  console.log("Conversational context: enabled");
  console.log("Web research: enabled");
  console.log("Secure Python execution: enabled");
  console.log("Memory: enabled");
  console.log("Device server: enabled");
  console.log("\nCommands: paste | solve: | explain: | debug: | teach: | language <name> | web: | run: | image <path> | exit\n");
}

function buildMultilinePrompt(mode, body) {
  const languageHint = defaultLanguage
    ? `\nThe user's current default coding language is ${defaultLanguage}. Use it if the supplied programming problem does not specify another language.`
    : "\nNo default coding language is set. If this is an implementation problem and the language cannot be inferred, ask which language they want instead of choosing one arbitrarily.";
  return `${mode}\n\nAnalyze the supplied content before answering. Determine whether it is a general question, MCQ, coding problem, debugging task, SQL query, markup/style issue, or another type of problem.${languageHint}\nIf it is a programming problem, infer the language from supplied code/context when possible. Respect explicit language instructions. For solve requests, give a practical solution rather than an unnecessarily long academic essay.\n\nCONTENT:\n${body}`;
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
  if (lower.startsWith("language ")) {
    defaultLanguage = trimmed.slice("language ".length).trim() || null;
    console.log(defaultLanguage
      ? `Friday: Got it. I'll use ${defaultLanguage} as your default coding language for this session.\n`
      : "Friday: No default coding language is set.\n");
    output.write("You: ");
    return;
  }
  if (lower === "web:" || lower === "run:") {
    try {
      const body = await readMultilinePrompt();
      if (body) {
        const instruction = lower === "web:"
          ? `Research this request using current web information. Cite useful sources.\n\n${body}`
          : `Use the secure Python execution tool to verify or execute the following when appropriate. Show the relevant result and explain it.\n\n${body}`;
        const answer = await askFriday(instruction, true);
        console.log(`\nFriday: ${answer}\n`);
      }
    } catch (error) {
      console.error(`Friday: ${error.message || "The request failed."}`);
    }
    output.write("You: ");
    return;
  }
  if (lower === "paste" || lower === "solve:" || lower === "explain:" || lower === "debug:" || lower === "teach:") {
    const mode = lower === "paste" ? "Inspect and help with this" : trimmed.slice(0, -1);
    try {
      const body = await readMultilinePrompt();
      if (body) {
        const answer = await askFriday(buildMultilinePrompt(mode, body));
        console.log(`\nFriday: ${answer}\n`);
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
      rememberConversation("user", `[Image provided: ${trimmed.slice(6)}]`);
      rememberConversation("assistant", answer);
      console.log(`Friday: ${answer}\n`);
    } catch (error) {
      console.error(`Friday: ${error.message || "I couldn't analyze that image."}\n`);
    }
    output.write("You: ");
    return;
  }
  try {
    const answer = await askFriday(trimmed);
    console.log(`Friday: ${answer}\n`);
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
