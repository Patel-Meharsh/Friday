import readline from "node:readline";
import os from "node:os";
import { loadOrCreateDeviceIdentity } from "./device-identity.js";

const identity = await loadOrCreateDeviceIdentity();
const userId = process.env.FRIDAY_USER_ID || "unassigned";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "Friday Agent> ",
});

console.log("FRIDAY DEVICE AGENT v0.2");
console.log(`Device: ${os.hostname()}`);
console.log(`Device ID: ${identity.deviceId}`);
console.log(`User ID: ${userId}`);
console.log("Mode: local identity/read-only prototype");
console.log("Cloud connection is not enabled in this milestone.");
console.log("Type 'status' to inspect the agent or 'exit' to shut it down.\n");

rl.prompt();

rl.on("line", (input) => {
  const command = input.trim().toLowerCase();

  if (command === "status") {
    console.log(JSON.stringify({
      online: true,
      deviceId: identity.deviceId,
      userId,
      hostname: os.hostname(),
      platform: os.platform(),
      architecture: os.arch(),
      node: process.version,
      capabilities: {
        filesystem: false,
        terminal: false,
        applications: false,
        cloudConnection: false,
      },
    }, null, 2));
  } else if (command === "exit") {
    console.log("FRIDAY DEVICE AGENT: shutting down.");
    rl.close();
    return;
  } else if (command) {
    console.log("Command not enabled in V0.2 device-agent prototype.");
  }

  rl.prompt();
});
