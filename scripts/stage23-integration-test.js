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
    "schedule_recurring_notification",
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
    ["schedule_recurring_notification", { title: "FRIDAY", message: "permission test", every: 1, unit: "minutes" }],
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

  const exactTimeTask = await executeTool("schedule_notification", {
    title: "FRIDAY exact-time test",
    message: "Exact clock-time integration test",
    atTime: "13:04",
    once: true,
    silent: true,
  }, { reason: "Stage #23 exact-time integration test" });
  assert(Boolean(exactTimeTask?.id), "absolute-time notification returns a task ID");

  const recurringTask = await executeTool("schedule_recurring_notification", {
    title: "FRIDAY recurring test",
    message: "Recurring-task integration test",
    every: 2,
    unit: "hours",
    silent: true,
  }, { reason: "Stage #23 recurring integration test" });
  assert(Boolean(recurringTask?.id), "recurring notification returns a task ID");
  assert(recurringTask.once === false, "recurring notification is configured as repeating");
  assert(recurringTask.intervalMs === 7_200_000, "two-hour recurring interval is 7,200,000 ms");

  const schedules = await executeTool("list_scheduled_notifications", {}, { reason: "Stage #23 integration test" });
  assert(schedules.some((item) => item.id === task.id), "one-time notification appears in active task list");
  assert(schedules.some((item) => item.id === exactTimeTask.id), "absolute-time notification appears in active task list");
  assert(schedules.some((item) => item.id === recurringTask.id), "recurring notification appears in active task list");

  for (const taskId of [task.id, exactTimeTask.id, recurringTask.id]) {
    const cancelled = await executeTool("cancel_scheduled_notification", { taskId }, { reason: "Stage #23 integration test cleanup" });
    assert(cancelled.cancelled === true, `scheduled notification ${taskId} can be cancelled`);
  }

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
