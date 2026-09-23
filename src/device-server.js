import http from "node:http";
import crypto from "node:crypto";

const port = Number(process.env.FRIDAY_DEVICE_SERVER_PORT || 3030);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enrollmentToken = process.env.FRIDAY_DEVICE_ENROLLMENT_TOKEN;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function requireConfig() {
  if (!supabaseUrl || !supabaseKey || !enrollmentToken) {
    throw new Error("Device server requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and FRIDAY_DEVICE_ENROLLMENT_TOKEN.");
  }
}

function tokensMatch(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function supabaseRequest(path, options = {}) {
  requireConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase device request failed (${response.status}): ${body}`);
  }

  return response.status === 204 ? null : response.json();
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw new Error("Request body too large.");
  }
  return raw ? JSON.parse(raw) : {};
}

function getBearerToken(request) {
  const value = request.headers.authorization || "";
  if (!value.startsWith("Bearer ")) return null;
  return value.slice("Bearer ".length).trim();
}

async function registerDevice(request, response) {
  const providedEnrollmentToken = request.headers["x-friday-enrollment-token"];
  if (!providedEnrollmentToken || !tokensMatch(providedEnrollmentToken, enrollmentToken)) {
    return sendJson(response, 401, { error: "Invalid enrollment token." });
  }

  const body = await readJson(request);
  const required = ["deviceId", "userId", "deviceName", "platform", "architecture", "agentVersion"];
  for (const field of required) {
    if (!body[field]) return sendJson(response, 400, { error: `Missing ${field}.` });
  }

  const deviceToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(deviceToken);

  await supabaseRequest("friday_devices", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      device_id: body.deviceId,
      user_id: body.userId,
      device_name: body.deviceName,
      platform: body.platform,
      architecture: body.architecture,
      agent_version: body.agentVersion,
      token_hash: tokenHash,
      online: true,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  return sendJson(response, 200, { deviceToken });
}

async function heartbeat(request, response) {
  const deviceToken = getBearerToken(request);
  if (!deviceToken) return sendJson(response, 401, { error: "Missing device token." });

  const tokenHash = hashToken(deviceToken);
  const rows = await supabaseRequest(`friday_devices?token_hash=eq.${encodeURIComponent(tokenHash)}&select=device_id`);
  if (!rows.length) return sendJson(response, 401, { error: "Invalid device token." });

  const body = await readJson(request);
  const deviceId = rows[0].device_id;

  await supabaseRequest(`friday_devices?device_id=eq.${encodeURIComponent(deviceId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      online: true,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(body.agentVersion ? { agent_version: body.agentVersion } : {}),
    }),
  });

  return sendJson(response, 200, { ok: true, deviceId });
}

export function startDeviceServer() {
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        return sendJson(response, 200, { ok: true, service: "friday-device-server" });
      }
      if (request.method === "POST" && request.url === "/api/devices/register") return await registerDevice(request, response);
      if (request.method === "POST" && request.url === "/api/devices/heartbeat") return await heartbeat(request, response);
      return sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      console.error("Device server error:", error.message);
      return sendJson(response, 500, { error: "Device server error." });
    }
  });

  server.listen(port, () => console.log(`Device server listening on http://localhost:${port}`));
  return server;
}
