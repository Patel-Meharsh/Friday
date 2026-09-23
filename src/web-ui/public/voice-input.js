export function createVoiceInput({ input, button, onStateChange = () => {}, onFinalTranscript = null }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!Recognition) {
    button.disabled = true;
    button.title = "Voice input is not supported by this browser.";
    onStateChange({ supported: false, listening: false, error: "Speech recognition is not supported by this browser." });
    return { supported: false, stop() {} };
  }

  const recognition = new Recognition();
  recognition.lang = "en-IN";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let listening = false;
  let finalTranscript = "";
  let submitted = false;

  function setListening(value) {
    listening = value;
    button.classList.toggle("listening", value);
    button.setAttribute("aria-pressed", String(value));
    button.title = value ? "Listening… click to stop" : "Voice input";
    onStateChange({ supported: true, listening: value });
  }

  function submitOnce(text) {
    const message = text.trim();
    if (!message || submitted) return;
    submitted = true;
    input.value = message;
    if (typeof onFinalTranscript === "function") onFinalTranscript(message);
  }

  recognition.onstart = () => {
    finalTranscript = "";
    submitted = false;
    setListening(true);
  };

  recognition.onresult = (event) => {
    let interimTranscript = "";
    let gotFinal = false;

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += text;
        gotFinal = true;
      } else {
        interimTranscript += text;
      }
    }

    const combined = `${finalTranscript} ${interimTranscript}`.trim();
    if (combined) input.value = combined;

    // Do not wait for a keyboard event. As soon as Chrome gives us a final
    // transcript, Friday submits it automatically.
    if (gotFinal && finalTranscript.trim()) submitOnce(finalTranscript);
  };

  recognition.onerror = (event) => {
    setListening(false);
    onStateChange({ supported: true, listening: false, error: event.error || "Voice recognition failed." });
  };

  recognition.onend = () => {
    setListening(false);
    // Some browsers deliver the final result immediately before onend while
    // others only expose the completed text here. Handle both cases.
    if (!submitted) submitOnce(finalTranscript || input.value);
  };

  button.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }

    try {
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
