import fs from "node:fs/promises";
import path from "node:path";
import { redactSecrets } from "./redact.js";

const LOG_DIR = path.resolve(".friday", "security");
const LOG_FILE = path.join(LOG_DIR, "audit.log");

function sanitize(value) {
  return String(value ?? "").replace(/[\r\n]/g, " ").slice(0, 500);
}

function sanitizeDetails(details) {
  const redacted = redactSecrets(details);
  return Object.fromEntries(Object.entries(redacted ?? {}).map(([key, value]) => [
    sanitize(key),
    sanitize(typeof value === "object" ? JSON.stringify(value) : value),
  ]));
}

export async function audit(event, details = {}) {
  await fs.mkdir(LOG_DIR, { recursive: true, mode: 0o700 });
  const record = {
    timestamp: new Date().toISOString(),
    event: sanitize(event),
    details: sanitizeDetails(details),
  };
  await fs.appendFile(LOG_FILE, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
}
