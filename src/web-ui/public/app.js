import { createVoiceInput } from "./voice-input.js";

const messages = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('message');
const send = document.getElementById('send');
const voice = document.getElementById('voice');
const voiceStatus = document.getElementById('voiceStatus');
const testVoice = document.getElementById('testVoice');
const welcome = document.querySelector('.welcome');

let voiceMode = false;
let activeAudio = null;
let activeAudioUrl = null;
let speechRun = 0;

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
  speechRun += 1;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
}

function splitSpeechText(text, maxChars = 420) {
  const normalized = String(text || '')
    .replace(/```[\s\S]*?```/g, 'I provided the code in the chat.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);

  if (!normalized) return [];
  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [normalized];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    const part = sentence.trim();
    if (!part) continue;
    if ((current + ' ' + part).trim().length <= maxChars) {
      current = `${current} ${part}`.trim();
      continue;
    }
    if (current) chunks.push(current);
    if (part.length <= maxChars) {
      current = part;
      continue;
    }
    for (const word of part.split(/\s+/)) {
      if ((current + ' ' + word).trim().length > maxChars && current) {
        chunks.push(current);
        current = word;
      } else {
        current = `${current} ${word}`.trim();
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function fetchSpeechChunk(text) {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    let message = 'Natural voice is unavailable.';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {}
    throw new Error(message);
  }
  return response.blob();
}

async function speakNaturally(text) {
  const chunks = splitSpeechText(text);
  if (!chunks.length) return false;

  stopSpeaking();
  const run = speechRun;
  voiceStatus.textContent = 'Friday is preparing a natural voice response…';

  let nextBlobPromise = fetchSpeechChunk(chunks[0]);

  for (let index = 0; index < chunks.length; index += 1) {
    if (run !== speechRun) return false;

    const blob = await nextBlobPromise;
    if (run !== speechRun) return false;

    if (index + 1 < chunks.length) {
      nextBlobPromise = fetchSpeechChunk(chunks[index + 1]);
    }

    activeAudioUrl = URL.createObjectURL(blob);
    activeAudio = new Audio(activeAudioUrl);
    activeAudio.preload = 'auto';
    activeAudio.onplay = () => { voiceStatus.textContent = 'Friday is speaking…'; };

    await new Promise((resolve, reject) => {
      activeAudio.onended = resolve;
      activeAudio.onerror = () => reject(new Error('Audio playback failed.'));
      activeAudio.play().catch(reject);
    });

    if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
    activeAudio = null;
  }

  if (run === speechRun) {
    voiceStatus.textContent = voiceMode
      ? 'Voice conversation ready — speak again when you are ready.'
      : 'Friday natural voice ready';
  }
  return true;
}

async function testFridayVoice() {
  stopSpeaking();
  testVoice.disabled = true;
  voiceStatus.textContent = 'Testing your custom Friday voice…';
  try {
    const response = await fetch('/api/tts/test', { method: 'POST' });
    if (!response.ok) {
      let message = 'Friday voice test failed.';
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }
    const blob = await response.blob();
    activeAudioUrl = URL.createObjectURL(blob);
    activeAudio = new Audio(activeAudioUrl);
    await new Promise((resolve, reject) => {
      activeAudio.onended = resolve;
      activeAudio.onerror = () => reject(new Error('Audio playback failed.'));
      activeAudio.play().catch(reject);
    });
    voiceStatus.textContent = 'Custom Friday voice test complete';
    if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
    activeAudio = null;
  } catch (error) {
    voiceStatus.textContent = `Friday voice test failed: ${error.message}`;
  } finally {
    testVoice.disabled = false;
  }
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
    else if (state.listening) {
      stopSpeaking();
      voiceStatus.textContent = 'Listening… speak now';
    } else if (state.error) voiceStatus.textContent = `Voice: ${state.error}`;
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

testVoice?.addEventListener('click', testFridayVoice);
loadHistory();
