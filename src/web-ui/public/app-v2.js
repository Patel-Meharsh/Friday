import { createVoiceInput } from "./voice-input.js";

const messages = document.getElementById("messages");
const input = document.getElementById("message");
const form = document.getElementById("chatForm");
const send = document.getElementById("send");
const voice = document.getElementById("voice");
const voiceStatus = document.getElementById("voiceStatus");
const testVoice = document.getElementById("testVoice");
const recentChats = document.getElementById("recentChats");
const newChatButton = document.getElementById("newChat");

const STORAGE_KEY = "friday.web.chats.v2";
let chats = [];
let activeChatId = null;
let activeAudio = null;
let activeAudioUrl = null;

function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function titleFor(items) {
  const first = items.find((m) => m.role === "user");
  return first?.content?.slice(0, 48) || "New chat";
}
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); }
function activeChat() { return chats.find((chat) => chat.id === activeChatId); }
function escapeHtml(value) { return String(value).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\": "\\\\", '"': "&quot;" }[c])); }

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}
function splitTableRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function appendInlineText(parent, text) {
  const parts = String(text).split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("`") && part.endsWith("`")) {
      const code = document.createElement("code");
      code.textContent = part.slice(1, -1);
      parent.appendChild(code);
    } else if (part.startsWith("**") && part.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      parent.appendChild(strong);
    } else if (part.startsWith("*") && part.endsWith("*")) {
      const em = document.createElement("em");
      em.textContent = part.slice(1, -1);
      parent.appendChild(em);
    } else parent.appendChild(document.createTextNode(part));
  }
}

function renderAssistantContent(container, text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  let i = 0;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const p = document.createElement("p");
    appendInlineText(p, paragraph.join(" "));
    container.appendChild(p);
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { flushParagraph(); i += 1; continue; }

    if (line.trim().startsWith("```") ) {
      flushParagraph();
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { codeLines.push(lines[i]); i += 1; }
      i += 1;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = codeLines.join("\n");
      pre.appendChild(code); container.appendChild(pre); continue;
    }

    if (i + 1 < lines.length && line.includes("|") && isTableSeparator(lines[i + 1])) {
      flushParagraph();
      const rows = [splitTableRow(line)];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) { rows.push(splitTableRow(lines[i])); i += 1; }
      const wrap = document.createElement("div"); wrap.className = "data-table-wrap";
      const table = document.createElement("table"); table.className = "data-table";
      const thead = document.createElement("thead"); const head = document.createElement("tr");
      rows[0].forEach((cell) => { const th = document.createElement("th"); th.textContent = cell; head.appendChild(th); });
      thead.appendChild(head); table.appendChild(thead);
      const tbody = document.createElement("tbody");
      for (const row of rows.slice(1)) { const tr = document.createElement("tr"); row.forEach((cell) => { const td = document.createElement("td"); appendInlineText(td, cell); tr.appendChild(td); }); tbody.appendChild(tr); }
      table.appendChild(tbody); wrap.appendChild(table); container.appendChild(wrap); continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph();
      const ul = document.createElement("ul");
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { const li = document.createElement("li"); appendInlineText(li, lines[i].replace(/^\s*[-*]\s+/, "")); ul.appendChild(li); i += 1; }
      container.appendChild(ul); continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushParagraph();
      const ol = document.createElement("ol");
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { const li = document.createElement("li"); appendInlineText(li, lines[i].replace(/^\s*\d+\.\s+/, "")); ol.appendChild(li); i += 1; }
      container.appendChild(ol); continue;
    }

    paragraph.push(line.trim()); i += 1;
  }
  flushParagraph();
}

function renderMessages() {
  messages.innerHTML = "";
  const chat = activeChat();
  if (!chat || !chat.messages.length) {
    messages.innerHTML = `<div class="welcome"><div class="big-orb"></div><h2>Good to see you.</h2><p>Ask naturally. Friday can reason, research, code, explain, remember and use its connected tools.</p></div>`;
    return;
  }

  for (const item of chat.messages) {
    const el = document.createElement("article");
    el.className = `msg ${item.role === "user" ? "user" : "friday"}`;
    const label = document.createElement("div"); label.className = "label"; label.textContent = item.role === "user" ? "YOU" : "FRIDAY"; el.appendChild(label);
    const body = document.createElement("div");
    if (item.role === "assistant") renderAssistantContent(body, item.content); else body.textContent = item.content;
    el.appendChild(body); messages.appendChild(el);
  }
  requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
}

