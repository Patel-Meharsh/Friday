import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const identityPath = path.join(__dirname, "../.device-identity.json");

export async function loadOrCreateDeviceIdentity() {
  try {
    const raw = await fs.readFile(identityPath, "utf8");
    return JSON.parse(raw);
  } catch {
    const identity = {
      deviceId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    await fs.writeFile(identityPath, JSON.stringify(identity, null, 2), "utf8");
    return identity;
  }
}
