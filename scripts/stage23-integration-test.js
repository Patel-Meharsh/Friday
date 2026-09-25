import { registerAutomationTools } from "../src/automation/register-automation-tools.js";
import { startBackgroundRuntime, stopBackgroundRuntime } from "../src/runtime/background-runtime.js";
import { executeTool, toolRegistryStatus } from "../src/tools/tool-registry.js";
import { grantSessionPermission, resetSessionPermissions } from "../src/security/permission-manager.js";

const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

registerAutomationTools();
await startBackgroundRuntime({ intervalMs: 250 });

try {
  const names = new Set(toolRegistryStatus().tools.map((tool) => tool.name));
  for (const name of [
    "notify",
    "schedule_notification",
    "cancel_scheduled_notification",
    "list_scheduled_notifications",
    "understand_screen",
    "move_mouse",
    "click_mouse",
    "type_text",
    "press_key",
  ]) assert(names.has(name), `${name} tool registered`);

  await resetSessionPermissions();

  for (const [tool, args] of [
    ["notify", { title: "FRIDAY", message: "permission test" }],
    ["schedule_notification", { title: "FRIDAY", message: "permission test", delayMs: 1000, intervalMs: null, once: true }],
    ["understand_screen", {}],
    ["move_mouse", { x: 0, y: 0 }],
    ["click_mouse", { button: "left", clicks: 1 }],
    ["type_text", { text: "permission test" }],
    ["press_key", { key: "ENTER" }],
  ]) {
    let denied = false;
    try { await executeTool(tool, args, { reason: `Stage #23 permission test: ${tool}` }); } catch { denied = true; }
    assert(denied, `${tool} is denied before permission is granted`);
  }

  await grantSessionPermission("notifications");
  const task = await executeTool("schedule_notification", {
    title: "FRIDAY #23 test",
    message: "Scheduled-task integration test",
    delayMs: 60_000,
    intervalMs: null,
    once: true,
    silent: true,
  }, { reason: "Stage #23 integration test" });
  assert(Boolean(task?.id), "scheduled notification returns a task ID");

  const schedules = await executeTool("list_scheduled_notifications", {}, { reason: "Stage #23 integration test" });
  assert(schedules.some((item) => item.id === task.id), "scheduled notification appears in active task list");

  const cancelled = await executeTool("cancel_scheduled_notification", { taskId: task.id }, { reason: "Stage #23 integration test" });
  assert(cancelled.cancelled === true, "scheduled notification can be cancelled");

  if (process.env.STAGE23_LIVE === "1") {
    const result = await executeTool("notify", { title: "FRIDAY #23", message: "Live integration test", silent: false }, { reason: "Stage #23 live notification test" });
    assert(result.delivered === true, "live Windows notification reports delivery");
  } else {
    console.log("INFO: live notification skipped; run with STAGE23_LIVE=1 to show a real Windows notification.");
  }

  console.log("\nStage #23 integration test complete.");
} finally {
  await stopBackgroundRuntime("stage23_integration_test");
}
