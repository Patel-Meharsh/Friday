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
let voiceMode = false;

function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function titleFor(messages) {
  const first = messages.find((m) => m.role === "user");
  return first?.content?.slice(0, 42) || "New chat";
}
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); }
function activeChat() { return chats.find((chat) => chat.id === activeChatId); }

function renderMessages() {
  messages.innerHTML = "";
  const chat = activeChat();
  if (!chat || !chat.messages.length) {
    messages.innerHTML = `<div class="welcome"><div class="big-orb"></div><h2>Good to see you.</h2><p>Ask naturally. Friday can reason, research, code, explain and use its connected tools.</p></div>`;
    return;
  }
  for (const item of chat.messages) {
    const el = document.createElement("article");
    el.className = `msg ${item.role === "user" ? "user" : "friday"}`;
    el.innerHTML = `<div class="label">${item.role === "user" ? "YOU" : "FRIDAY"}</div>`;
    const body = document.createElement("div");
    body.textContent = item.content;
    el.appendChild(body);
    messages.appendChild(el);
  }
  messages.scrollTop = messages.scrollHeight;
}

function renderRecentChats() {
  recentChats.innerHTML = "";
  for (const chat of [...chats].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const button = document.createElement("button");
    button.className = `recent-chat ${chat.id === activeChatId ? "active" : ""}`;
    button.textContent = chat.title;
    button.title = chat.title;
    button.onclick = () => { activeChatId = chat.id; renderRecentChats(); renderMessages(); input.focus(); };
    recentChats.appendChild(button);
  }
}

function createNewChat() {
  const chat = { id: uid(), title: "New chat", messages: [], createdAt: Date.now(), updatedAt: Date.now() };
  chats.unshift(chat);
  activeChatId = chat.id;
  persist();
  renderRecentChats();
  renderMessages();
  input.value = "";
  input.focus();
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
  const chat = activeChat();
  if (!chat) return;
  chat.messages.push({ role, content });
  chat.title = titleFor(chat.messages);
  chat.updatedAt = Date.now();
  persist();
  renderRecentChats();
  renderMessages();
}

function stopSpeaking() {
  if (activeAudio) { activeAudio.pause(); activeAudio.currentTime = 0; activeAudio = null; }
  if (activeAudioUrl) { URL.revokeObjectURL(activeAudioUrl); activeAudioUrl = null; }
}

async function speak(text) {
  const response = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  if (!response.ok) throw new Error((await response.json()).error || "Natural voice unavailable.");
  const blob = await response.blob();
  activeAudioUrl = URL.createObjectURL(blob);
  activeAudio = new Audio(activeAudioUrl);
  voiceStatus.textContent = "Friday is speaking…";
  await new Promise((resolve, reject) => { activeAudio.onended = resolve; activeAudio.onerror = reject; activeAudio.play().catch(reject); });
  URL.revokeObjectURL(activeAudioUrl); activeAudioUrl = null; activeAudio = null;
}

async function sendMessage(raw, { fromVoice = false } = {}) {
  const message = raw.trim();
  if (!message || send.disabled) return;
  voiceMode = fromVoice;
  stopSpeaking();
  addChatMessage("user", message);
  input.value = "";
  send.disabled = true;
  try {
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    addChatMessage("assistant", data.answer || "I did not receive an answer.");
    if (fromVoice) await speak(data.answer || "I did not receive an answer.");
    else voiceStatus.textContent = "Text response ready — use the microphone for a spoken reply.";
  } catch (error) {
    const text = `I couldn't complete that request: ${error.message}`;
    addChatMessage("assistant", text);
    if (fromVoice) { try { await speak(text); } catch {} }
  } finally { send.disabled = false; input.focus(); }
}

newChatButton.onclick = createNewChat;
form.addEventListener("submit", (event) => { event.preventDefault(); sendMessage(input.value); });
input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
testVoice?.addEventListener("click", async () => { testVoice.disabled = true; try { await speak("Good morning, Meharsh. I am Friday, your personal AI assistant."); voiceStatus.textContent = "Custom Friday voice test complete"; } catch (e) { voiceStatus.textContent = `Voice test failed: ${e.message}`; } finally { testVoice.disabled = false; } });

createVoiceInput({ input, button: voice, onStateChange(state) { if (!state.supported) voiceStatus.textContent = "Voice input is not supported by this browser."; else if (state.listening) { stopSpeaking(); voiceStatus.textContent = "Listening… speak now"; } else if (state.error) voiceStatus.textContent = `Voice: ${state.error}`; }, onFinalTranscript: (text) => sendMessage(text, { fromVoice: true }) });

initializeChats();
