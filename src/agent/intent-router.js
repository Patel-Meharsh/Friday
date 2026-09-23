const CODING_PATTERNS = [
  /leetcode/i, /codewars/i, /hackerrank/i, /coderbyte/i,
  /write (a|the) (function|program|class|query|code)/i,
  /implement/i, /coding problem/i, /programming problem/i,
  /algorithm/i, /data structure/i, /sql query/i,
  /html|css|javascript|typescript|python|c#|java|c\+\+|c\+\+|php|golang|rust/i,
];

const DEBUG_PATTERNS = [
  /\berror\b/i, /exception/i, /stack trace/i, /not working/i,
  /doesn't work/i, /does not work/i, /why (does|is|isn't|is not)/i,
  /fix (this|my|the) (code|bug|error)/i, /debug/i, /unexpected/i,
];

const EXPLAIN_PATTERNS = [
  /\bexplain\b/i, /what does this mean/i, /how does this work/i,
  /why does this work/i, /teach me/i, /help me understand/i,
  /difference between/i, /what is the difference/i,
];

const RESEARCH_PATTERNS = [
  /\blatest\b/i, /\btoday\b/i, /\bcurrent\b/i, /\brecent\b/i,
  /\bnews\b/i, /\bresearch\b/i, /\bsearch\b/i, /\blook up\b/i,
  /\bbrowse\b/i, /\bsource(s)?\b/i, /according to/i, /official documentation/i,
];

const EXECUTION_PATTERNS = [
  /run this/i, /execute this/i, /test this/i, /verify this/i,
  /calculate/i, /compute/i, /benchmark/i, /simulate/i,
];

const MCQ_PATTERNS = [
  /multiple choice/i, /\bmcq\b/i, /which (of the following|option)/i,
  /choose the correct/i, /select the correct/i, /options?:/i,
];

export function detectIntent(text, defaultLanguage = null) {
  const value = String(text ?? "");
  const lower = value.toLowerCase();

  if (RESEARCH_PATTERNS.some((p) => p.test(value))) return { intent: "research", confidence: "high" };
  if (EXECUTION_PATTERNS.some((p) => p.test(value))) return { intent: "execute", confidence: "high" };
  if (DEBUG_PATTERNS.some((p) => p.test(value))) return { intent: "debug", confidence: "high" };
  if (EXPLAIN_PATTERNS.some((p) => p.test(value))) return { intent: "explain", confidence: "high" };
  if (MCQ_PATTERNS.some((p) => p.test(value))) return { intent: "mcq", confidence: "high" };
  if (CODING_PATTERNS.some((p) => p.test(value))) return { intent: "solve", confidence: "high", language: defaultLanguage };

  // Strong signs of a pasted coding challenge even when the title/language is absent.
  const hasConstraints = /constraints?:/i.test(value);
  const hasExamples = /examples?:/i.test(value) || /input\s*[:=].*output\s*[:=]/is.test(value);
  const hasComplexity = /o\s*\(\s*log|o\s*\(\s*n|time complexity|space complexity/i.test(value);
  if ((hasConstraints && hasExamples) || (hasExamples && hasComplexity)) {
    return { intent: "solve", confidence: "medium", language: defaultLanguage };
  }

  // If a session language exists and the content looks like source code, treat it as coding help.
  if (defaultLanguage && (/[{};]/.test(value) || /function\s+\w+\s*\(/i.test(value))) {
    return { intent: "solve", confidence: "medium", language: defaultLanguage };
  }

  return { intent: "conversation", confidence: "normal" };
}

export function buildNaturalIntentPrompt(content, defaultLanguage = null) {
  const detected = detectIntent(content, defaultLanguage);
  const language = defaultLanguage ? `The session default language is ${defaultLanguage}.` : "No session default language is set.";
  return `FRIDAY NATURAL INTENT ROUTING\nDetected intent: ${detected.intent}\n${language}\n\nThe user supplied the content below without necessarily using a command. Respond to the user's likely intent directly. If it is a coding problem, solve it in the detected/session language when possible; if no language can be inferred, ask which language they want. If it is a debugging task, debug it. If it is an explanation request, explain it. If it is an MCQ, answer it. If it is research/current information, use web tools when available. Do not ask the user to type another command merely to repeat the same request.\n\nCONTENT:\n${content}`;
}
