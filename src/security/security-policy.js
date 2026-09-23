const SAFE_CAPABILITIES = Object.freeze({
  generalAI: true,
  webResearch: true,
  codeExecution: true,
  memory: true,
  imageUnderstanding: true,
  deviceIdentity: true,
  filesystemRead: true,
});

const RESTRICTED_CAPABILITIES = Object.freeze({
  filesystemWrite: false,
  filesystemDelete: false,
  terminal: false,
  applications: false,
  keyboard: false,
  mouse: false,
  remoteControl: false,
  admin: false,
});

export function getSecurityPolicy() {
  return {
    mode: "locked-down-user",
    network: "localhost-only",
    elevatedPrivileges: false,
    safe: { ...SAFE_CAPABILITIES },
    restricted: { ...RESTRICTED_CAPABILITIES },
  };
}

export function assertCapability(capability) {
  if (RESTRICTED_CAPABILITIES[capability] === false) {
    throw new Error(`Security policy denied capability: ${capability}`);
  }
  if (SAFE_CAPABILITIES[capability] !== true) {
    throw new Error(`Unknown or unavailable capability: ${capability}`);
  }
  return true;
}
