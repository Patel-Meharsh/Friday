import OpenAI from "openai";
import { assertPermission } from "../security/permission-manager.js";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function analyzeImageData({ dataUrl, prompt }) {
  await assertPermission("imageUnderstanding", { reason: "Web UI image attachment" });

  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured.");
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    throw new Error("Please attach a supported image file.");
  }
  if (dataUrl.length > 12_000_000) throw new Error("Image is too large for the web uploader. Please use an image under about 8 MB.");

  const userPrompt = String(prompt || "Analyze this image carefully. Explain what you see and help me with it.").trim();
  const response = await client.chat.completions.create({
    model: process.env.FRIDAY_VISION_MODEL_ID || "qwen/qwen3.8-27b",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: userPrompt },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    }],
  });

  return response.choices?.[0]?.message?.content || "I couldn't extract a useful answer from that image.";
}
