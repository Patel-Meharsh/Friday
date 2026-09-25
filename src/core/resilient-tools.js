import OpenAI from "openai";
import { chooseModel } from "../agent/model-router.js";
import { detectIntent } from "../agent/intent-router.js";
import { liveWebLookup, liveNewsLookup, liveWeatherLookup } from "../tools/web-research.js";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const instructions = `You are FRIDAY, a general-purpose personal AI assistant. Understand natural-language requests without requiring command prefixes. Help with coding, debugging, SQL, HTML, CSS, Python, JavaScript, C#, Java, study, mathematics, reasoning, writing, research, current information, and everyday questions. For coding problems, use an explicit/session language or infer it from supplied code; never invent a language when it cannot be inferred. For debugging, diagnose and fix. For MCQs, answer the question. When live research data is supplied below, treat it as the current source of truth and summarize it accurately. Never claim a tool was used unless it actually ran. If a live lookup fails, clearly state that live lookup failed rather than inventing current information.`;

function isRateLimit(error) {
  return error?.status === 429 || error?.code === "rate_limit_exceeded" || error?.type === "rate_limit_exceeded";
}

function needsLiveResearch(message) {
  return /\b(weather|temperature|forecast|rain|humidity|wind|news|latest|today|current|recent|live|price|stock|exchange rate|what time is it|time right now|right now|currently|look up|search|browse|research)\b/i.test(message);
}

function isWeatherRequest(message) {
  return /\b(weather|temperature|forecast|rain|humidity|wind)\b/i.test(message);
}

function isNewsRequest(message) {
  return /\b(news|headlines|latest news|breaking)\b/i.test(message);
}

function extractWeatherLocation(message) {
  const match = message.match(/\b(?:in|for|at)\s+([A-Za-z][A-Za-z .'-]{1,80})\s*\??$/i);
  return match?.[1]?.trim() || null;
}

async function getLiveContext(message) {
  if (!needsLiveResearch(message)) return "";

  // A capability question does not need a web request.
  if (/\b(do you|can you|are you able to)\b.*\b(live data|live information|real[- ]?time data|internet access|web access)\b/i.test(message)) {
    return "LIVE CAPABILITY: Friday has live web lookup, live news lookup, and live weather lookup available through its local web-research tools.";
  }

  if (isWeatherRequest(message)) {
    const location = extractWeatherLocation(message);
    if (!location) return "LIVE WEATHER: No location was supplied. Ask the user for a city or location. Do not claim that live weather access is unavailable.";
    try {
      return `LIVE WEATHER DATA (fetched now):\n${JSON.stringify(await liveWeatherLookup(location), null, 2)}`;
    } catch (error) {
      return `LIVE WEATHER LOOKUP FAILED: ${error.message}`;
    }
  }

  try {
    if (isNewsRequest(message)) {
      return `LIVE NEWS DATA (fetched now):\n${JSON.stringify(await liveNewsLookup(message), null, 2)}`;
    }
    return `LIVE WEB DATA (fetched now):\n${JSON.stringify(await liveWebLookup(message), null, 2)}`;
  } catch (error) {
    return `LIVE WEB LOOKUP FAILED: ${error.message}`;
  }
}

export async function askWithResilientTools({ message, context = "", defaultLanguage = null }) {
  const detected = detectIntent(message, defaultLanguage);
  const routing = chooseModel(message, context ? context.split("\n\n").length : 0);
  const language = defaultLanguage ? `Session default coding language: ${defaultLanguage}.` : "No session default coding language is set.";
  const liveContext = await getLiveContext(message);
  const input = `${instructions}\n\nDetected intent: ${detected.intent}\n${language}\n\nCONVERSATION CONTEXT:\n${context || "No previous conversation."}\n\n${liveContext}\n\nCURRENT REQUEST:\n${message}`;
  const tools = [{ type: "code_interpreter", container: { type: "auto" } }];

  try {
    const response = await client.responses.create({ model: routing.model, input, tools, tool_choice: "auto", max_output_tokens: 12000 });
    return response.output_text || "I wasn't able to produce a response.";
  } catch (error) {
    if (routing.model === "openai/gpt-oss-120b" && isRateLimit(error)) {
      const fallback = await client.responses.create({ model: "openai/gpt-oss-20b", input: `${input}\n\nThe primary reasoning model is temporarily rate-limited. Continue with the fallback model.`, tools, tool_choice: "auto", max_output_tokens: 12000 });
      return fallback.output_text || "I wasn't able to produce a response.";
    }
    throw error;
  }
}
