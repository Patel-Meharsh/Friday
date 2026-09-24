import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertPermission } from "../security/permission-manager.js";
import { audit } from "../security/audit-log.js";

const execFileAsync = promisify(execFile);
const MAX_TEXT = 2_000;

function integer(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer.`);
  if (n < -32_768 || n > 32_768) throw new Error(`${name} is outside the safe coordinate range.`);
  return n;
}

async function powershell(script, timeout = 8_000) {
  return execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout, windowsHide: true });
}

export async function moveMouse({ x, y }) {
  await assertPermission("mouse", { reason: "move mouse" });
  const px = integer(x, "x");
  const py = integer(y, "y");
  const script = `Add-Type @'\nusing System; using System.Runtime.InteropServices;\npublic static class Mouse { [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y); }\n'@; [Mouse]::SetCursorPos(${px},${py}) | Out-Null`;
  await powershell(script);
  await audit("mouse_moved", { x: px, y: py });
  return { moved: true, x: px, y: py };
}

export async function clickMouse({ button = "left", double = false } = {}) {
  await assertPermission("mouse", { reason: "mouse click" });
  const allowed = new Set(["left", "right", "middle"]);
  if (!allowed.has(button)) throw new Error("Mouse button must be left, right, or middle.");
  const flag = button === "right" ? "RIGHT" : button === "middle" ? "MIDDLE" : "LEFT";
  const count = double ? 2 : 1;
  const script = `Add-Type @'\nusing System; using System.Runtime.InteropServices;\npublic static class MouseClick { [DllImport(\"user32.dll\")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra); }\n'@; 1..${count} | ForEach-Object { [MouseClick]::mouse_event(0x0002${flag === "RIGHT" ? "|0x0008" : flag === "MIDDLE" ? "|0x0020" : ""},0,0,0,[UIntPtr]::Zero); [MouseClick]::mouse_event(0x0004${flag === "RIGHT" ? "|0x0010" : flag === "MIDDLE" ? "|0x0040" : ""},0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60 }`;
  await powershell(script);
  await audit("mouse_clicked", { button, double: Boolean(double) });
  return { clicked: true, button, double: Boolean(double) };
}

export async function typeKeyboardText({ text }) {
  await assertPermission("keyboard", { reason: "type keyboard text" });
  const clean = String(text ?? "");
  if (!clean || clean.length > MAX_TEXT) throw new Error(`Text must contain 1-${MAX_TEXT} characters.`);
  const escaped = clean.replace(/'/g, "''");
  const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/[+^%~(){}]/g, "{$&}")}')`;
  await powershell(script);
  await audit("keyboard_text_sent", { length: clean.length });
  return { typed: true, length: clean.length };
}

export async function pressKey({ key }) {
  await assertPermission("keyboard", { reason: "press keyboard key" });
  const allowed = new Set(["ENTER", "TAB", "ESC", "ESCAPE", "BACKSPACE", "DELETE", "UP", "DOWN", "LEFT", "RIGHT", "HOME", "END", "PAGEUP", "PAGEDOWN", "SPACE"]);
  const normalized = String(key ?? "").trim().toUpperCase();
  if (!allowed.has(normalized)) throw new Error("This key is not in Friday's safe key allowlist.");
  const map = { ENTER:"ENTER", TAB:"TAB", ESC:"ESC", ESCAPE:"ESC", BACKSPACE:"BACKSPACE", DELETE:"DELETE", UP:"UP", DOWN:"DOWN", LEFT:"LEFT", RIGHT:"RIGHT", HOME:"HOME", END:"END", PAGEUP:"PGUP", PAGEDOWN:"PGDN", SPACE:"SPACE" };
  const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{${map[normalized]}}')`;
  await powershell(script);
  await audit("keyboard_key_sent", { key: normalized });
  return { pressed: true, key: normalized };
}
