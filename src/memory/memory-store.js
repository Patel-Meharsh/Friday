const provider = (process.env.MEMORY_PROVIDER || "cloud").toLowerCase();
const userId = process.env.FRIDAY_USER_ID || "meharsh";
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const table = process.env.MEMORY_TABLE || "friday_memory";

const emptyMemory = {
  user: { preferredName: null },
  facts: [],
  preferences: {},
  chatHistory: [],
};

function cloudReady() {
  return provider === "cloud" && Boolean(supabaseUrl && serviceRoleKey);
}

function headers() {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function normalize(value, max = 2000) {
  return String(value ?? "").replace(/[\r\n]/g, " ").trim().slice(0, max);
}

function cloneMemory(memory) {
  return JSON.parse(JSON.stringify(memory || emptyMemory));
}

async function getCloudMemory() {
  if (!cloudReady()) return cloneMemory(emptyMemory);

  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    select: "memory,updated_at",
    limit: "1",
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?${params}`, {
    headers: headers(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Memory retrieval failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const rows = await response.json();
  return rows.length ? { ...cloneMemory(emptyMemory), ...(rows[0].memory || {}) } : cloneMemory(emptyMemory);
}

async function putCloudMemory(memory) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      ...headers(),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      memory,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Memory save failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}

export function memoryStatus() {
  return {
    provider,
    cloudConfigured: cloudReady(),
    userId,
    table,
  };
}

export async function saveMemory(content, _metadata = {}) {
  const text = normalize(content);
  if (!text) return { saved: false, reason: "empty" };
  if (!cloudReady()) return { saved: false, reason: "cloud_memory_not_configured" };

  const memory = await getCloudMemory();
  const lower = text.toLowerCase();

  const nameMatch = text.match(/\b(?:my name is|call me|i am)\s+([a-z][a-z .'-]{1,80})/i);
  if (nameMatch) {
    memory.user.preferredName = nameMatch[1].trim().replace(/[.!?]+$/, "");
  }

  if (!nameMatch && !memory.facts.some((fact) => String(fact).toLowerCase() === lower)) {
    memory.facts.unshift(text);
  }

  memory.facts = memory.facts.slice(0, 100);
  await putCloudMemory(memory);
  return { saved: true };
}

export async function saveChatMessage(role, content) {
  if (!cloudReady()) return { saved: false, reason: "cloud_memory_not_configured" };
  const normalizedRole = role === "assistant" ? "assistant" : "user";
  const text = normalize(content, 12000);
  if (!text) return { saved: false, reason: "empty" };

  const memory = await getCloudMemory();
  memory.chatHistory = Array.isArray(memory.chatHistory) ? memory.chatHistory : [];
  memory.chatHistory.push({ role: normalizedRole, content: text, createdAt: new Date().toISOString() });
  // Keep a useful persistent history without allowing the memory row to grow forever.
  memory.chatHistory = memory.chatHistory.slice(-200);
  await putCloudMemory(memory);
  return { saved: true };
}

export async function getChatHistory(limit = 100) {
  if (!cloudReady()) return [];
  const memory = await getCloudMemory();
  return (Array.isArray(memory.chatHistory) ? memory.chatHistory : []).slice(-Math.max(1, Math.min(limit, 200)));
}

export async function searchMemories(query = "", limit = 12) {
  if (!cloudReady()) return [];

  const memory = await getCloudMemory();
  const rows = [];

  if (memory.user?.preferredName) {
    rows.push({ content: `The user's preferred name is ${memory.user.preferredName}.`, created_at: null });
  }

  for (const fact of memory.facts || []) {
    rows.push({ content: String(fact), created_at: null });
  }

  const preferences = memory.preferences || {};
  for (const [key, value] of Object.entries(preferences)) {
    rows.push({ content: `User preference: ${key} = ${String(value)}`, created_at: null });
  }

  if (!query.trim()) return rows.slice(0, limit);

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return rows
    .map((row) => ({
      row,
      score: terms.reduce((score, term) => score + (row.content.toLowerCase().includes(term) ? 1 : 0), 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => row);
}

export async function getMemoryContext(query = "") {
  try {
    const memory = await getCloudMemory();
    const memories = await searchMemories(query, 12);

    const identity = memory.user?.preferredName
      ? `User identity: preferred name is ${memory.user.preferredName}.`
      : "User identity: preferred name is not known yet.";

    if (!memories.length) return identity;
    return `${identity}\n${memories.map((item) => `- ${item.content}`).join("\n")}`;
  } catch (error) {
    console.error(`Friday memory warning: ${error.message}`);
    return "Long-term memory is temporarily unavailable.";
  }
}
