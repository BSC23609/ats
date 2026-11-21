// Sarvam AI voice — text-to-speech (the AI interviewer's voice) and speech-to-text (the
// candidate's spoken answers). Both are plain REST calls authenticated with SARVAM_API_KEY.
// Each function returns a result object and never throws, so a voice hiccup degrades gracefully.

const KEY = () => process.env.SARVAM_API_KEY;
export const sarvamConfigured = () => Boolean(KEY());

const TTS_URL = 'https://api.sarvam.ai/text-to-speech';
const STT_URL = 'https://api.sarvam.ai/speech-to-text';

/**
 * Speak `text`. Returns { audio } where audio is a base64-encoded WAV, or { error }.
 * The browser plays it with `new Audio('data:audio/wav;base64,' + audio)`.
 */
export async function tts(text, opts = {}) {
  if (!KEY()) return { error: 'Voice is not configured (no SARVAM_API_KEY on the server).' };
  const clean = String(text || '').trim();
  if (!clean) return { error: 'Nothing to speak.' };

  try {
    const res = await fetch(TTS_URL, {
      method: 'POST',
      headers: { 'api-subscription-key': KEY(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: clean.slice(0, 1400),
        target_language_code: opts.language_code || 'en-IN',
        speaker: opts.speaker || 'priya',
        model: opts.model || 'bulbul:v3',
        pace: 1.0,
        speech_sample_rate: 22050,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: `Sarvam TTS ${res.status}: ${data?.error?.message || data?.message || JSON.stringify(data).slice(0, 200)}` };
    const audio = data?.audios?.[0];
    if (!audio) return { error: 'Sarvam TTS returned no audio.' };
    return { audio };
  } catch (err) {
    return { error: `Sarvam TTS request failed: ${err.message}` };
  }
}

/**
 * Transcribe one short answer clip (<=30s). `buffer` is the raw audio bytes from the browser
 * (typically audio/webm). Returns { transcript } or { error }.
 */
export async function stt(buffer, filename = 'answer.webm', mimetype = 'audio/webm') {
  if (!KEY()) return { error: 'Voice is not configured (no SARVAM_API_KEY on the server).' };
  if (!buffer || !buffer.length) return { error: 'No audio received.' };

  try {
    const form = new FormData();
    form.append('model', 'saaras:v4');
    form.append('mode', 'transcribe');
    form.append('file', new Blob([buffer], { type: mimetype }), filename);

    const res = await fetch(STT_URL, {
      method: 'POST',
      headers: { 'api-subscription-key': KEY() }, // let fetch set the multipart boundary
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: `Sarvam STT ${res.status}: ${data?.error?.message || data?.message || JSON.stringify(data).slice(0, 200)}` };
    return { transcript: (data?.transcript || '').trim() };
  } catch (err) {
    return { error: `Sarvam STT request failed: ${err.message}` };
  }
}
