import { registerTool } from "../tools/tool-registry.js";
import { notify } from "./notifications.js";
import { scheduleNotification, cancelScheduledNotification, listNotificationSchedules } from "./scheduler.js";
import { understandScreen } from "./screen-understanding.js";
import { moveMouse, clickMouse, typeText, pressKey } from "./windows-automation.js";

let registered = false;

export function registerAutomationTools() {
  if (registered) return;

  registerTool({
    name: "notify",
    description: "Show a local desktop notification. Disabled by default until the user grants notification permission for the session.",
    capability: "notifications",
    input: { title: "string", message: "string", silent: "boolean" },
    execute: notify,
  });

  registerTool({
    name: "schedule_notification",
    description: "Schedule a local desktop notification in the current Friday session.",
    capability: "notifications",
    input: { title: "string", message: "string", delayMs: "number", intervalMs: "number|null", once: "boolean", silent: "boolean" },
    execute: scheduleNotification,
  });

  registerTool({
    name: "cancel_scheduled_notification",
    description: "Cancel a previously scheduled notification by task ID.",
    capability: "notifications",
    input: { taskId: "string" },
    execute: ({ taskId }) => cancelScheduledNotification(taskId),
  });

  registerTool({
    name: "list_scheduled_notifications",
    description: "List notification schedules currently active in this Friday session.",
    capability: "generalAI",
    execute: async () => listNotificationSchedules(),
  });

  registerTool({
    name: "understand_screen",
    description: "Capture the visible Windows desktop and use vision to explain what is on screen. Disabled by default until explicitly granted.",
    capability: "screenUnderstanding",
    input: { prompt: "string" },
    execute: understandScreen,
  });

  registerTool({
    name: "move_mouse",
    description: "Move the Windows mouse cursor. Disabled by default until explicitly granted.",
    capability: "mouse",
    input: { x: "integer", y: "integer" },
    execute: moveMouse,
  });

  registerTool({
    name: "click_mouse",
    description: "Click the Windows mouse. Disabled by default until explicitly granted.",
    capability: "mouse",
    input: { button: "left|right|middle", clicks: "1|2" },
    execute: clickMouse,
  });

  registerTool({
    name: "type_text",
    description: "Type non-secret text into the currently focused Windows application. No keystrokes are recorded. Disabled by default until explicitly granted.",
    capability: "keyboard",
    input: { text: "string" },
    execute: typeText,
  });

  registerTool({
    name: "press_key",
    description: "Press a safe navigation/function key. No keylogging is implemented. Disabled by default until explicitly granted.",
    capability: "keyboard",
    input: { key: "string" },
    execute: pressKey,
  });

  registered = true;
}
