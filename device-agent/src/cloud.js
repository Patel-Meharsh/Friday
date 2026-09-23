import os from "node:os";
import { saveDeviceToken } from "./device-identity.js";
import { buildHeartbeat } from "./heartbeat.js";

const coreUrl = (process.env.FRIDAY_CORE_URL || "http://localhost:3030").replace(/\/$/, "");
const enrollmentToken = process.env.FRIDAY_DEVICE_ENROLLMENT_TOKEN;
const userId = process.env.FRIDAY_USER_ID || "unassigned";
const agentVersion = "0.3.0";

async function post(path, body, headers = {}) {
  const response = await fetch(`${coreUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Friday core returned ${response.status}.`);
  return data;
}

export async function registerDevice(identity) {
  if (!enrollmentToken) throw new Error("Missing FRIDAY_DEVICE_ENROLLMENT_TOKEN in device-agent/.env.");

  const data = await post("/api/devices/register", {
    deviceId: identity.deviceId,
    userId,
    deviceName: os.hostname(),
    platform: os.platform(),
    architecture: os.arch(),
    agentVersion,
  }, {
    "X-Friday-Enrollment-Token": enrollmentToken,
  });

  if (!data.deviceToken) throw new Error("Friday core did not return a device token.");
  return saveDeviceToken(identity, data.deviceToken);
}

export async function sendHeartbeat(identity) {
  if (!identity.deviceToken) return false;

  const payload = buildHeartbeat({
    identity,
    userId,
    hostname: os.hostname(),
    platform: os.platform(),
    architecture: os.arch(),
    agentVersion,
  });

  await post("/api/devices/heartbeat", payload, {
    Authorization: `Bearer ${identity.deviceToken}`,
  });

  return true;
}
