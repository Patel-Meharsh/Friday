const provider = (process.env.MEMORY_PROVIDER || "local").toLowerCase();
const userId = process.env.FRIDAY_USER_ID || "meharsh";
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const table = process.env.MEMORY_TABLE || "memories";

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

function normalize(value) {
  return String(value ?? "").replace(/[\r\n]/g, " ").trim().slice(0, 2000);
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

  const response = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: { ...headers(), Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      memory: text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Memory save failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  return { saved: true };
}

export async function searchMemories(query = "", limit = 12) {
  if (!cloudReady()) return [];

  const params = new URLSearchParams();
  params.set("user_id", `eq.${userId}`);
  params.set("select", "memory,created_at");
  params.set("order", "created_at.desc");
  params.set("limit", String(Math.min(Math.max(limit, 1), 30)));

  const response = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?${params}`, {
    headers: headers(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Memory retrieval failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const rows = await response.json();
  const normalizedRows = rows.map((row) => ({
    content: typeof row.memory === "string" ? row.memory : JSON.stringify(row.memory ?? ""),
    created_at: row.created_at,
  }));

  if (!query.trim()) return normalizedRows;

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return normalizedRows
    .map((row) => ({
      row,
      score: terms.reduce(
        (score, term) => score + (row.content.toLowerCase().includes(term) ? 1 : 0),
        0
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ row }) => row);
}

export async function getMemoryContext(query = "") {
  try {
    const memories = await searchMemories(query, 12);
    if (!memories.length) return "No stored long-term memories were found.";
    return memories.map((item) => `- ${item.content}`).join("\n");
  } catch (error) {
    console.error(`Friday memory warning: ${error.message}`);
    return "Long-term memory is temporarily unavailable.";
  }
}
