import { useState } from 'react';
import { api } from '../api.jsx';

/**
 * Password reset over WhatsApp, in two steps inside one panel:
 *   1. enter your email → a six-digit code is sent to the mobile on your account
 *   2. enter the code and a new password
 *
 * The server is deliberately vague about whether an email exists, so this UI is too — after step 1
 * it always advances to step 2 with the same wording, whatever the truth.
 */
export default function ForgotPassword({ onDone, onCancel }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const request = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { email, code, new_password: password });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Done</div>
        <h1>Password changed</h1>
        <p className="lead">You can sign in with your new password now.</p>
        <button onClick={onDone} style={{ width: '100%' }}>Back to sign in</button>
      </>
    );
  }

  return (
    <>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Reset password</div>
      <h1>{step === 1 ? 'Forgot your password?' : 'Enter the code'}</h1>
      <p className="lead">
        {step === 1
          ? 'Enter your work email. We’ll WhatsApp a six-digit code to the mobile on your account.'
          : 'If that email is registered, a code is on its way to your WhatsApp. It’s good for ten minutes.'}
      </p>

      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      {step === 1 ? (
        <form onSubmit={request}>
          <div className="field">
            <label htmlFor="fp_email">Work email</label>
            <input id="fp_email" type="email" autoFocus required
                   value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Sending…' : 'Send the code'}
          </button>
        </form>
      ) : (
        <form onSubmit={reset}>
          <div className="field">
            <label htmlFor="fp_code">Six-digit code</label>
            <input id="fp_code" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus required
                   value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                   placeholder="000000" style={{ letterSpacing: '0.3em', fontFamily: 'var(--f-mono)' }} />
          </div>
          <div className="field">
            <label htmlFor="fp_pass">New password</label>
            <input id="fp_pass" type="password" minLength={8} required autoComplete="new-password"
                   value={password} onChange={(e) => setPassword(e.target.value)}
                   placeholder="At least 8 characters" />
          </div>
          <button type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Saving…' : 'Set new password'}
          </button>
          <p className="sub" style={{ marginTop: 12, textAlign: 'center' }}>
            Didn’t get it?{' '}
            <button type="button" className="linklike"
                    onClick={() => { setStep(1); setError(''); }}>
              Send again
            </button>
          </p>
        </form>
      )}

      <div className="signin-foot">
        <button type="button" className="linklike" onClick={onCancel}>← Back to sign in</button>
      </div>
    </>
  );
}
