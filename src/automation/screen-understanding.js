import OpenAI from "openai";
import fs from "node:fs/promises";
import { captureScreen, getScreenFileBytes } from "./windows-automation.js";
import { assertPermission } from "../security/permission-manager.js";
import { audit } from "../security/audit-log.js";

const client = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });

export async function understandScreen({ prompt = "Describe the visible screen. Identify relevant UI elements, errors, code, warnings, or actionable information. Do not infer private information that is not visible." } = {}) {
  await assertPermission("screenUnderstanding", { reason: "User requested screen understanding" });
  const captured = await captureScreen();
  try {
    const bytes = await getScreenFileBytes(captured.path);
    const response = await client.chat.completions.create({
      model: "qwen/qwen3.8-27b",
      messages: [{ role: "user", content: [
        { type: "text", text: String(prompt).slice(0, 2000) },
        { type: "image_url", image_url: { url: `data:image/png;base64,${bytes.toString("base64")}` } },
      ] }],
    });
    const answer = response.choices?.[0]?.message?.content || "I couldn't understand the current screen.";
    await audit("screen_understanding", { path: captured.path, promptLength: String(prompt).length });
    return { answer, screenshotPath: captured.path };
  } finally {
    await fs.unlink(captured.path).catch(() => {});
  }
}
