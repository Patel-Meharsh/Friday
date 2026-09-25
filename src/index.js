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
import { executeTool } from "./tools/tool-registry.js";
import { startDeviceServer } from "./device-server.js";
import { startWebUI } from "./web-ui/server.js";
import { initializeSecurity, shutdownSecurity } from "./security/runtime-security.js";
import { getPermissions, assertPermission, grantSessionPermission, revokeSessionPermission } from "./security/permission-manager.js";
import { startBackgroundRuntime, stopBackgroundRuntime, getBackgroundRuntimeStatus } from "./runtime/background-runtime.js";
import { getMemoryContext, memoryStatus, saveMemory, saveChatMessage, getChatHistory } from "./memory/memory-store.js";

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

function extractQuotedReminder(text) {
  const match = text.match(/:\s*["“](.+?)["”]\s*$/i);
  if (!match) return null;
  return { targetText: text.slice(0, match.index).trim(), message: match[1].trim() };
}

function parseReminder(message) {
  const text = String(message ?? "").trim();
  const relative = text.match(/^remind\s+me\s+in\s+(\d+)\s*(seconds?|minutes?|hours?)\s*(?:to\s+)?(?:say\s+)?["“]?(.+?)["”]?$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const multiplier = unit.startsWith("second") ? 1000 : unit.startsWith("minute") ? 60_000 : 3_600_000;
    return { message: relative[3].trim(), delayMs: amount * multiplier, once: true, displayTime: null };
  }

  const quoted = extractQuotedReminder(text);
  if (!quoted) return null;
  const target = quoted.targetText.replace(/^remind\s+me\s+(?:to\s+)?/i, "").trim();
  const reminderMessage = quoted.message;

  const recurring = target.match(/^(?:every|each)\s+(?:day|daily)\s+at\s+(.+)$/i);
  if (recurring) {
    const time = parseClock(recurring[1]);
    if (!time) throw new Error("I couldn't understand that reminder time. Use something like 8:00 AM or 20:00.");
    return { message: reminderMessage, ...delayUntilClock(time), once: false, intervalMs: 86_400_000, displayTime: formatIST(time.hour, time.minute) };
  }

  const tomorrow = target.match(/^tomorrow(?:\s+at\s+(.+))?$/i);
  if (tomorrow) {
    const time = parseClock(tomorrow[1] || "09:00");
    if (!time) throw new Error("I couldn't understand that reminder time.");
    return { message: reminderMessage, ...delayUntilClock(time, 1), once: true, displayTime: formatIST(time.hour, time.minute) };
  }

  const atTarget = target.match(/^at\s+(.+)$/i)?.[1] || target;
  const time = parseClock(atTarget);
  if (!time) return null;
  return { message: reminderMessage, ...delayUntilClock(time), once: true, displayTime: formatIST(time.hour, time.minute) };
}

function parseClock(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[.]/g, "")
    .replace(/[’']O\s*CLOCK\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?(?:\s*IST)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toUpperCase() || null;
  if (minute > 59) return null;

  if (meridiem) {
    if (hour >= 1 && hour <= 12) {
      if (meridiem === "AM") hour = hour === 12 ? 0 : hour;
      if (meridiem === "PM") hour = hour === 12 ? 12 : hour + 12;
    } else if (hour >= 13 && hour <= 23) {
      // Forgive inputs such as "13:04 P.M."; the 24-hour value already defines the time.
    } else {
      return null;
    }
  } else if (hour > 23) {
    return null;
  }

  return { hour, minute };
}

function istNowParts() {
  const parts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date());
  const result = {};
  for (const part of parts) result[part.type] = Number(part.value);
  return result;
}

function delayUntilClock({ hour, minute }, extraDays = 0) {
  const now = istNowParts();
  const targetMinutes = hour * 60 + minute;
  const nowMinutes = now.hour * 60 + now.minute;
  let days = extraDays;
  if (days === 0 && targetMinutes <= nowMinutes) days = 1;
  const target = new Date(Date.UTC(now.year, now.month - 1, now.day + days, hour, minute, 0));
  const nowUtcAsIST = Date.UTC(now.year, now.month - 1, now.day, now.hour, now.minute, now.second);
  return { delayMs: Math.max(1_000, target.getTime() - nowUtcAsIST), intervalMs: null };
}

function formatIST(hour, minute) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  return `${h}:${String(minute).padStart(2, "0")} ${suffix} IST`;
}

async function handleReminderRequest(message) {
  if (!/^remind\s+me\b/i.test(message.trim())) return null;
  const reminder = parseReminder(message);
  if (!reminder) return null;
  const task = await executeTool("schedule_notification", { title: "FRIDAY Reminder", message: reminder.message, delayMs: reminder.delayMs, intervalMs: reminder.intervalMs ?? null, once: reminder.once, silent: false }, { reason: "Natural-language reminder request" });
  const when = reminder.displayTime ? reminder.displayTime : `in ${Math.max(1, Math.round(reminder.delayMs / 1000))} seconds`;
  return `Scheduled. I’ll notify you ${when}. Task ID: ${task.id}`;
}

