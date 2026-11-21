import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.jsx';
import { GroupLogo } from '../components/Logo.jsx';

const CSS = `
.iv{--navy:#0a2b66;--blue:#1f6fd0;--ink:#121922;--mut:#6b7684;--line:#e6ebf1;
  min-height:100vh;background:#0b1830;color:#eaf0f8;display:flex;flex-direction:column;align-items:center;
  font:16px/1.55 "Inter",-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:22px 16px 48px}
.iv-top{width:100%;max-width:820px;display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.iv-plate{background:#fff;border-radius:9px;padding:7px 12px;display:inline-flex}
.iv-plate img{height:24px}
.iv-eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9fb3d4;font-weight:600}
.iv-card{width:100%;max-width:820px;background:#0f2143;border:1px solid #1d365f;border-radius:16px;overflow:hidden}
.iv-stage{position:relative;background:#000;aspect-ratio:16/10;display:flex;align-items:center;justify-content:center}
.iv-stage video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
.iv-badge{position:absolute;top:14px;left:14px;background:rgba(10,43,102,.82);border:1px solid rgba(255,255,255,.18);
  border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;z-index:2}
.iv-dot{width:9px;height:9px;border-radius:50%;background:#3fd07a}
.iv-dot.rec{background:#ff5a5a;animation:ivpulse 1s infinite}
.iv-dot.ai{background:#4da3ff;animation:ivpulse 1.1s infinite}
@keyframes ivpulse{0%,100%{opacity:1}50%{opacity:.35}}
.iv-timer{position:absolute;top:14px;right:14px;background:rgba(0,0,0,.5);border-radius:999px;padding:6px 13px;font-weight:700;z-index:2}
.iv-body{padding:22px 26px 26px}
.iv-prompt{background:#13284e;border:1px solid #244a84;border-radius:10px;padding:14px 16px;margin-bottom:16px;min-height:52px;color:#dce8fb}
.iv-row{display:flex;gap:10px;flex-wrap:wrap}
.iv button{font:inherit;cursor:pointer;border:0;border-radius:10px;padding:13px 22px;font-weight:700;font-size:15px}
.iv .primary{background:var(--blue);color:#fff}
.iv .primary:disabled{opacity:.5;cursor:default}
.iv .ghost{background:transparent;border:1px solid #2a4a82;color:#cfe0f7}
.iv-note{color:#9fb3d4;font-size:13.5px;margin-top:12px;line-height:1.55}
.iv-err{background:#3a1420;border:1px solid #6a2435;color:#ffd4dc;border-radius:10px;padding:12px 15px;margin-bottom:14px}
.iv-plain{width:100%;max-width:640px;background:#0f2143;border:1px solid #1d365f;border-radius:16px;padding:40px;text-align:center}
.iv-tr{margin-top:18px;background:#0c1c3a;border:1px solid #1d365f;border-radius:10px;padding:14px 16px;text-align:left}
.iv-tr .q{color:#8fb4f0;font-weight:600;margin-top:10px}
.iv-tr .a{color:#dfe8f5;margin-top:2px}
h1{font-size:24px;margin:0 0 6px;color:#fff}
.sub{color:#9fb3d4}
`;

