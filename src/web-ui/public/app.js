import { createVoiceInput } from "./voice-input.js";

const messages = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('message');
const send = document.getElementById('send');
const voice = document.getElementById('voice');
const voiceStatus = document.getElementById('voiceStatus');
const welcome = document.querySelector('.welcome');

let speaking = false;
let voiceMode = false;
let voices = [];

function loadVoices() { voices = window.speechSynthesis?.getVoices?.() || []; }
if ('speechSynthesis' in window) { loadVoices(); window.speechSynthesis.addEventListener('voiceschanged', loadVoices); }

function addMessage(role, text) {
  welcome?.remove();
  const el = document.createElement('article');
  el.className = `msg ${role}`;
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = role === 'user' ? 'YOU' : 'FRIDAY';
  const body = document.createElement('div');
  body.textContent = text;
  el.append(label, body);
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

async function loadHistory() {
  try {
    const response = await fetch('/api/history', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'History request failed');
    for (const item of data.history || []) addMessage(item.role === 'user' ? 'user' : 'friday', item.content);
  } catch (error) {
    voiceStatus.textContent = `History unavailable: ${error.message}`;
  }
}

function pickVoice() {
  return voices.find((v) => v.lang?.toLowerCase() === 'en-in')
    || voices.find((v) => v.lang?.toLowerCase().startsWith('en-in'))
    || voices.find((v) => v.lang?.toLowerCase().startsWith('en'))
    || null;
}

function speak(text) {
  if (!('speechSynthesis' in window) || !text?.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-IN';
  utterance.rate = 0.98;
  utterance.pitch = 1;
  const voiceProfile = pickVoice();
  if (voiceProfile) utterance.voice = voiceProfile;
  utterance.onstart = () => { speaking = true; voiceStatus.textContent = 'Friday is speaking…'; };
  utterance.onend = () => { speaking = false; voiceStatus.textContent = voiceMode ? 'Voice conversation ready — speak again when you are ready.' : 'Voice command will send automatically'; };
  utterance.onerror = () => { speaking = false; voiceStatus.textContent = 'Voice response unavailable; text response shown.'; };
  window.speechSynthesis.speak(utterance);
}

async function sendMessage(rawMessage, { fromVoice = false } = {}) {
  const message = rawMessage.trim();
  if (!message || send.disabled) return;
  voiceMode = fromVoice;
  addMessage('user', message);
  input.value = '';
  send.disabled = true;
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    const answer = data.answer || 'I did not receive an answer.';
    addMessage('friday', answer);
    speak(answer);
  } catch (error) {
    const errorMessage = `I couldn't complete that request: ${error.message}`;
    addMessage('friday', errorMessage);
    speak(errorMessage);
  } finally {
    send.disabled = false;
    if (!fromVoice) input.focus();
  }
}

createVoiceInput({
  input,
  button: voice,
  onStateChange(state) {
    if (!state.supported) voiceStatus.textContent = 'Voice input is not supported by this browser.';
    else if (state.listening) voiceStatus.textContent = 'Listening… speak now';
    else if (state.error) voiceStatus.textContent = `Voice: ${state.error}`;
    else if (!speaking) voiceStatus.textContent = 'Voice command will send automatically';
  },
  onFinalTranscript: (text) => sendMessage(text, { fromVoice: true }),
});

form.addEventListener('submit', async (event) => { event.preventDefault(); await sendMessage(input.value, { fromVoice: false }); });
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });

loadHistory();
