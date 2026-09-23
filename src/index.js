import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import OpenAI from "openai";
import { run } from "@openai/agents";
import { createFridayAgent } from "./agent/create-friday-agent.js";
import { chooseModel } from "./agent/model-router.js";
import { detectIntent, buildNaturalIntentPrompt } from "./agent/intent-router.js";
import { askWithResilientTools } from "./core/resilient-tools.js";
import { startDeviceServer } from "./device-server.js";
import { startWebUI } from "./web-ui/server.js";
import { initializeSecurity, shutdownSecurity } from "./security/runtime-security.js";
import { getSecurityPolicy } from "./security/security-policy.js";
import { startBackgroundRuntime, stopBackgroundRuntime, getBackgroundRuntimeStatus } from "./runtime/background-runtime.js";
import { getMemoryContext, memoryStatus, saveMemory } from "./memory/memory-store.js";

if (!process.env.GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY. Add it to a local .env file.");
  process.exit(1);
}

process.env.OPENAI_API_KEY = process.env.GROQ_API_KEY;
process.env.OPENAI_BASE_URL = "https://api.groq.com/openai/v1";

const securityPolicy = await initializeSecurity();
const deviceServer = startDeviceServer();
const rl = readline.createInterface({ input, output, terminal: true });
const visionClient = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });

let multilineMode = false;
let multilineLines = [];
let multilineResolve;
let multilineReject;
let defaultLanguage = null;
const conversation = [];
const MAX_CONTEXT_MESSAGES = 16;

function rememberConversation(role, content) {
  conversation.push({ role, content });
  if (conversation.length > MAX_CONTEXT_MESSAGES) conversation.splice(0, conversation.length - MAX_CONTEXT_MESSAGES);
}

function conversationContext() {
  return conversation.map((item) => `${item.role === "user" ? "User" : "Friday"}: ${item.content}`).join("\n\n");
}

function shouldUseBuiltInTools(message) {
  const intent = detectIntent(message, defaultLanguage).intent;
  return intent === "research" || intent === "execute" || /\b(latest|today|current|recent|search|research|browse|weather|price|calculate|compute|verify|run this|execute this|test this)\b/i.test(message);
}