const MAX_ANSWER_MS = 30000;               // a normal answer segment
const INTRO_MS = 90000;                    // the self-introduction can run up to 90 seconds
const SEGMENT_MS = 30000;                  // each recorded clip is <=30s (Sarvam transcription limit)
const INTERVIEW_MS = 5 * 60 * 1000;        // the whole first round is capped at 5 minutes
const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function Interview() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('loading'); // loading|intro|speaking|recording|processing|finished|closed
  const [prompt, setPrompt] = useState('');
  const [secs, setSecs] = useState(0);
  const [left, setLeft] = useState(INTERVIEW_MS);   // whole-interview time remaining
  const [transcript, setTranscript] = useState([]);

  const streamRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const countRef = useRef(null);
  const endRef = useRef(0);        // wall-clock time the 5-minute cap is reached
  const overallRef = useRef(null); // interval ticking the overall countdown
  const segBlobsRef = useRef([]);  // recorded clips for the current answer (intro may have several)
  const introModeRef = useRef(false);
  const stopSegRef = useRef(false); // true once we should stop segmenting and send
  const capEndRef = useRef(0);      // when the current answer's own cap (30s / 90s) is reached
  const [introPhase, setIntroPhase] = useState(false);

  useEffect(() => {
    api.get(`/public/interview/${token}`)
      .then((d) => { setInfo(d); setPhase(d.status === 'DONE' ? 'closed' : 'intro'); })
      .catch((e) => { setError(e.message); setPhase('error'); });
    return () => stopAll();
    // eslint-disable-line
  }, [token]);

  const stopAll = () => {
    stopSegRef.current = true;
    clearTimeout(timerRef.current); clearInterval(countRef.current); clearInterval(overallRef.current);
    try { recRef.current && recRef.current.state !== 'inactive' && recRef.current.stop(); } catch { /* */ }
    try { streamRef.current && streamRef.current.getTracks().forEach((t) => t.stop()); } catch { /* */ }
  };

  const playAudio = (b64) =>
    new Promise((resolve) => {
      if (!b64) return resolve();
      const a = new Audio('data:audio/wav;base64,' + b64);
      a.onended = resolve; a.onerror = resolve;
      a.play().catch(resolve);
    });

  // Record an answer. The self-introduction may run up to 90s, recorded in <=30s segments (Sarvam
  // transcribes a clip at most 30s); later answers are a single short segment.
  const beginRecording = (isIntro = false) => {
    const stream = streamRef.current;
    if (!stream) return;
    introModeRef.current = isIntro;
    stopSegRef.current = false;
    segBlobsRef.current = [];
    capEndRef.current = Date.now() + (isIntro ? INTRO_MS : MAX_ANSWER_MS);
    setIntroPhase(isIntro);
    setPhase('recording');
    setSecs(0);
    countRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
    startSegment();
  };

  const startSegment = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const audioStream = new MediaStream(stream.getAudioTracks());
    let mime = 'audio/webm';
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(mime)) mime = '';
    const rec = mime ? new MediaRecorder(audioStream, { mimeType: mime }) : new MediaRecorder(audioStream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data && e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      if (chunksRef.current.length) {
        segBlobsRef.current.push(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }));
      }
      const past = Date.now() >= capEndRef.current;
      if (!stopSegRef.current && introModeRef.current && !past) {
        startSegment(); // keep recording the intro in the next <=30s segment
      } else {
        finishRecording();
      }
    };
    recRef.current = rec;
    rec.start();
    // Stop this segment at 30s, or sooner if the overall cap is closer.
    const segMs = Math.min(SEGMENT_MS, Math.max(1000, capEndRef.current - Date.now()));
    timerRef.current = setTimeout(() => {
      try { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); } catch { /* */ }
    }, segMs);
  };

  // User clicked "Done", the per-answer cap was hit, or the 5-minute clock ran out.
  const stopRecording = () => {
    stopSegRef.current = true;
    clearTimeout(timerRef.current); clearInterval(countRef.current);
    try {
      if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
      else finishRecording();
    } catch { finishRecording(); }
  };

  const finishRecording = () => {
    clearTimeout(timerRef.current); clearInterval(countRef.current);
    sendAnswer(segBlobsRef.current.slice());
  };

  const sendAnswer = async (blobs) => {
    setPhase('processing');
    try {
      const form = new FormData();
      (blobs || []).forEach((blob, i) => {
        const ext = (blob.type.includes('ogg')) ? 'ogg' : 'webm';
        form.append('audio', blob, `answer_${i}.${ext}`);
      });
      const res = await api.upload(`/public/interview/${token}/answer`, form);
      if (res.transcript) setTranscript((t) => [...t, { q: prompt, a: res.transcript }]);
      if (res.done) {
        setPrompt(res.text || '');
        await playAudio(res.audio);
        setPhase('finished');
        stopAll();
      } else {
        setPrompt(res.text || '');
        await playAudio(res.audio);
        beginRecording(false);
      }
    } catch (e) {
      setError(e.message);
      setPhase('finished');
      stopAll();
    }
  };

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      const v = document.getElementById('iv-video');
      if (v) { v.srcObject = stream; v.muted = true; v.play().catch(() => {}); }
    } catch {
      setError('We could not access your camera and microphone. Please allow access and reload.');
      return;
    }
    setPhase('speaking');
    // Start the overall 5-minute clock; when it runs out we stop the current answer and let the
    // server wrap up and score on that final submission.
    endRef.current = Date.now() + INTERVIEW_MS;
    setLeft(INTERVIEW_MS);
    clearInterval(overallRef.current);
    overallRef.current = setInterval(() => {
      const rem = endRef.current - Date.now();
      setLeft(rem);
      if (rem <= 0) {
        clearInterval(overallRef.current);
        if (recRef.current && recRef.current.state !== 'inactive') stopRecording();
      }
    }, 500);
    try {
      const res = await api.post(`/public/interview/${token}/start`);
      setPrompt(res.text || '');
      await playAudio(res.audio);
      beginRecording(true);   // first recording is the self-introduction (up to 90s)
    } catch (e) {
      setError(e.message || 'Could not start the interview.');
      setPhase('intro');
    }
  };

  if (phase === 'loading')
    return <div className="iv"><style>{CSS}</style><div className="iv-plain">Loading…</div></div>;

  if (phase === 'error')
    return <div className="iv"><style>{CSS}</style><div className="iv-plain"><h1>Link not valid</h1><p className="sub">{error}</p></div></div>;

  if (phase === 'closed')
    return (
      <div className="iv"><style>{CSS}</style>
        <div className="iv-plain">
          <h1>Interview already completed</h1>
          <p className="sub">Thank you. Our team has your responses and will be in touch.</p>
        </div>
      </div>
    );

  return (
    <div className="iv">
      <style>{CSS}</style>
      <div className="iv-top">
        <span className="iv-plate"><GroupLogo className="" /></span>
        <span className="iv-eyebrow">First-round Interview</span>
      </div>

      {phase === 'intro' ? (
        <div className="iv-plain" style={{ textAlign: 'left' }}>
          <h1>Hello {info?.full_name?.split(' ')[0]} 👋</h1>
          <p className="sub" style={{ marginTop: 6 }}>
            This is a short first-round interview for <strong style={{ color: '#fff' }}>{info?.position_applied}</strong> at {info?.company_name}.
          </p>
          <ul className="sub" style={{ lineHeight: 1.9, marginTop: 14 }}>
            <li>You'll be asked to introduce yourself, then answer a few questions.</li>
            <li>Your camera and microphone will be used. Each answer is up to 30 seconds.</li>
            <li>Find a quiet spot with a stable connection, and speak clearly.</li>
          </ul>
          {error && <div className="iv-err" style={{ marginTop: 14 }}>{error}</div>}
          {!info?.voice_ready && <div className="iv-err" style={{ marginTop: 14 }}>The interview voice isn't configured yet. Please check back shortly.</div>}
          <div className="iv-row" style={{ marginTop: 18 }}>
            <button className="primary" onClick={start} disabled={!info?.voice_ready}>Allow camera &amp; start</button>
          </div>
        </div>
      ) : phase === 'finished' ? (
        <div className="iv-plain" style={{ textAlign: 'left' }}>
          <h1>Interview complete ✅</h1>
          <p className="sub" style={{ marginTop: 6 }}>{prompt || 'Thank you. Our team will review your responses and be in touch.'}</p>
          {error && <div className="iv-err" style={{ marginTop: 14 }}>{error}</div>}
          {transcript.length > 0 && (
            <div className="iv-tr">
              <div className="iv-eyebrow" style={{ color: '#8fb4f0' }}>Your responses (transcribed)</div>
              {transcript.map((t, i) => (
                <div key={i}><div className="a" style={{ marginTop: 8 }}>{t.a || '—'}</div></div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="iv-card">
          <div className="iv-stage">
            <video id="iv-video" autoPlay playsInline muted />
            <div className="iv-badge">
              <span className={`iv-dot ${phase === 'recording' ? 'rec' : phase === 'speaking' ? 'ai' : ''}`} />
              {phase === 'speaking' ? 'Interviewer is speaking…'
                : phase === 'recording' ? (introPhase ? 'Recording your introduction' : 'Recording your answer')
                : 'Processing…'}
            </div>
            <div className="iv-timer">
              {phase === 'recording' ? `${Math.max(0, (introPhase ? 90 : 30) - secs)}s` : mmss(left)}
            </div>
          </div>
          <div className="iv-body">
            <div className="iv-prompt">{prompt}</div>
            <div className="iv-row">
              {phase === 'recording' && (
                <button className="primary" onClick={stopRecording}>
                  {introPhase ? 'Done introducing' : 'Done answering'}
                </button>
              )}
              {phase === 'speaking' && <span className="sub">Listen to the question…</span>}
              {phase === 'processing' && <span className="sub">One moment…</span>}
            </div>
            <div className="iv-note">
              This interview lasts about 5 minutes — <strong style={{ color: '#cfe0f7' }}>{mmss(left)}</strong> remaining.
              {introPhase
                ? ' Take up to 90 seconds to introduce yourself, then press Done.'
                : ' Keep each answer brief; it stops automatically at 30 seconds.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
