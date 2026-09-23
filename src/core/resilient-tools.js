import OpenAI from "openai";
import { chooseModel } from "../agent/model-router.js";
import { detectIntent } from "../agent/intent-router.js";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const instructions = `You are FRIDAY, a general-purpose personal AI assistant. Understand natural-language requests without requiring command prefixes. Help with coding, debugging, SQL, HTML, CSS, Python, JavaScript, C#, Java, study, mathematics, reasoning, writing, research, current information, and everyday questions. For coding problems, use an explicit/session language or infer it from supplied code; never invent a language when it cannot be inferred. For debugging, diagnose and fix. For MCQs, answer the question. Use web search for current/research tasks and secure Python execution for calculations, verification, and data analysis. Never claim a tool was used unless it actually ran.`;

function isRateLimit(error) {
  return error?.status === 429 || error?.code === "rate_limit_exceeded" || error?.type === "rate_limit_exceeded";
}

export async function askWithResilientTools({ message, context = "", defaultLanguage = null }) {
  const detected = detectIntent(message, defaultLanguage);
  const routing = chooseModel(message, context ? context.split("\n\n").length : 0);
  const language = defaultLanguage ? `Session default coding language: ${defaultLanguage}.` : "No session default coding language is set.";
  const input = `${instructions}\n\nDetected intent: ${detected.intent}\n${language}\n\nCONVERSATION CONTEXT:\n${context || "No previous conversation."}\n\nCURRENT REQUEST:\n${message}`;
  const tools = [{ type: "browser_search" }, { type: "code_interpreter", container: { type: "auto" } }];

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
