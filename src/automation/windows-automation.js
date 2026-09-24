import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertPermission } from "../security/permission-manager.js";
import { audit } from "../security/audit-log.js";

const execFileAsync = promisify(execFile);
const POWERSHELL = process.env.ComSpec ? "powershell.exe" : "powershell";
const MAX_TYPE_LENGTH = 500;
const SAFE_KEYS = new Set([
  "ENTER", "ESC", "TAB", "SPACE", "BACKSPACE", "DELETE", "UP", "DOWN", "LEFT", "RIGHT",
  "HOME", "END", "PAGEUP", "PAGEDOWN", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
]);

function assertWindows() {
  if (process.platform !== "win32") throw new Error("Windows desktop automation is only available on Windows.");
}

async function powershell(script, args = []) {
  assertWindows();
  const { stdout, stderr } = await execFileAsync(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script, ...args], {
    windowsHide: true,
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (stderr?.trim()) throw new Error(stderr.trim().slice(0, 500));
  return stdout.trim();
}

export async function captureScreen({ filePath = null } = {}) {
  await assertPermission("screenUnderstanding", { reason: "User requested a screen snapshot" });
  assertWindows();

  const destination = path.resolve(filePath || path.join(os.tmpdir(), `friday-screen-${Date.now()}.png`));
  const script = `Add-Type -AssemblyName System.Drawing; Add-Type -AssemblyName System.Windows.Forms; $bounds=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap $bounds.Width,$bounds.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($bounds.Left,$bounds.Top,0,0,$bmp.Size); $bmp.Save([System.IO.Path]::GetFullPath($args[0]),[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose(); Write-Output ([System.IO.Path]::GetFullPath($args[0]))`;
  const output = await powershell(script, [destination]);
  await audit("screen_capture", { path: output, width: "virtual-screen", sensitive: true });
  return { path: output };
}

export async function moveMouse({ x, y }) {
  await assertPermission("mouse", { reason: "User requested mouse movement" });
  const nx = Number(x); const ny = Number(y);
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 0 || ny < 0 || nx > 32767 || ny > 32767) throw new Error("Mouse coordinates are outside the allowed range.");
  const script = `Add-Type @'\nusing System; using System.Runtime.InteropServices; public static class M { [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X,int Y); }\n'@; [M]::SetCursorPos(${nx},${ny}) | Out-Null`;
  await powershell(script);
  await audit("mouse_move", { x: nx, y: ny });
  return { x: nx, y: ny };
}

export async function clickMouse({ button = "left", clicks = 1 } = {}) {
  await assertPermission("mouse", { reason: "User requested mouse click" });
  const safeButton = String(button).toLowerCase();
  if (!["left", "right", "middle"].includes(safeButton)) throw new Error("Mouse button must be left, right, or middle.");
  const count = Math.max(1, Math.min(Number(clicks) || 1, 2));
  const flag = safeButton === "left" ? 0x0002 : safeButton === "right" ? 0x0008 : 0x0020;
  const up = safeButton === "left" ? 0x0004 : safeButton === "right" ? 0x0010 : 0x0040;
  const script = `Add-Type @'\nusing System; using System.Runtime.InteropServices; public static class M { [DllImport(\"user32.dll\")] public static extern void mouse_event(uint f,uint dx,uint dy,uint d,uint e); }\n'@; 1..${count} | ForEach-Object { [M]::mouse_event(${flag},0,0,0,0); [M]::mouse_event(${up},0,0,0,0); Start-Sleep -Milliseconds 80 }`;
  await powershell(script);
  await audit("mouse_click", { button: safeButton, clicks: count });
  return { button: safeButton, clicks: count };
}

export async function typeText({ text }) {
  await assertPermission("keyboard", { reason: "User requested keyboard text entry" });
  const value = String(text ?? "");
  if (!value || value.length > MAX_TYPE_LENGTH) throw new Error(`Keyboard text must be 1-${MAX_TYPE_LENGTH} characters.`);
  const encoded = Buffer.from(value, "utf8").toString("base64");
  const script = `$bytes=[Convert]::FromBase64String($args[0]); $text=[Text.Encoding]::UTF8.GetString($bytes); Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait($text.Replace('{','{{').Replace('}','{}}').Replace('+','{+}').Replace('^','{^}').Replace('%','{%}').Replace('~','{~}').Replace('(','{(}').Replace(')','{) }'));`;
  await powershell(script, [encoded]);
  await audit("keyboard_type", { length: value.length, redacted: true });
  return { typed: true, length: value.length };
}

export async function pressKey({ key }) {
  await assertPermission("keyboard", { reason: "User requested keyboard key press" });
  const normalized = String(key || "").trim().toUpperCase();
  if (!SAFE_KEYS.has(normalized)) throw new Error(`Key '${normalized}' is not allowed. Use a safe navigation/function key.`);
  const mapping = { ENTER: "ENTER", ESC: "ESC", TAB: "TAB", SPACE: "SPACE", BACKSPACE: "BACKSPACE", DELETE: "DELETE", UP: "UP", DOWN: "DOWN", LEFT: "LEFT", RIGHT: "RIGHT", HOME: "HOME", END: "END", PAGEUP: "PGUP", PAGEDOWN: "PGDN", F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5", F6: "F6", F7: "F7", F8: "F8", F9: "F9", F10: "F10", F11: "F11", F12: "F12" };
  const token = mapping[normalized];
  const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{${token}}');`;
  await powershell(script);
  await audit("keyboard_key", { key: normalized });
  return { pressed: normalized };
}

export async function getScreenFileBytes(filePath) {
  const bytes = await fs.readFile(filePath);
  if (bytes.length > 20 * 1024 * 1024) throw new Error("Captured screen exceeds the 20 MB analysis limit.");
  return bytes;
}
