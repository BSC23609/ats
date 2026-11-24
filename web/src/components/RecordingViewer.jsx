import { useEffect, useState } from 'react';
import { api } from '../api.jsx';

/**
 * Plays a candidate's interview video recording in a modal. The file sits behind the same JWT as
 * everything else, so we fetch it with auth, turn the bytes into an object URL, and point a <video>
 * at that (a plain <video src> wouldn't send the token).
 */
export default function RecordingViewer({ applicationId, onClose }) {
  const [state, setState] = useState({ loading: true, url: null, error: null });

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;

    api
      .blobUrl(`/applications/${applicationId}/recording`)
      .then(({ url }) => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        objectUrl = url;
        setState({ loading: false, url, error: null });
      })
      .catch((err) => !cancelled && setState({ loading: false, url: null, error: err.message }));

    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [applicationId, onClose]);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="viewer" role="dialog" aria-modal="true" aria-label="Interview recording">
        <div className="viewer-head">
          <div className="name">Interview recording</div>
          <div className="row" style={{ gap: 6 }}>
            <button className="ghost small"
                    onClick={() => api.download(`/applications/${applicationId}/recording`, 'interview.webm')}>
              Download
            </button>
            <button className="dialog-close" onClick={onClose} aria-label="Close">&times;</button>
          </div>
        </div>

        <div className="viewer-body">
          {state.loading && <div className="empty">Loading the recording…</div>}
          {state.error && <div className="error" style={{ margin: 18 }}>{state.error}</div>}
          {!state.loading && !state.error && state.url && (
            <video src={state.url} controls autoPlay
                   style={{ width: '100%', height: '100%', maxHeight: '72vh', background: '#000' }} />
          )}
        </div>
      </div>
    </div>
  );
}
