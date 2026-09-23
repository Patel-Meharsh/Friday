import { getPermissions, isAllowed } from "./permission-manager.js";
import { resolveInsideRoot } from "./safe-path.js";

const REQUIRED_DENY = [
  "filesystemWrite",
  "filesystemDelete",
  "terminal",
  "applications",
  "keyboard",
  "mouse",
  "remoteControl",
  "admin",
];

export function runSecuritySelfTest(root = process.cwd()) {
  const permissions = getPermissions();
  const failures = [];

  for (const capability of REQUIRED_DENY) {
    if (permissions[capability] !== false || isAllowed(capability) !== false) {
      failures.push(`Restricted capability is not deny-by-default: ${capability}`);
    }
  }

  try {
    resolveInsideRoot(root, ".");
  } catch {
    failures.push("Root path validation failed for the configured root.");
  }

  try {
    resolveInsideRoot(root, "../");
    failures.push("Path traversal validation failed.");
  } catch {
    // Expected: traversal must be rejected.
  }

  return { passed: failures.length === 0, failures };
}
