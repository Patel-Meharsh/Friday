import { audit } from "./audit-log.js";

export async function recordCapabilityAttempt({ capability, action, allowed, reason = "unspecified" }) {
  await audit(allowed ? "capability_allowed" : "capability_denied", {
    capability,
    action,
    allowed,
    reason,
    timestamp: new Date().toISOString(),
  });
}

export async function recordSecurityEvent(event, details = {}) {
  await audit(event, {
    ...details,
    timestamp: new Date().toISOString(),
  });
}
