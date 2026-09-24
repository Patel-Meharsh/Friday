import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { assertPermission } from "../security/permission-manager.js";
import { audit } from "../security/audit-log.js";

const execFileAsync = promisify(execFile);

export async function captureScreen({ outputPath } = {}) {
  await assertPermission("screenUnderstanding", { reason: "capture screen" });
  if (process.platform !== "win32") throw new Error("Screen capture is currently supported only on Windows.");

  const path = outputPath || `${process.env.TEMP || "."}\\friday-screen-${randomUUID()}.png`;
  const escaped = path.replace(/'/g, "''");
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size); $bmp.Save('${escaped}',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose();`;

  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout: 10_000, windowsHide: true });
    await audit("screen_captured", { temporary: !outputPath });
    return { path, temporary: !outputPath };
  } catch (error) {
    await audit("screen_capture_failed", { error: error?.message || String(error) });
    throw new Error(`Screen capture failed: ${error?.message || error}`);
  }
}

export async function deleteTemporaryCapture(path) {
  if (!path) return;
  try { await unlink(path); } catch { /* already removed */ }
  await audit("screen_capture_deleted", { temporary: true });
}
