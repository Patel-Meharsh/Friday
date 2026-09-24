import { audit } from "./audit-log.js";

const DEFAULT_PERMISSIONS = Object.freeze({
  generalAI: true,
  webResearch: true,
  codeExecution: true,
  memory: true,
  imageUnderstanding: true,
  deviceIdentity: true,
  filesystemRead: true,
  filesystemWrite: false,
  filesystemDelete: false,
  terminal: false,
  applications: false,
  notifications: false,
  screenUnderstanding: false,
  keyboard: false,
  mouse: false,
  remoteControl: false,
  admin: false,
});

const sessionPermissions = new Map();

export function getPermissions() {
  const effective = { ...DEFAULT_PERMISSIONS };
  for (const [capability, allowed] of sessionPermissions) effective[capability] = allowed;
  return effective;
}

export function isKnownCapability(capability) {
  return Object.prototype.hasOwnProperty.call(DEFAULT_PERMISSIONS, capability);
}

export function isAllowed(capability) {
  if (!isKnownCapability(capability)) return false;
  return sessionPermissions.has(capability)
    ? sessionPermissions.get(capability)
    : DEFAULT_PERMISSIONS[capability];
}

export async function requestPermission(capability, { reason = "unspecified" } = {}) {
  if (!isKnownCapability(capability)) {
    await audit("permission_denied", { capability, reason, result: "unknown_capability" });
    return false;
  }

  if (isAllowed(capability)) {
    await audit("permission_allowed", { capability, reason, result: "policy" });
    return true;
  }

  await audit("permission_denied", { capability, reason, result: "deny_by_default" });
  return false;
}

export async function assertPermission(capability, options = {}) {
  const allowed = await requestPermission(capability, options);
  if (!allowed) throw new Error(`Permission denied: ${capability}`);
  return true;
}

export async function grantSessionPermission(capability) {
  if (!isKnownCapability(capability)) throw new Error(`Unknown capability: ${capability}`);
  sessionPermissions.set(capability, true);
  await audit("permission_granted_session", { capability });
}

export async function revokeSessionPermission(capability) {
  if (!isKnownCapability(capability)) return;
  sessionPermissions.set(capability, false);
  await audit("permission_revoked_session", { capability });
}

export async function resetSessionPermissions() {
  sessionPermissions.clear();
  await audit("permissions_reset", {});
}
