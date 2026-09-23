import os from "node:os";
import { audit } from "./audit-log.js";
import { getSecurityPolicy } from "./security-policy.js";

let initialized = false;

export async function initializeSecurity() {
  if (initialized) return getSecurityPolicy();
  initialized = true;

  const policy = getSecurityPolicy();
  await audit("runtime_started", {
    pid: process.pid,
    user: os.userInfo().username,
    hostname: os.hostname(),
    platform: process.platform,
    node: process.version,
    mode: policy.mode,
  });

  return policy;
}

export async function shutdownSecurity(reason = "normal") {
  if (!initialized) return;
  try {
    await audit("runtime_stopped", { reason });
  } finally {
    initialized = false;
  }
}