async function askFriday(message, forceTools = false) {
  const context = conversationContext();
  const intent = detectIntent(message, defaultLanguage);
  const useTools = forceTools || shouldUseBuiltInTools(message);
  const longTermMemory = await getMemoryContext(message);
  const memoryInstruction = `\nLONG-TERM MEMORY (persistent across sessions):\n${longTermMemory}\n\nUse stored memories naturally when relevant. Never claim you have no long-term memory if relevant memories are present. If the user asks what you remember, summarize the stored memories.`;
  let answer;
  if (useTools) {
    await assertPermission("webResearch", { reason: "Built-in research/execution tool request" });
    answer = await askWithResilientTools({ message, context: `${context}\n${memoryInstruction}`, defaultLanguage });
  } else {
    const routing = chooseModel(message, conversation.length);
    const preference = defaultLanguage ? `\nCurrent session coding-language preference: ${defaultLanguage}. Use it for ambiguous programming problems unless the user explicitly requests another language.` : "\nNo default coding language has been selected. Never invent one for an ambiguous programming problem.";
    const prompt = `You are continuing an ongoing conversation. Use the context and persistent memory below naturally. Do not repeat them back to the user.\nDetected user intent: ${intent.intent}.${preference}${memoryInstruction}\n\nCONVERSATION CONTEXT:\n${context || "No previous conversation."}\n\nCURRENT USER MESSAGE:\n${message}`;
    const result = await run(createFridayAgent(routing.model), prompt, { tracingDisabled: true });
    answer = result.finalOutput || "I wasn't able to produce a response.";
  }
  rememberConversation("user", message);
  rememberConversation("assistant", answer);
  const memory = explicitMemoryFromMessage(message);
  if (memory) {
    try { await assertPermission("memory", { reason: "Explicit user memory request" }); await saveMemory(memory, { source: "explicit_user_request" }); }
    catch (error) { console.error(`Friday memory warning: ${error.message}`); }
  }
  return answer;
}

function getStatus() {
  return {
    online: true, version: "1.3.0", provider: "Groq", defaultLanguage, conversationMessages: conversation.length,
    memory: memoryStatus(), webUI: true, deviceServer: true, security: securityPolicy, permissions: getPermissions(),
    backgroundRuntime: getBackgroundRuntimeStatus(),
    capabilities: { generalAI: true, webResearch: true, codeExecution: true, memory: true, imageUnderstanding: true, deviceAgent: true, filesystemRead: true, filesystemWrite: false, terminal: false, applications: false, notifications: getPermissions().notifications, screenUnderstanding: getPermissions().screenUnderstanding, keyboard: getPermissions().keyboard, mouse: getPermissions().mouse, remoteControl: false, admin: false },
  };
}

startWebUI({ askFriday, getStatus, getChatHistory, saveChatMessage });
await startBackgroundRuntime();

