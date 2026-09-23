export function createVoiceOutput({ rate = 1, pitch = 1, volume = 1, lang = "en-IN" } = {}) {
  const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  function speak(text) {
    if (!supported || !text?.trim()) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
    return true;
  }

  return {
    supported,
    speak,
    stop() {
      if (supported) window.speechSynthesis.cancel();
    },
  };
}