function explicitMemoryFromMessage(message) {
  const text = message.trim();
  if (!/\b(remember|memorize|don't forget|do not forget|keep in mind)\b/i.test(text)) return null;
  const match = text.match(/(?:remember|memorize|don't forget|do not forget)\s+(?:that\s+)?(.+)/i);
  return match?.[1]?.trim() || text;
}

async function askFriday(message, forceTools = false) {
  const context = conversationContext();
  const intent = detectIntent(message, defaultLanguage);
  const useTools = forceTools || shouldUseBuiltInTools(message);
  const longTermMemory = await getMemoryContext(message);
  const memoryInstruction = `\nLONG-TERM MEMORY (persistent across sessions):\n${longTermMemory}\n\nUse stored memories naturally when relevant. Never claim you have no long-term memory if relevant memories are present. If the user asks what you remember, summarize the stored memories.`;
  let answer;

  if (useTools) {
    answer = await askWithResilientTools({ message, context: `${context}\n${memoryInstruction}`, defaultLanguage });
  } else {
    const routing = chooseModel(message, conversation.length);
    const preference = defaultLanguage
      ? `\nCurrent session coding-language preference: ${defaultLanguage}. Use it for ambiguous programming problems unless the user explicitly requests another language.`
      : "\nNo default coding language has been selected. Never invent one for an ambiguous programming problem.";
    const prompt = `You are continuing an ongoing conversation. Use the context and persistent memory below naturally. Do not repeat them back to the user.\nDetected user intent: ${intent.intent}.${preference}${memoryInstruction}\n\nCONVERSATION CONTEXT:\n${context || "No previous conversation."}\n\nCURRENT USER MESSAGE:\n${message}`;
    const result = await run(createFridayAgent(routing.model), prompt, { tracingDisabled: true });
    answer = result.finalOutput || "I wasn't able to produce a response.";
  }

  rememberConversation("user", message);
  rememberConversation("assistant", answer);

  const memory = explicitMemoryFromMessage(message);
  if (memory) {
    try {
      await saveMemory(memory, { source: "explicit_user_request" });
    } catch (error) {
      console.error(`Friday memory warning: ${error.message}`);
    }
  }

  return answer;
}

function getStatus() {
  return {
    online: true,
    version: "1.1.0",
    provider: "Groq",
    defaultLanguage,
    conversationMessages: conversation.length,
    memory: memoryStatus(),
    webUI: true,
    deviceServer: true,
    security: securityPolicy,
    backgroundRuntime: getBackgroundRuntimeStatus(),
    capabilities: {
      generalAI: true,
      webResearch: true,
      codeExecution: true,
      memory: true,
      imageUnderstanding: true,
      deviceAgent: true,
      filesystemRead: true,
      filesystemWrite: false,
      terminal: false,
      applications: false,
      keyboard: false,
      mouse: false,
      remoteControl: false,
      admin: false,
    },
  };
}

startWebUI({ askFriday, getStatus });
await startBackgroundRuntime();

function readMultilinePrompt() {
  return new Promise((resolve, reject) => {
    multilineMode = true;
    multilineLines = [];
    multilineResolve = resolve;
    multilineReject = reject;
    console.log("Friday: Paste the complete content now.");
    console.log("Friday: Type END on a new line when finished.\n");
  });
}

function imageMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" }[ext];
}

async function analyzeImage(filePath, prompt = "Analyze this image carefully. Determine what kind of problem it contains. If it contains code, an error, a programming problem, an MCQ, or a technical screenshot, identify the relevant language/topic when possible, explain what is shown, and solve or debug it. If the image is ambiguous, state what is missing.") {
  const resolvedPath = path.resolve(filePath.trim().replace(/^['"]|['"]$/g, ""));
  const mimeType = imageMimeType(resolvedPath);
  if (!mimeType) throw new Error("Unsupported image type. Use JPG, JPEG, PNG, WEBP, or GIF.");
  const image = await fs.readFile(resolvedPath);
  if (image.length > 20 * 1024 * 1024) throw new Error("Image is larger than the 20 MB image-input limit.");
  const response = await visionClient.chat.completions.create({
    model: "qwen/qwen3.8-27b",
    messages: [{ role: "user", content: [
      { type: "text", text: `${prompt}${defaultLanguage ? `\nIf code is present and the language is not explicit, prefer ${defaultLanguage}.` : ""}` },
      { type: "image_url", image_url: { url: `data:${mimeType};base64,${image.toString("base64")}` } },
    ] }],
  });
  return response.choices?.[0]?.message?.content || "I couldn't extract a useful answer from that image.";
}

function printBanner() {
  console.log("\nFRIDAY v1.1 is online.");
  console.log("AI provider: Groq");
  console.log("Adaptive model routing: enabled");
  console.log("Natural intent detection: enabled");
  console.log("Autonomous problem solving: enabled");
  console.log("Web research + secure execution: enabled");
  console.log("Memory + image understanding: enabled");
  console.log("Device server: enabled");
  console.log("Security mode: locked-down user process");
  console.log("Background runtime: enabled (not elevated, no auto-start installation)");
  console.log(`Memory provider: ${memoryStatus().provider}${memoryStatus().cloudConfigured ? " (configured)" : " (not configured)"}`);
  console.log("Web UI: http://localhost:3000");
  console.log("\nCommands remain available as shortcuts: paste | solve: | explain: | debug: | teach: | language <name> | web: | run: | image <path> | exit\n");
}

function buildMultilinePrompt(mode, body) {
  const languageHint = defaultLanguage
    ? `The user's current default coding language is ${defaultLanguage}. Use it if the content does not specify another language.`
    : "No default coding language is set. If this is an implementation problem and the language cannot be inferred, ask which language the user wants.";
  return `${mode}\n\n${buildNaturalIntentPrompt(body, defaultLanguage)}\n${languageHint}`;
}

async function processMultiline(body, explicitMode = null) {
  if (!body) return null;
  if (explicitMode) return askFriday(buildMultilinePrompt(explicitMode, body));
  const intent = detectIntent(body, defaultLanguage);
  const prompt = buildNaturalIntentPrompt(body, defaultLanguage);
  if (intent.intent === "research" || intent.intent === "execute") return askFriday(prompt, true);
  return askFriday(prompt);
}

rl.on("line", async (line) => {
  if (multilineMode) {
    if (line.trim() === "END") {
      const body = multilineLines.join("\n").trim();
      const resolve = multilineResolve;
      multilineMode = false; multilineLines = []; multilineResolve = undefined; multilineReject = undefined; resolve(body);
    } else multilineLines.push(line);
    return;
  }

  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) { output.write("You: "); return; }
  if (lower === "exit") { console.log("Friday: Shutting down. Goodbye."); await stopBackgroundRuntime("user_exit"); await shutdownSecurity("user_exit"); rl.close(); return; }

  if (lower.startsWith("language ")) {
    defaultLanguage = trimmed.slice("language ".length).trim() || null;
    console.log(defaultLanguage ? `Friday: Got it. I'll use ${defaultLanguage} as your default coding language for this session.\n` : "Friday: No default coding language is set.\n");
    output.write("You: "); return;
  }

  if (lower === "web:" || lower === "run:") {
    try {
      const body = await readMultilinePrompt();
      if (body) {
        const instruction = lower === "web:" ? `Research this request using current web information and cite useful sources.\n\n${body}` : `Use secure Python execution to verify or execute the following when appropriate. Show the relevant result and explain it.\n\n${body}`;
        const answer = await askFriday(instruction, true);
        console.log(`\nFriday: ${answer}\n`);
      }
    } catch (error) { console.error(`Friday: ${error.message || "The request failed."}`); }
    output.write("You: "); return;
  }

  if (lower === "paste" || lower === "solve:" || lower === "explain:" || lower === "debug:" || lower === "teach:") {
    const mode = lower === "paste" ? "Inspect and help with this" : trimmed.slice(0, -1);
    try {
      const body = await readMultilinePrompt();
      if (body) { const answer = await processMultiline(body, mode); console.log(`\nFriday: ${answer}\n`); }
    } catch (error) { console.error(`Friday: ${error.message || "I encountered an error while processing that request."}`); }
    output.write("You: "); return;
  }

  if (lower.startsWith("image ")) {
    try {
      console.log("Friday: Analyzing image...\n");
      const answer = await analyzeImage(trimmed.slice(6));
      rememberConversation("user", `[Image provided: ${trimmed.slice(6)}]`); rememberConversation("assistant", answer);
      console.log(`Friday: ${answer}\n`);
    } catch (error) { console.error(`Friday: ${error.message || "I couldn't analyze that image."}\n`); }
    output.write("You: "); return;
  }

  try { const answer = await askFriday(trimmed); console.log(`Friday: ${answer}\n`); }
  catch (error) { console.error(`Friday: ${error.message || "I encountered an error while processing that request."}`); }
  output.write("You: ");
});

rl.on("close", async () => {
  if (multilineReject) multilineReject(new Error("Input closed while waiting for END."));
  await stopBackgroundRuntime("input_closed");
  await shutdownSecurity("input_closed");
  deviceServer.close();
});

printBanner();
output.write("You: ");
