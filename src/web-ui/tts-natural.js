export const FRIDAY_TTS_DEFAULT_MODEL = "eleven_flash_v2_5";

export function splitForSpeech(text, maxChars = 420) {
  const normalized = normalizeSpeechText(text);
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [normalized];
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    const part = sentence.trim();
    if (!part) continue;

    if ((current + " " + part).trim().length <= maxChars) {
      current = `${current} ${part}`.trim();
      continue;
    }

    if (current) chunks.push(current);
    if (part.length <= maxChars) {
      current = part;
      continue;
    }

    const words = part.split(/\s+/);
    current = "";
    for (const word of words) {
      if ((current + " " + word).trim().length > maxChars && current) {
        chunks.push(current);
        current = word;
      } else {
        current = `${current} ${word}`.trim();
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function normalizeSpeechText(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, "I provided the code in the chat.")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}
