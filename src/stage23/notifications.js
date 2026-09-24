import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertPermission } from "../security/permission-manager.js";
import { audit } from "../security/audit-log.js";

const execFileAsync = promisify(execFile);

function safeText(value, max = 240) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

export async function showNotification({ title = "FRIDAY", message }) {
  await assertPermission("notifications", { reason: "show desktop notification" });
  const cleanTitle = safeText(title, 80) || "FRIDAY";
  const cleanMessage = safeText(message, 500);
  if (!cleanMessage) throw new Error("Notification message cannot be empty.");

  if (process.platform !== "win32") {
    throw new Error("Desktop notifications are currently supported only on Windows.");
  }

  const script = [
    "$ErrorActionPreference='Stop';",
    "Add-Type -AssemblyName System.Windows.Forms;",
    "$n = New-Object System.Windows.Forms.NotifyIcon;",
    "$n.Icon = [System.Drawing.SystemIcons]::Information;",
    "$n.Visible = $true;",
    `$n.BalloonTipTitle = '${cleanTitle.replace(/'/g, "''")}';`,
    `$n.BalloonTipText = '${cleanMessage.replace(/'/g, "''")}';`,
    "$n.ShowBalloonTip(5000);",
    "Start-Sleep -Milliseconds 5500;",
    "$n.Dispose();",
  ].join(" ");

  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout: 8_000, windowsHide: true });
    await audit("desktop_notification_shown", { title: cleanTitle });
    return { delivered: true, title: cleanTitle, message: cleanMessage };
  } catch (error) {
    await audit("desktop_notification_failed", { error: error?.message || String(error) });
    throw new Error(`Windows notification failed: ${error?.message || error}`);
  }
}
