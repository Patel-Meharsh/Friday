import process from "node:process";
import { audit } from "../security/audit-log.js";

let heartbeatTimer = null;
let stopping = false;

export async function startBackgroundRuntime({ intervalMs = 60_000 } = {}) {
  if (heartbeatTimer) return;

  stopping = false;
  await audit("background_runtime_started", { pid: process.pid, intervalMs });

  heartbeatTimer = setInterval(async () => {
    if (stopping) return;
    try {
      await audit("background_runtime_heartbeat", { pid: process.pid });
    } catch (error) {
      console.error(`FRIDAY runtime audit error: ${error.message}`);
    }
  }, intervalMs);

  heartbeatTimer.unref?.();
}

export async function stopBackgroundRuntime(reason = "normal") {
  stopping = true;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  await audit("background_runtime_stopped", { reason, pid: process.pid });
}

export function getBackgroundRuntimeStatus() {
  return {
    enabled: true,
    running: Boolean(heartbeatTimer),
    pid: process.pid,
    mode: "user-process",
    autoStart: false,
    elevated: false,
    networkExposure: "localhost-only",
  };
}
