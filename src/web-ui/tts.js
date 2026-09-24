const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const DEFAULT_MODEL_ID = "eleven_flash_v2_5";

export function ttsStatus() {
  return {
    provider: process.env.FRIDAY_TTS_PROVIDER || "elevenlabs",
    configured: Boolean(process.env.ELEVENLABS_API_KEY && process.env.FRIDAY_TTS_VOICE_ID),
    model: process.env.FRIDAY_TTS_MODEL_ID || DEFAULT_MODEL_ID,
  };
}

export async function synthesizeSpeech(text) {
  const cleanText = normalizeSpeechText(text);
  if (!cleanText) throw new Error("There is no useful text to speak.");

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Natural TTS is not configured. Add ELEVENLABS_API_KEY to .env.");

  const voiceId = process.env.FRIDAY_TTS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = process.env.FRIDAY_TTS_MODEL_ID || DEFAULT_MODEL_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: cleanText,
      model_id: modelId,
      voice_settings: { stability: 0.48, similarity_boost: 0.78, style: 0.18, use_speaker_boost: true },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Natural TTS request failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : "."}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function normalizeSpeechText(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " I provided code for this in the chat. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}
