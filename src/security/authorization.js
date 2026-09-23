import readline from "node:readline";
import { getPermissions, isAllowed, grantSessionPermission } from "./permission-manager.js";
import { audit } from "./audit-log.js";

const pending = new Map();
let requestCounter = 0;

export function permissionRequestStatus() {
  return [...pending.values()].map(({ id, capability, reason, createdAt }) => ({ id, capability, reason, createdAt }));
}

export async function authorizeCapability(capability, { reason = "unspecified", prompt = true } = {}) {
  if (isAllowed(capability)) return true;
  if (!prompt || !process.stdin.isTTY || !process.stdout.isTTY) {
    await audit("authorization_denied", { capability, reason, result: "non_interactive" });
    return false;
  }

  const id = `perm-${++requestCounter}`;
  pending.set(id, { id, capability, reason, createdAt: new Date().toISOString() });
  await audit("authorization_requested", { id, capability, reason });

  const answer = await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\nFriday wants permission: ${capability}\nReason: ${reason}\nAllow for this session? [y/N]: `, (value) => {
      rl.close();
      resolve(value.trim().toLowerCase());
    });
  });

  pending.delete(id);
  if (answer === "y" || answer === "yes") {
    await grantSessionPermission(capability);
    await audit("authorization_approved", { id, capability, reason, scope: "session" });
    return true;
  }

  await audit("authorization_denied", { id, capability, reason, result: "user_denied" });
  return false;
}
