import "dotenv/config";
import readline from "node:readline";
import os from "node:os";
import { loadOrCreateDeviceIdentity } from "./device-identity.js";
import { registerDevice, sendHeartbeat } from "./cloud.js";

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

console.log("\nFRIDAY DEVICE AGENT v0.3");
console.log(`Device: ${os.hostname()}`);
console.log(`Device ID: ${identity.deviceId}`);
console.log(`User ID: ${userId}`);
console.log(`Cloud: ${cloudOnline ? "connected" : "offline"}`);
console.log("Mode: authenticated identity + heartbeat only");
console.log("Filesystem, terminal, and application control remain disabled.\n");

rl.prompt();

rl.on("line", (input) => {
  const command = input.trim().toLowerCase();

  if (command === "status") {
    console.log(JSON.stringify({
      online: true,
      cloudOnline,
      deviceId: identity.deviceId,
      userId,
      hostname: os.hostname(),
      platform: os.platform(),
      architecture: os.arch(),
      node: process.version,
      capabilities: {
        deviceIdentity: true,
        cloudConnection: cloudOnline,
        filesystem: false,
        terminal: false,
        applications: false,
      },
    }, null, 2));
  } else if (command === "heartbeat") {
    connectToFriday();
  } else if (command === "exit") {
    clearInterval(heartbeatTimer);
    console.log("FRIDAY DEVICE AGENT: shutting down.");
    rl.close();
    return;
  } else if (command) {
    console.log("Command not enabled in V0.3 device-agent prototype.");
  }

  rl.prompt();
});
