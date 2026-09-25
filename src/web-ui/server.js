import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { synthesizeSpeech, ttsStatus } from "./tts-v2.js";
import { analyzeImageData } from "./image-understanding.js";
import { getPermissions, grantSessionPermission, revokeSessionPermission, isKnownCapability } from "../security/permission-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

export function startWebUI({ askFriday, getStatus, getChatHistory, saveChatMessage }) {
  const port = Number(process.env.FRIDAY_WEB_PORT || 3000);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/api/status" && req.method === "GET") return json(res, { ...getStatus(), tts: ttsStatus() });
      if (req.url === "/api/history" && req.method === "GET") return json(res, { history: await getChatHistory(200) });

      if (req.url === "/api/chat" && req.method === "POST") {
        const body = await readJson(req);
        const message = String(body.message || "").trim();
        if (!message) return json(res, { error: "Message is required." }, 400);
        await saveChatMessage("user", message);
        const directAnswer = await handleWebPermissionCommand(message);
        const answer = directAnswer ?? await askFriday(message, Boolean(body.forceTools));
        await saveChatMessage("assistant", answer);
        return json(res, { answer });
      }

      if (req.url === "/api/image" && req.method === "POST") {
        const body = await readJson(req, 12_000_000);
        const answer = await analyzeImageData({ dataUrl: body.dataUrl, prompt: body.prompt });
        return json(res, { answer });
      }

      if (req.url === "/api/tts" && req.method === "POST") {
        const body = await readJson(req);
        const textToSpeak = String(body.text || "").trim();
        if (!textToSpeak) return json(res, { error: "Text is required." }, 400);
        const audio = await synthesizeSpeech(textToSpeak, {
          previousText: String(body.previousText || ""),
          nextText: String(body.nextText || ""),
        });
        return sendAudio(res, audio);
      }

      if (req.url === "/api/tts/test" && req.method === "POST") {
        const audio = await synthesizeSpeech("Good morning, Meharsh. I am Friday, your personal AI assistant. All systems are online and ready. How may I assist you?");
        return sendAudio(res, audio);
      }

      if (req.method === "GET") {
        const requested = req.url === "/" ? "index.html" : req.url.slice(1);
        const safePath = path.normalize(path.join(publicDir, requested));
        if (!safePath.startsWith(publicDir)) return text(res, "Not found", 404);
        const data = await fs.readFile(safePath);
        const ext = path.extname(safePath);
        const type = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" }[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
        return res.end(data);
      }
      return text(res, "Not found", 404);
    } catch (error) {
      return json(res, { error: error?.message || "Friday web server error." }, 500);
    }
  });

  server.listen(port, "127.0.0.1", () => console.log(`FRIDAY WEB UI: http://localhost:${port}`));
  return server;
}

async function handleWebPermissionCommand(message) {
  const trimmed = String(message || "").trim();
  const command = trimmed.match(/^(?:permissions?|permission)\s+(grant|allow|revoke|deny)\s+([a-zA-Z]+)$/i);
  if (command) {
    const action = command[1].toLowerCase();
    const capability = command[2];
    if (!isKnownCapability(capability)) return `Unknown permission capability: ${capability}`;
    if (action === "grant" || action === "allow") {
      await grantSessionPermission(capability);
      return `Allowed ${capability} for this session only.`;
    }
    await revokeSessionPermission(capability);
    return `Denied ${capability} for this session only.`;
  }

  if (/^(?:permissions?|permission status)$/i.test(trimmed)) {
    const permissions = getPermissions();
    return Object.entries(permissions).map(([name, allowed]) => `${allowed ? "ALLOW" : "DENY "}  ${name}`).join("\n");
  }

  const question = trimmed.match(/\b(?:do you have|is|are)\s+(?:the\s+)?([a-zA-Z]+)\s+permissions?\b/i);
  if (question) {
    const aliases = {
      notification: "notifications",
      notifications: "notifications",
      screen: "screenUnderstanding",
      screenunderstanding: "screenUnderstanding",
      keyboard: "keyboard",
      mouse: "mouse",
      terminal: "terminal",
      applications: "applications",
    };
    const capability = aliases[question[1].toLowerCase()];
    if (capability && isKnownCapability(capability)) {
      const allowed = Boolean(getPermissions()[capability]);
      return allowed
        ? `Yes. ${capability} permission is currently allowed for this session.`
        : `No. ${capability} permission is currently denied. You can enable it with: permission allow ${capability}`;
    }
  }

  return null;
}

function sendAudio(res, audio) {
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Content-Length": audio.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  return res.end(audio);
}

function readJson(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      raw += chunk;
      if (raw.length > maxBytes) {
        rejected = true;
        reject(new Error("Request is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (rejected) return;
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON request.")); }
    });
    req.on("error", reject);
  });
}

function json(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

function text(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(value);
}
