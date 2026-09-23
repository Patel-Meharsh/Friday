import fs from "node:fs/promises";
import path from "node:path";

const configuredRoot = process.env.FRIDAY_DEVICE_ROOT || path.resolve(process.cwd());

async function safePath(relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error("Only a relative path is allowed.");
  }

  const root = await fs.realpath(configuredRoot);
  const candidate = await fs.realpath(path.resolve(root, relativePath));
  const relative = path.relative(root, candidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside the configured Friday device root.");
  }

  return candidate;
}

export async function listDirectory(relativePath = ".") {
  const target = await safePath(relativePath);
  const entries = await fs.readdir(target, { withFileTypes: true });

  return entries.map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
  }));
}

export async function readTextFile(relativePath) {
  const target = await safePath(relativePath);
  const stat = await fs.stat(target);

  if (!stat.isFile()) throw new Error("The requested path is not a file.");
  if (stat.size > 64 * 1024) throw new Error("File is larger than the 64 KB read limit.");

  return fs.readFile(target, "utf8");
}

export async function getFileInfo(relativePath) {
  const target = await safePath(relativePath);
  const stat = await fs.stat(target);

  return {
    path: relativePath,
    type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

export function getFilesystemRoot() {
  return configuredRoot;
}
