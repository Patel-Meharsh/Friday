import { registerTool } from "../tools/tool-registry.js";
import { scheduleTask, cancelTask, listScheduledTasks } from "../runtime/background-runtime.js";
import { showNotification } from "./notifications.js";
import { captureScreen, deleteTemporaryCapture } from "./screen-understanding.js";
import { assertPermission } from "../security/permission-manager.js";

let registered = false;

export function registerStage23SafeTools() {
  if (registered) return;

  registerTool({
    name: "notify",
    description: "Show a real Windows desktop notification.",
    capability: "notifications",
    input: { title: "string", message: "string" },
    execute: showNotification,
  });

  registerTool({
    name: "schedule_notification",
    description: "Schedule a Windows notification in the current Friday session.",
    capability: "notifications",
    input: { title: "string", message: "string", delayMs: "number", intervalMs: "number|null", once: "boolean" },
    execute: async ({ title = "FRIDAY", message, delayMs = 0, intervalMs = null, once = true }) => scheduleTask({
      name: `notification:${title}`,
      delayMs,
      intervalMs,
      once,
      execute: () => showNotification({ title, message }),
    }),
  });

  registerTool({
    name: "cancel_scheduled_task",
    description: "Cancel a scheduled Friday task.",
    capability: "notifications",
    input: { taskId: "string" },
    execute: async ({ taskId }) => ({ cancelled: cancelTask(taskId) }),
  });

  registerTool({
    name: "list_scheduled_tasks",
    description: "List current Friday session scheduled tasks.",
    capability: "notifications",
    execute: async () => listScheduledTasks(),
  });

  registerTool({
    name: "capture_screen",
    description: "Capture the current Windows virtual screen to a temporary PNG. The caller must delete it after analysis.",
    capability: "screenUnderstanding",
    input: {},
    execute: captureScreen,
  });

  registerTool({
    name: "delete_screen_capture",
    description: "Delete a temporary screen capture created by Friday.",
    capability: "screenUnderstanding",
    input: { path: "string" },
    execute: async ({ path }) => {
      await assertPermission("screenUnderstanding", { reason: "delete screen capture" });
      await deleteTemporaryCapture(path);
      return { deleted: true };
    },
  });

  registered = true;
}
