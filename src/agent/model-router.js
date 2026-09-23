const HEAVY_MODEL = "openai/gpt-oss-120b";
const LIGHT_MODEL = "openai/gpt-oss-20b";

const heavyPatterns = [
  /leetcode/i,
  /hard\b/i,
  /complexit(y|ies)/i,
  /algorithm/i,
  /data structure/i,
  /binary search/i,
  /dynamic programming/i,
  /graph/i,
  /recursion/i,
  /optimize/i,
  /proof/i,
  /deep(ly)? explain/i,
  /research/i,
  /compare .* in depth/i,
  /debug .* error/i,
  /stack trace/i,
  /multi[- ]step/i,
  /web:/i,
  /solve:/i,
  /debug:/i,
];

const lightPatterns = [
  /^(hi|hello|hey|good morning|good afternoon|good evening)\b/i,
  /how are you/i,
  /what time is it/i,
  /tell me a joke/i,
  /^(thanks|thank you|okay|ok|cool|great)\b/i,
  /what is \d+\s*[+\-*/x×]\s*\d+/i,
];

export function chooseModel(message, conversationSize = 0) {
  const text = String(message ?? "");

  if (heavyPatterns.some((pattern) => pattern.test(text))) {
    return { model: HEAVY_MODEL, reason: "complex reasoning/task" };
  }

  if (lightPatterns.some((pattern) => pattern.test(text)) && conversationSize < 8) {
    return { model: LIGHT_MODEL, reason: "simple conversational task" };
  }

  // Default to the lighter model to preserve the 120B quota. The agent can
  // still be explicitly routed to 120B by heavy task signals above.
  return { model: LIGHT_MODEL, reason: "general task" };
}

export { HEAVY_MODEL, LIGHT_MODEL };
