import "dotenv/config";
import readline from "node:readline";
import os from "node:os";
import { loadOrCreateDeviceIdentity } from "./device-identity.js";
import { registerDevice, sendHeartbeat } from "./cloud.js";
import { getFilesystemRoot, getFileInfo, listDirectory, readTextFile } from "./filesystem.js";

let identity = await loadOrCreateDeviceIdentity();
const userId = process.env.FRIDAY_USER_ID || "unassigned";
let cloudOnline = false;

async function connectToFriday() {
  try {
    if (!identity.deviceToken) {
      identity = await registerDevice(identity);
      console.log("☁️ Device registered with Friday Cloud.");
    }

    await sendHeartbeat(identity);
    cloudOnline = true;
    console.log("♥ Device heartbeat: online");
  } catch (error) {
    cloudOnline = false;
    console.log(`⚠️ Cloud connection unavailable: ${error.message}`);
  }
}

await connectToFriday();
const heartbeatTimer = setInterval(connectToFriday, 30_000);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "Friday Agent> ",
});

console.log("\nFRIDAY DEVICE AGENT v0.4");
console.log(`Device: ${os.hostname()}`);
console.log(`Device ID: ${identity.deviceId}`);
console.log(`User ID: ${userId}`);
console.log(`Cloud: ${cloudOnline ? "connected" : "offline"}`);
console.log(`Filesystem root: ${getFilesystemRoot()}`);
console.log("Mode: authenticated identity + heartbeat + read-only filesystem");
console.log("Terminal execution, file writes, and application control remain disabled.\n");

rl.prompt();

rl.on("line", async (input) => {
  const raw = input.trim();
  const [command, ...args] = raw.split(/\s+/);
  const normalized = command?.toLowerCase();

  try {
    if (normalized === "status") {
      console.log(JSON.stringify({
        online: true,
        cloudOnline,
        deviceId: identity.deviceId,
        userId,
        hostname: os.hostname(),
        platform: os.platform(),
        architecture: os.arch(),
        node: process.version,
        filesystemRoot: getFilesystemRoot(),
        capabilities: {
          deviceIdentity: true,
          cloudConnection: cloudOnline,
          filesystemRead: true,
          filesystemWrite: false,
          terminal: false,
          applications: false,
        },
      }, null, 2));
    } else if (normalized === "ls") {
      console.log(JSON.stringify(await listDirectory(args[0] || "."), null, 2));
    } else if (normalized === "read") {
      if (!args[0]) throw new Error("Usage: read <relative-file-path>");
      console.log(await readTextFile(args[0]));
    } else if (normalized === "stat") {
      if (!args[0]) throw new Error("Usage: stat <relative-path>");
      console.log(JSON.stringify(await getFileInfo(args[0]), null, 2));
    } else if (normalized === "heartbeat") {
      await connectToFriday();
    } else if (normalized === "exit") {
      clearInterval(heartbeatTimer);
      console.log("FRIDAY DEVICE AGENT: shutting down.");
      rl.close();
      return;
    } else if (raw) {
      console.log("Command not enabled. Available: status, ls, read, stat, heartbeat, exit.");
    }
  } catch (error) {
    console.log(`⚠️ ${error.message}`);
  }

  rl.prompt();
});
