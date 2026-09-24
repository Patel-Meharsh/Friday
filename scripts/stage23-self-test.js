import { startBackgroundRuntime, stopBackgroundRuntime, scheduleTask, listScheduledTasks } from "../src/runtime/background-runtime.js";
import { toolRegistryStatus, getTool, executeTool } from "../src/tools/tool-registry.js";
import { getPermissions, grantSessionPermission, resetSessionPermissions } from "../src/security/permission-manager.js";

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`PASS: ${message}`);
}

try {
  await startBackgroundRuntime({ intervalMs: 60_000 });

  const registry = toolRegistryStatus();
  for (const name of [
    "notify", "schedule_notification", "cancel_scheduled_notification", "list_scheduled_notifications",
    "understand_screen", "move_mouse", "click_mouse", "type_text", "press_key",
  ]) assert(Boolean(getTool(name)), `${name} is registered`);

  const permissions = getPermissions();
  assert(permissions.notifications === false, "notifications default to deny");
  assert(permissions.screenUnderstanding === false, "screen understanding defaults to deny");
  assert(permissions.keyboard === false, "keyboard defaults to deny");
  assert(permissions.mouse === false, "mouse defaults to deny");

  let ran = false;
  const task = scheduleTask({ name: "stage23-self-test", delayMs: 1_000, once: true, execute: async () => { ran = true; } });
  assert(Boolean(task.id), "automation task receives an id");
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  assert(ran, "automation task executes");
  assert(listScheduledTasks().length === 0, "one-shot task cleans itself up");

  await grantSessionPermission("notifications");
  assert(getPermissions().notifications === true, "notification permission can be granted for the session");
  await resetSessionPermissions();
  assert(getPermissions().notifications === false, "session permissions reset cleanly");

  console.log(`\nStage #23 self-test complete: ${passed} checks passed.`);
} finally {
  await resetSessionPermissions();
  await stopBackgroundRuntime("stage23_self_test");
}