function renderRecentChats() {
  recentChats.innerHTML = "";
  for (const chat of [...chats].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const button = document.createElement("button");
    button.className = `recent-chat ${chat.id === activeChatId ? "active" : ""}`;
    button.textContent = chat.title; button.title = chat.title;
    button.onclick = () => { activeChatId = chat.id; renderRecentChats(); renderMessages(); input.focus(); };
    recentChats.appendChild(button);
  }
}

function createNewChat() {
  const chat = { id: uid(), title: "New chat", messages: [], createdAt: Date.now(), updatedAt: Date.now() };
  chats.unshift(chat); activeChatId = chat.id; persist(); renderRecentChats(); renderMessages(); input.value = ""; input.focus();
}

async function initializeChats() {
  try { chats = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { chats = []; }
  if (!chats.length) {
    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      const data = await response.json();
      const old = (data.history || []).map((item) => ({ role: item.role === "user" ? "user" : "assistant", content: item.content }));
      if (old.length) chats.push({ id: uid(), title: "Previous conversation", messages: old, createdAt: Date.now(), updatedAt: Date.now() });
    } catch {}
  }
  createNewChat();
}

function addChatMessage(role, content) {
  const chat = activeChat(); if (!chat) return;
  chat.messages.push({ role, content }); chat.title = titleFor(chat.messages); chat.updatedAt = Date.now(); persist(); renderRecentChats(); renderMessages();
}

function stopSpeaking() {
  if (activeAudio) { activeAudio.pause(); activeAudio.currentTime = 0; activeAudio = null; }
  if (activeAudioUrl) { URL.revokeObjectURL(activeAudioUrl); activeAudioUrl = null; }
}

async function speak(text) {
  const response = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  if (!response.ok) throw new Error((await response.json()).error || "Natural voice unavailable.");
  const blob = await response.blob(); activeAudioUrl = URL.createObjectURL(blob); activeAudio = new Audio(activeAudioUrl); voiceStatus.textContent = "Friday is speaking…";
  await new Promise((resolve, reject) => { activeAudio.onended = resolve; activeAudio.onerror = reject; activeAudio.play().catch(reject); });
  URL.revokeObjectURL(activeAudioUrl); activeAudioUrl = null; activeAudio = null;
}

async function sendMessage(raw, { fromVoice = false } = {}) {
  const message = raw.trim(); if (!message || send.disabled) return;
  stopSpeaking(); addChatMessage("user", message); input.value = ""; send.disabled = true;
  try {
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Request failed");
    addChatMessage("assistant", data.answer || "I did not receive an answer.");
    if (fromVoice) await speak(data.answer || "I did not receive an answer."); else voiceStatus.textContent = "Text response ready — use the microphone for a spoken reply.";
  } catch (error) {
    const text = `I couldn't complete that request: ${error.message}`; addChatMessage("assistant", text); if (fromVoice) { try { await speak(text); } catch {} }
  } finally { send.disabled = false; input.focus(); }
}

newChatButton.onclick = createNewChat;
form.addEventListener("submit", (event) => { event.preventDefault(); sendMessage(input.value); });
input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
testVoice?.addEventListener("click", async () => { testVoice.disabled = true; try { await speak("Good morning, Meharsh. I am Friday, your personal AI assistant."); voiceStatus.textContent = "Custom Friday voice test complete"; } catch (e) { voiceStatus.textContent = `Voice test failed: ${e.message}`; } finally { testVoice.disabled = false; } });

createVoiceInput({ input, button: voice, onStateChange(state) { if (!state.supported) voiceStatus.textContent = "Voice input is not supported by this browser."; else if (state.listening) { stopSpeaking(); voiceStatus.textContent = "Listening… speak now"; } else if (state.error) voiceStatus.textContent = `Voice: ${state.error}`; }, onFinalTranscript: (text) => sendMessage(text, { fromVoice: true }) });

initializeChats();
