import { startBackgroundRuntime, stopBackgroundRuntime, scheduleTask, listScheduledTasks } from "../src/runtime/background-runtime.js";
import { executeTool, toolRegistryStatus } from "../src/tools/tool-registry.js";

let passed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`PASS: ${message}`);
}

try {
  await startBackgroundRuntime({ intervalMs: 60_000 });

  const registry = toolRegistryStatus();
  assert(registry.enabled === true, "tool registry is enabled");
  assert(registry.tools.some((tool) => tool.name === "runtime_status"), "runtime_status tool is registered");
  assert(registry.tools.some((tool) => tool.name === "list_tools"), "list_tools tool is registered");
  assert(registry.tools.some((tool) => tool.name === "list_scheduled_tasks"), "list_scheduled_tasks tool is registered");

  const status = await executeTool("runtime_status", {}, { reason: "stage 22 self-test" });
  assert(status.runtime.running === true, "background runtime reports running");
  assert(status.runtime.elevated === false, "runtime is not elevated");
  assert(status.runtime.autoStart === false, "runtime does not install auto-start");

  let ran = false;
  const task = scheduleTask({
    name: "stage22-self-test",
    delayMs: 1_000,
    once: true,
    execute: async () => { ran = true; },
  });
  assert(Boolean(task.id), "one-shot task receives an id");
  assert(listScheduledTasks().length === 1, "scheduled task is visible");

  await new Promise((resolve) => setTimeout(resolve, 1_100));
  assert(ran === true, "scheduled task executed");
  assert(listScheduledTasks().length === 0, "one-shot task is removed after execution");

  console.log(`\nStage #22 self-test complete: ${passed} checks passed.`);
} finally {
  await stopBackgroundRuntime("stage22_self_test");
}
