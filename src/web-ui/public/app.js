import { createVoiceInput } from "./voice-input.js";

const messages = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('message');
const send = document.getElementById('send');
const voice = document.getElementById('voice');
const voiceStatus = document.getElementById('voiceStatus');
const welcome = document.querySelector('.welcome');

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

async function sendMessage(rawMessage) {
  const message = rawMessage.trim();
  if (!message || send.disabled) return;

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
    addMessage('friday', data.answer || 'I did not receive an answer.');
  } catch (error) {
    addMessage('friday', `I couldn't complete that request: ${error.message}`);
  } finally {
    send.disabled = false;
    input.focus();
  }
}

createVoiceInput({
  input,
  button: voice,
  onStateChange(state) {
    if (!state.supported) {
      voiceStatus.textContent = 'Voice input is not supported by this browser.';
      return;
    }
    if (state.listening) {
      voiceStatus.textContent = 'Listening… speak now';
    } else if (state.error) {
      voiceStatus.textContent = `Voice: ${state.error}`;
    } else {
      voiceStatus.textContent = 'Voice command will send automatically';
    }
  },
  onFinalTranscript: sendMessage,
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await sendMessage(input.value);
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
