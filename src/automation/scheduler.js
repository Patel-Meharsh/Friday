import { scheduleTask, cancelTask, listScheduledTasks } from "../runtime/background-runtime.js";
import { notify } from "./notifications.js";
import { assertPermission } from "../security/permission-manager.js";
import { audit } from "../security/audit-log.js";

export async function scheduleNotification({ message, title = "Friday", delayMs = 0, intervalMs = null, once = true, silent = false } = {}) {
  await assertPermission("notifications", { reason: "User requested a scheduled notification" });
  const safeDelay = Math.max(0, Math.min(Number(delayMs) || 0, 2_147_483_647));
  const task = scheduleTask({
    name: `notification:${String(title).slice(0, 50)}`,
    delayMs: safeDelay,
    intervalMs,
    once,
    execute: async () => notify({ title, message, silent }),
  });
  await audit("notification_scheduled", { taskId: task.id, delayMs: safeDelay, intervalMs, once: Boolean(once) });
  return task;
}

export async function cancelScheduledNotification(taskId) {
  await assertPermission("notifications", { reason: "User requested cancellation of a scheduled notification" });
  return { cancelled: cancelTask(taskId) };
}

export function listNotificationSchedules() {
  return listScheduledTasks().filter((task) => task.name.startsWith("notification:"));
}
