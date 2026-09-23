import fs from "node:fs/promises";
import path from "node:path";

const LOG_DIR = path.resolve(".friday", "security");
const LOG_FILE = path.join(LOG_DIR, "audit.log");

function sanitize(value) {
  return String(value ?? "").replace(/[\r\n]/g, " ").slice(0, 500);
}

export async function audit(event, details = {}) {
  await fs.mkdir(LOG_DIR, { recursive: true });
  const record = {
    timestamp: new Date().toISOString(),
    event: sanitize(event),
    details: Object.fromEntries(Object.entries(details).map(([key, value]) => [key, sanitize(value)])),
  };
  await fs.appendFile(LOG_FILE, `${JSON.stringify(record)}\n`, { encoding: "utf8" });
}
