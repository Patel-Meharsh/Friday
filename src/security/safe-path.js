import path from "node:path";

/**
 * Resolve a path while preventing traversal outside the configured root.
 * This helper performs validation only; it does not read or write anything.
 */
export function resolveInsideRoot(root, requestedPath) {
  if (typeof root !== "string" || typeof requestedPath !== "string") {
    throw new Error("Invalid filesystem path input.");
  }

  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(rootResolved, requestedPath);
  const relative = path.relative(rootResolved, targetResolved);

  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Path is outside the configured Friday device root.");
  }

  return targetResolved;
}
