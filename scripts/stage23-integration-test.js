import { startBackgroundRuntime, stopBackgroundRuntime } from "../src/runtime/background-runtime.js";
import { initializeStage23 } from "../src/stage23/init.js";
import { executeTool, toolRegistryStatus } from "../src/tools/tool-registry.js";
import { grantSessionPermission, resetSessionPermissions } from "../src/security/permission-manager.js";

const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

try {
  initializeStage23();
  await startBackgroundRuntime({ intervalMs: 60_000 });

  const names = toolRegistryStatus().tools.map((tool) => tool.name);
  assert(names.includes("notify"), "notify tool registered");
  assert(names.includes("schedule_notification"), "schedule_notification tool registered");
  assert(names.includes("cancel_scheduled_task"), "cancel_scheduled_task tool registered");
  assert(names.includes("list_scheduled_tasks"), "list_scheduled_tasks tool registered");
  assert(names.includes("capture_screen"), "capture_screen tool registered");

  await resetSessionPermissions();
  let denied = false;
  try { await executeTool("notify", { title: "FRIDAY", message: "permission test" }); } catch { denied = true; }
  assert(denied, "notification is denied before session permission is granted");

  await grantSessionPermission("notifications");
  const result = await executeTool("notify", { title: "FRIDAY #23", message: "Integration test notification" });
  assert(result.delivered === true, "Windows notification tool reports delivery");

  console.log("\nStage #23 integration test complete.");
} finally {
  await stopBackgroundRuntime("stage23_integration_test");
}
