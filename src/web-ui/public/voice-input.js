export function createVoiceInput({ input, button, onStateChange = () => {} }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!Recognition) {
    button.disabled = true;
    button.title = "Voice input is not supported by this browser.";
    onStateChange({ supported: false, listening: false, error: "Speech recognition is not supported by this browser." });
    return { supported: false, stop() {} };
  }

  const recognition = new Recognition();
  recognition.lang = document.documentElement.lang === "en" ? "en-IN" : "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let listening = false;

  function setListening(value) {
    listening = value;
    button.classList.toggle("listening", value);
    button.setAttribute("aria-pressed", String(value));
    button.title = value ? "Listening… click to stop" : "Voice input";
    onStateChange({ supported: true, listening: value });
  }

  recognition.onstart = () => setListening(true);

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      transcript += event.results[i][0].transcript;
    }
    if (transcript.trim()) input.value = transcript.trim();
  };

  recognition.onerror = (event) => {
    setListening(false);
    onStateChange({ supported: true, listening: false, error: event.error || "Voice recognition failed." });
  };

  recognition.onend = () => setListening(false);

  button.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }

    try {
      // The browser owns microphone permission. Friday never stores raw audio.
      recognition.start();
    } catch (error) {
      onStateChange({ supported: true, listening: false, error: error.message });
    }
  });

  return {
    supported: true,
    stop() {
      if (listening) recognition.stop();
    },
  };
}
