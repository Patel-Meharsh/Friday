import crypto from "node:crypto";

export function createDeviceToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashDeviceToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
