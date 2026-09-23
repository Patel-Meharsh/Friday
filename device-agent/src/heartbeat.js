export function buildHeartbeat({ identity, userId, hostname, platform, architecture, agentVersion }) {
  return {
    deviceId: identity.deviceId,
    userId,
    deviceName: hostname,
    platform,
    architecture,
    agentVersion,
    timestamp: new Date().toISOString(),
  };
}
