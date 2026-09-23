import { getPermissions } from "./permission-manager.js";

export function formatPermissionStatus() {
  const permissions = getPermissions();
  return Object.entries(permissions)
    .map(([name, allowed]) => `${allowed ? "ALLOW" : "DENY "}  ${name}`)
    .join("\n");
}
