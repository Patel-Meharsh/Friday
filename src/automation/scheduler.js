import { scheduleTask, cancelTask, listScheduledTasks } from "../runtime/background-runtime.js";
import { notify } from "./notifications.js";
import { assertPermission } from "../security/permission-manager.js";
import { audit } from "../security/audit-log.js";

const IST = "Asia/Kolkata";
const DAY_MS = 86_400_000;
const WEEK_MS = DAY_MS * 7;

function parseClock(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[.]/g, "")
    .replace(/[’']O\s*CLOCK\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?(?:\s*IST)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toUpperCase() || null;
  if (minute > 59) return null;

  if (meridiem) {
    if (hour >= 1 && hour <= 12) {
      if (meridiem === "AM") hour = hour === 12 ? 0 : hour;
      if (meridiem === "PM") hour = hour === 12 ? 12 : hour + 12;
    } else if (hour < 13 || hour > 23) {
      return null;
    }
  } else if (hour > 23) {
    return null;
  }

  return { hour, minute };
}

function istNowParts() {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date());

  const result = {};
  for (const part of parts) result[part.type] = Number(part.value);
  return result;
}

function delayUntilISTClock(hour, minute, extraDays = 0) {
  const now = istNowParts();
  const targetMinutes = hour * 60 + minute;
  const nowMinutes = now.hour * 60 + now.minute;
  let days = extraDays;
  if (days === 0 && targetMinutes <= nowMinutes) days = 1;

  const target = Date.UTC(now.year, now.month - 1, now.day + days, hour, minute, 0);
  const nowAsIST = Date.UTC(now.year, now.month - 1, now.day, now.hour, now.minute, now.second);
  return Math.max(1_000, target - nowAsIST);
}

function normalizeInterval(every, unit) {
  const amount = Number(every);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Recurring interval must be greater than zero.");

  const normalized = String(unit || "minutes").toLowerCase();
  const multiplier = normalized.startsWith("second")
    ? 1_000
    : normalized.startsWith("minute")
      ? 60_000
      : normalized.startsWith("hour")
        ? 3_600_000
        : normalized.startsWith("day")
          ? DAY_MS
          : normalized.startsWith("week")
            ? WEEK_MS
            : null;

  if (!multiplier) throw new Error("Recurring unit must be seconds, minutes, hours, days, or weeks.");
  const intervalMs = amount * multiplier;
  if (intervalMs > 2_147_483_647) throw new Error("That recurring interval is too large for the current background scheduler.");
  return Math.max(1_000, Math.floor(intervalMs));
}

export async function scheduleNotification({ message, title = "Friday", delayMs = 0, intervalMs = null, once = true, silent = false, atTime = null } = {}) {
  await assertPermission("notifications", { reason: "User requested a scheduled notification" });

  let effectiveDelay = Math.max(0, Math.min(Number(delayMs) || 0, 2_147_483_647));
  let effectiveInterval = intervalMs == null ? null : Math.max(1_000, Math.min(Number(intervalMs) || 0, 2_147_483_647));
  const effectiveOnce = Boolean(once);

  if (atTime) {
    const time = parseClock(atTime);
    if (!time) throw new Error("I couldn't understand that clock time. Use 1:02 PM, 13:04, or 20:30.");
    effectiveDelay = delayUntilISTClock(time.hour, time.minute);
  }

  const task = scheduleTask({
    name: `notification:${String(title).slice(0, 50)}`,
    delayMs: effectiveDelay,
    intervalMs: effectiveInterval,
    once: effectiveOnce,
    execute: async () => notify({ title, message, silent }),
  });

  await audit("notification_scheduled", {
    taskId: task.id,
    delayMs: effectiveDelay,
    intervalMs: effectiveOnce ? null : effectiveInterval,
    once: effectiveOnce,
    atTime: atTime || null,
  });

  return task;
}

export async function scheduleRecurringNotification({ message, title = "Friday Reminder", every = 1, unit = "minutes", atTime = null, silent = false } = {}) {
  const intervalMs = normalizeInterval(every, unit);
  const firstDelayMs = atTime
    ? (() => {
        const time = parseClock(atTime);
        if (!time) throw new Error("I couldn't understand that recurring reminder time. Use 9:00 AM or 21:30.");
        return delayUntilISTClock(time.hour, time.minute);
      })()
    : intervalMs;

  return scheduleNotification({
    title,
    message,
    delayMs: firstDelayMs,
    intervalMs,
    once: false,
    silent,
  });
}

export async function cancelScheduledNotification(taskId) {
  await assertPermission("notifications", { reason: "User requested cancellation of a scheduled notification" });
  return { cancelled: cancelTask(taskId) };
}

export function listNotificationSchedules() {
  return listScheduledTasks().filter((task) => task.name.startsWith("notification:"));
}

export const reminderTiming = Object.freeze({ parseClock, delayUntilISTClock, normalizeInterval });
