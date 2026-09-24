import { createVoiceInput } from "./voice-input.js";

const messages = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('message');
const send = document.getElementById('send');
const voice = document.getElementById('voice');
const voiceStatus = document.getElementById('voiceStatus');
const welcome = document.querySelector('.welcome');

let voiceMode = false;
let activeAudio = null;
let activeAudioUrl = null;

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

function stopSpeaking() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
}

async function speakNaturally(text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return false;

  stopSpeaking();
  voiceStatus.textContent = 'Friday is preparing a natural voice response…';

  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: cleanText }),
  });

  if (!response.ok) {
    let message = 'Natural voice is unavailable.';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {}
    throw new Error(message);
  }

  const blob = await response.blob();
  activeAudioUrl = URL.createObjectURL(blob);
  activeAudio = new Audio(activeAudioUrl);
  activeAudio.preload = 'auto';
  activeAudio.onplay = () => { voiceStatus.textContent = 'Friday is speaking…'; };
  activeAudio.onended = () => {
    stopSpeaking();
    voiceStatus.textContent = voiceMode
      ? 'Voice conversation ready — speak again when you are ready.'
      : 'Natural voice ready';
  };
  activeAudio.onerror = () => {
    stopSpeaking();
    voiceStatus.textContent = 'Audio playback failed; text response shown.';
  };

  await activeAudio.play();
  return true;
}

async function sendMessage(rawMessage, { fromVoice = false } = {}) {
  const message = rawMessage.trim();
  if (!message || send.disabled) return;
  voiceMode = fromVoice;
  stopSpeaking();
  addMessage('user', message);
  input.value = '';
  send.disabled = true;
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    const answer = data.answer || 'I did not receive an answer.';
    addMessage('friday', answer);
    try {
      await speakNaturally(answer);
    } catch (voiceError) {
      voiceStatus.textContent = `Natural voice unavailable: ${voiceError.message}`;
    }
  } catch (error) {
    const errorMessage = `I couldn't complete that request: ${error.message}`;
    addMessage('friday', errorMessage);
    try { await speakNaturally(errorMessage); } catch {}
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
    else if (!activeAudio) voiceStatus.textContent = 'Voice command will send automatically';
  },
  onFinalTranscript: (text) => sendMessage(text, { fromVoice: true }),
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await sendMessage(input.value, { fromVoice: false });
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

loadHistory();
