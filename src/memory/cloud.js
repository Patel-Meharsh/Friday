const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireCloudConfig() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Cloud memory is enabled, but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing."
    );
  }
}

function getUserId() {
  return process.env.FRIDAY_USER_ID || "local-dev-user";
}

async function request(path, options = {}) {
  requireCloudConfig();

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloud memory request failed (${response.status}): ${body}`);
  }

  return response.status === 204 ? null : response.json();
}

const emptyMemory = {
  user: { preferredName: null },
  facts: [],
  preferences: {},
};

export async function readCloudMemory() {
  const userId = getUserId();
  const rows = await request(
    `friday_memory?user_id=eq.${encodeURIComponent(userId)}&select=memory`
  );

  if (!rows.length) return structuredClone(emptyMemory);
  return rows[0].memory || structuredClone(emptyMemory);
}

export async function writeCloudMemory(memory) {
  const userId = getUserId();

  await request("friday_memory", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      user_id: userId,
      memory,
      updated_at: new Date().toISOString(),
    }),
  });
}
