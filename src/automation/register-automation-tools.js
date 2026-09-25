import { registerTool } from "../tools/tool-registry.js";
import { notify } from "./notifications.js";
import { scheduleNotification, scheduleRecurringNotification, cancelScheduledNotification, listNotificationSchedules } from "./scheduler.js";
import { understandScreen } from "./screen-understanding.js";
import { moveMouse, clickMouse, typeText, pressKey } from "./windows-automation.js";
import { getPermissions, isKnownCapability } from "../security/permission-manager.js";

let registered = false;

export function registerAutomationTools() {
  if (registered) return;

  registerTool({
    name: "get_permission_status",
    description: "Return the current session permission state for all known Friday capabilities, or one requested capability.",
    capability: "generalAI",
    input: { capability: "string|null" },
    execute: ({ capability = null } = {}) => {
      const permissions = getPermissions();
      if (capability) {
        if (!isKnownCapability(capability)) throw new Error(`Unknown capability: ${capability}`);
        return { capability, allowed: Boolean(permissions[capability]) };
      }
      return permissions;
    },
  });

  registerTool({
    name: "notify",
    description: "Show a local desktop notification. Disabled by default until the user grants notification permission for the session.",
    capability: "notifications",
    input: { title: "string", message: "string", silent: "boolean" },
    execute: notify,
  });

  registerTool({
    name: "schedule_notification",
    description: "Schedule one local desktop notification. Supports an exact IST clock time such as 1:02 PM, 13:04, or 20:30 through atTime, or use delayMs for a relative delay.",
    capability: "notifications",
    input: { title: "string", message: "string", delayMs: "number", intervalMs: "number|null", once: "boolean", silent: "boolean", atTime: "string|null" },
    execute: scheduleNotification,
  });

  registerTool({
    name: "schedule_recurring_notification",
    description: "Schedule a repeating local desktop notification. Use every + unit (seconds, minutes, hours, days, weeks), or add atTime such as 9:00 AM for the first occurrence. Example: every=2, unit=hours.",
    capability: "notifications",
    input: { title: "string", message: "string", every: "number", unit: "string", atTime: "string|null", silent: "boolean" },
    execute: scheduleRecurringNotification,
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
