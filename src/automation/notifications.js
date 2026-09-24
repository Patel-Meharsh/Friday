import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertPermission } from "../security/permission-manager.js";
import { audit } from "../security/audit-log.js";

const execFileAsync = promisify(execFile);
const POWERSHELL = process.platform === "win32" ? "powershell.exe" : "powershell";
const MAX_TEXT = 300;

function assertWindows() {
  if (process.platform !== "win32") throw new Error("Desktop notifications currently require Windows.");
}

export async function notify({ title = "Friday", message = "Notification from Friday", silent = false } = {}) {
  await assertPermission("notifications", { reason: "User requested a desktop notification" });
  assertWindows();

  const safeTitle = String(title).slice(0, MAX_TEXT);
  const safeMessage = String(message).slice(0, MAX_TEXT);
  const escapedTitle = safeTitle.replace(/'/g, "''");
  const escapedMessage = safeMessage.replace(/'/g, "''");
  const audio = silent ? "" : "$toastAudio=[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime];";

  const script = `Add-Type -AssemblyName System.Runtime.WindowsRuntime; $null=[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]; $template=[Windows.UI.Notifications.ToastTemplateType]::ToastText02; $xml=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($template); $nodes=$xml.GetElementsByTagName('text'); $nodes.Item(0).AppendChild($xml.CreateTextNode('${escapedTitle}')) | Out-Null; $nodes.Item(1).AppendChild($xml.CreateTextNode('${escapedMessage}')) | Out-Null; $toast=[Windows.UI.Notifications.ToastNotification]::new($xml); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('FRIDAY').Show($toast); ${audio}`;
  await execFileAsync(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true, timeout: 10_000 });
  await audit("desktop_notification", { host: os.hostname(), title: safeTitle, messageLength: safeMessage.length, silent: Boolean(silent) });
  return { delivered: true, title: safeTitle };
}
