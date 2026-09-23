import readline from "node:readline";
import os from "node:os";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "Friday Agent> ",
});

console.log("FRIDAY DEVICE AGENT v0.1");
console.log(`Device: ${os.hostname()}`);
console.log("Mode: local read-only prototype");
console.log("No cloud connection or computer-control commands are enabled yet.");
console.log("Type 'status' to inspect the agent or 'exit' to shut it down.\n");

rl.prompt();

rl.on("line", (input) => {
  const command = input.trim().toLowerCase();

  if (command === "status") {
    console.log(JSON.stringify({
      online: true,
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
    console.log("Command not enabled in V0.1 device-agent prototype.");
  }

  rl.prompt();
});