function readMultilinePrompt() {
  return new Promise((resolve, reject) => { multilineMode = true; multilineLines = []; multilineResolve = resolve; multilineReject = reject; console.log("Friday: Paste the complete content now."); console.log("Friday: Type END on a new line when finished.\n"); });
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
  await assertPermission("imageUnderstanding", { reason: "User requested image analysis" });
  const response = await visionClient.chat.completions.create({ model: "qwen/qwen3.8-27b", messages: [{ role: "user", content: [{ type: "text", text: `${prompt}${defaultLanguage ? `\nIf code is present and the language is not explicit, prefer ${defaultLanguage}.` : ""}` }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${image.toString("base64")}` } }] }] });
  return response.choices?.[0]?.message?.content || "I couldn't extract a useful answer from that image.";
}

async function handlePermissionCommand(trimmed) {
  const match = trimmed.match(/^(?:permissions?|permission)\s+(grant|allow|revoke|deny)\s+([a-zA-Z]+)$/i);
  if (!match) return false;
  const action = match[1].toLowerCase(); const capability = match[2];
  if (action === "grant" || action === "allow") await grantSessionPermission(capability); else await revokeSessionPermission(capability);
  console.log(`Friday: ${action === "grant" || action === "allow" ? "Allowed" : "Denied"} ${capability} for this session only.\n`);
  return true;
}

function printBanner() {
  console.log("\nFRIDAY v1.3 is online."); console.log("AI provider: Groq"); console.log("Adaptive model routing: enabled"); console.log("Natural intent detection: enabled"); console.log("Autonomous problem solving: enabled"); console.log("Web research + secure execution: enabled"); console.log("Memory + image understanding: enabled"); console.log("Natural neural voice: enabled");
  console.log(`Friday voice ID: ${(process.env.FRIDAY_TTS_VOICE_ID || "k35rKPuEoftGtGOjfWXj").slice(-6)}`); console.log(`Friday TTS model: ${process.env.FRIDAY_TTS_MODEL_ID || "eleven_v3"}`); console.log("Device server: enabled"); console.log("Security mode: locked-down user process"); console.log("Permission gate: deny-by-default for notifications, screen, keyboard and mouse"); console.log("Background runtime: enabled (not elevated, no auto-start installation)"); console.log(`Memory provider: ${memoryStatus().provider}${memoryStatus().cloudConfigured ? " (configured)" : " (not configured)"}`); console.log("Web UI: http://localhost:3000");
  console.log("\n#23 permissions are session-only: permission allow notifications|screenUnderstanding|keyboard|mouse"); console.log("Commands remain available as shortcuts: paste | solve: | explain: | debug: | teach: | language <name> | web: | run: | image <path> | permissions | exit\n");
}

function buildMultilinePrompt(mode, body) {
  const languageHint = defaultLanguage ? `The user's current default coding language is ${defaultLanguage}. Use it if the content does not specify another language.` : "No default coding language is set. If this is an implementation problem and the language cannot be inferred, ask which language the user wants.";
  return `${mode}\n\n${buildNaturalIntentPrompt(body, defaultLanguage)}\n${languageHint}`;
}

async function processMultiline(body, explicitMode = null) {
  if (!body) return null;
  if (explicitMode) return askFriday(buildMultilinePrompt(explicitMode, body));
  const intent = detectIntent(body, defaultLanguage); const prompt = buildNaturalIntentPrompt(body, defaultLanguage);
  if (intent.intent === "research" || intent.intent === "execute") return askFriday(prompt, true);
  return askFriday(prompt);
}

rl.on("line", async (line) => {
  if (multilineMode) {
    if (line.trim() === "END") {
      const body = multilineLines.join("\n").trim(); const resolve = multilineResolve; multilineMode = false; multilineLines = []; multilineResolve = undefined; multilineReject = undefined; resolve(body);
    } else multilineLines.push(line);
    return;
  }
  const trimmed = line.trim(); const lower = trimmed.toLowerCase();
  if (!trimmed) { output.write("You: "); return; }
  if (lower === "exit") { console.log("Friday: Shutting down. Goodbye."); await stopBackgroundRuntime("user_exit"); await shutdownSecurity("user_exit"); rl.close(); return; }
  if (lower === "permissions" || lower === "permission status") { console.log("\nFriday permission status:"); for (const [name, allowed] of Object.entries(getPermissions())) console.log(`${allowed ? "ALLOW" : "DENY "}  ${name}`); console.log(""); output.write("You: "); return; }
  if (await handlePermissionCommand(trimmed)) { output.write("You: "); return; }
  if (lower.startsWith("language ")) { defaultLanguage = trimmed.slice("language ".length).trim() || null; console.log(defaultLanguage ? `Friday: Got it. I'll use ${defaultLanguage} as your default coding language for this session.\n` : "Friday: No default coding language is set.\n"); output.write("You: "); return; }
  if (lower === "web:" || lower === "run:") {
    try { const body = await readMultilinePrompt(); if (body) { const instruction = lower === "web:" ? `Research this request using current web information and cite useful sources.\n\n${body}` : `Use secure Python execution to verify or execute the following when appropriate. Show the relevant result and explain it.\n\n${body}`; const answer = await askFriday(instruction, true); console.log(`\nFriday: ${answer}\n`); } }
    catch (error) { console.error(`Friday: ${error.message || "The request failed."}`); }
    output.write("You: "); return;
  }
  if (lower === "paste" || lower === "solve:" || lower === "explain:" || lower === "debug:" || lower === "teach:") {
    const mode = lower === "paste" ? "Inspect and help with this" : trimmed.slice(0, -1);
    try { const body = await readMultilinePrompt(); if (body) { const answer = await processMultiline(body, mode); console.log(`\nFriday: ${answer}\n`); } }
    catch (error) { console.error(`Friday: ${error.message || "I encountered an error while processing that request."}`); }
    output.write("You: "); return;
  }
  if (lower.startsWith("image ")) {
    try { console.log("Friday: Analyzing image...\n"); const answer = await analyzeImage(trimmed.slice(6)); rememberConversation("user", `[Image provided: ${trimmed.slice(6)}]`); rememberConversation("assistant", answer); console.log(`Friday: ${answer}\n`); }
    catch (error) { console.error(`Friday: ${error.message || "I couldn't analyze that image."}\n`); }
    output.write("You: "); return;
  }
  try { const reminderAnswer = await handleReminderRequest(trimmed); const answer = reminderAnswer || await askFriday(trimmed); console.log(`Friday: ${answer}\n`); }
  catch (error) { console.error(`Friday: ${error.message || "I encountered an error while processing that request."}`); }
  output.write("You: ");
});

rl.on("close", async () => { if (multilineReject) multilineReject(new Error("Input closed while waiting for END.")); await stopBackgroundRuntime("input_closed"); await shutdownSecurity("input_closed"); deviceServer.close(); });

printBanner();
output.write("You: ");
