import { assertPermission } from "./permission-manager.js";
import { authorizeCapability } from "./authorization.js";
import { audit } from "./audit-log.js";

/**
 * Single enforcement point for sensitive Friday capabilities.
 * Safe capabilities can pass immediately; restricted capabilities
 * require explicit interactive authorization and are granted for the session only.
 */
export async function requireCapability(capability, { reason = "unspecified", interactive = true } = {}) {
  try {
    await assertPermission(capability, { reason });
    return true;
  } catch {
    if (!interactive) {
      await audit("capability_blocked", { capability, reason, result: "non_interactive" });
      return false;
    }

    const authorized = await authorizeCapability(capability, { reason, prompt: true });
    if (!authorized) {
      await audit("capability_blocked", { capability, reason, result: "authorization_denied" });
      return false;
    }

    return true;
  }
}

export async function withCapability(capability, action, options = {}) {
  const allowed = await requireCapability(capability, options);
  if (!allowed) throw new Error(`Permission denied: ${capability}`);
  return action();
}
