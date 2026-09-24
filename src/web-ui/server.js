import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

export function startWebUI({ askFriday, getStatus, getChatHistory, saveChatMessage }) {
  const port = Number(process.env.FRIDAY_WEB_PORT || 3000);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/api/status" && req.method === "GET") return json(res, getStatus());
      if (req.url === "/api/history" && req.method === "GET") return json(res, { history: await getChatHistory(200) });

      if (req.url === "/api/chat" && req.method === "POST") {
        const body = await readJson(req);
        const message = String(body.message || "").trim();
        if (!message) return json(res, { error: "Message is required." }, 400);
        await saveChatMessage("user", message);
        const answer = await askFriday(message, Boolean(body.forceTools));
        await saveChatMessage("assistant", answer);
        return json(res, { answer });
      }

      if (req.method === "GET") {
        const requested = req.url === "/" ? "index.html" : req.url.slice(1);
        const safePath = path.normalize(path.join(publicDir, requested));
        if (!safePath.startsWith(publicDir)) return text(res, "Not found", 404);
        const data = await fs.readFile(safePath);
        const ext = path.extname(safePath);
        const type = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" }[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": type });
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

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("Request is too large."));
    });
    req.on("end", () => {
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
