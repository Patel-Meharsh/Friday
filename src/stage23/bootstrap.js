import "dotenv/config";
import readline from "node:readline";
import { registerAutomationTools } from "../automation/register-automation-tools.js";
import { executeTool } from "../tools/tool-registry.js";

// Stage #23 bootstrap: dotenv must load before automation modules construct API clients.
registerAutomationTools();

function parseClock(value) {
  const raw = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ").replace(/\s*IST$/i, "");
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "AM") hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) return null;
  return { hour, minute };
}

function istParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date);
  const out = {};
  for (const p of parts) out[p.type] = Number(p.value);
  return out;
}

function delayUntil(hour, minute, extraDays = 0) {
  const now = istParts();
  let days = extraDays;
  if (days === 0 && hour * 60 + minute <= now.hour * 60 + now.minute) days = 1;
  const target = Date.UTC(now.year, now.month - 1, now.day + days, hour, minute, 0);
  const current = Date.UTC(now.year, now.month - 1, now.day, now.hour, now.minute, now.second);
  return Math.max(1_000, target - current);
}

function clockLabel(hour, minute) {
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix} IST`;
}

function parseReminder(line) {
  const text = String(line ?? "").trim();
  if (!/^remind\s+me\b/i.test(text)) return null;
  const relative = text.match(/^remind\s+me\s+in\s+(\d+)\s*(seconds?|minutes?|hours?)\s*(?::|to)\s*["“]?(.+?)["”]?$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const multiplier = unit.startsWith("second") ? 1_000 : unit.startsWith("minute") ? 60_000 : 3_600_000;
    return { message: relative[3].trim(), delayMs: amount * multiplier, intervalMs: null, once: true, when: `in ${amount} ${unit}` };
  }
  const tomorrow = text.match(/^remind\s+me\s+tomorrow(?:\s+at\s+(.+?))?\s*:\s*["“]?(.+?)["”]?$/i);
  if (tomorrow) {
    const time = parseClock(tomorrow[1] || "9 AM");
    if (!time) return null;
    return { message: tomorrow[2].trim(), delayMs: delayUntil(time.hour, time.minute, 1), intervalMs: null, once: true, when: `tomorrow at ${clockLabel(time.hour, time.minute)}` };
  }
  const recurring = text.match(/^remind\s+me\s+every\s+day\s+at\s+(.+?)\s*:\s*["“]?(.+?)["”]?$/i);
  if (recurring) {
    const time = parseClock(recurring[1]);
    if (!time) return null;
    return { message: recurring[2].trim(), delayMs: delayUntil(time.hour, time.minute), intervalMs: 86_400_000, once: false, when: `every day at ${clockLabel(time.hour, time.minute)}` };
  }
  const absolute = text.match(/^remind\s+me\s+(?:at\s+)?(.+?)\s*:\s*["“]?(.+?)["”]?$/i);
  if (absolute) {
    const time = parseClock(absolute[1]);
    if (!time) return null;
    return { message: absolute[2].trim(), delayMs: delayUntil(time.hour, time.minute), intervalMs: null, once: true, when: `at ${clockLabel(time.hour, time.minute)}` };
  }
  return null;
}

const originalOnLine = readline.Interface.prototype._onLine;
if (typeof originalOnLine === "function") {
  readline.Interface.prototype._onLine = function patchedOnLine(line) {
    const reminder = parseReminder(line);
    if (!reminder) return originalOnLine.call(this, line);
    void (async () => {
      try {
        const task = await executeTool("schedule_notification", { title: "FRIDAY Reminder", message: reminder.message, delayMs: reminder.delayMs, intervalMs: reminder.intervalMs, once: reminder.once, silent: false }, { reason: "Natural-language reminder" });
        process.stdout.write(`\nFriday: Scheduled. I’ll notify you ${reminder.when}. Task ID: ${task.id}\n\nYou: `);
      } catch (error) {
        process.stdout.write(`\nFriday: I couldn't schedule that reminder: ${error?.message || error}\n\nYou: `);
      }
    })();
  };
}
