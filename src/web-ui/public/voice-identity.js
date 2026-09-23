/*
 * Voice identity boundary.
 *
 * Web Speech API can transcribe speech but does NOT provide trustworthy
 * speaker identity. Friday therefore must never treat a recognized phrase
 * such as "Hey Friday" as proof that the speaker is Meharsh.
 *
 * This module exposes a conservative gate for the future local speaker-
 * verification model. Until a real verifier is installed and enrolled,
 * wake-on-voice remains disabled rather than silently accepting everyone.
 */

let verifier = null;
let enrolled = false;

export function configureSpeakerVerifier({ verify, isEnrolled = false } = {}) {
  if (typeof verify !== "function") throw new TypeError("Speaker verifier must provide a verify function.");
  verifier = verify;
  enrolled = Boolean(isEnrolled);
}

export function speakerIdentityAvailable() {
  return Boolean(verifier && enrolled);
}

export async function verifySpeaker(audioData) {
  if (!speakerIdentityAvailable()) return false;
  try {
    return Boolean(await verifier(audioData));
  } catch {
    return false;
  }
}

export function resetSpeakerVerifier() {
  verifier = null;
  enrolled = false;
}
