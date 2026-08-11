import { useEffect, useState } from 'react';
import { api } from '../api.jsx';

/**
 * Opens a candidate's resume in a modal — rendered in the browser, not downloaded.
 *
 * The file is behind the same JWT as everything else, so it can't be dropped straight into an
 * <iframe src>: the browser wouldn't send the token. Instead we fetch it with auth, turn the
 * bytes into an object URL, and point the frame at that. PDFs and images render; a Word document
 * has no in-browser viewer, so for those we offer the download and say so plainly.
 */
export default function ResumeViewer({ applicationId, filename, onClose }) {
  const [state, setState] = useState({ loading: true, url: null, type: null, error: null });

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;

    api
      .blobUrl(`/applications/${applicationId}/resume`)
      .then(({ url, type }) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setState({ loading: false, url, type, error: null });
      })
      .catch((err) => !cancelled && setState({ loading: false, url: null, type: null, error: err.message }));

    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl); // don't leak the blob when the modal closes
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [applicationId, onClose]);

  const ext = (filename || '').toLowerCase().split('.').pop();
  const viewable = state.type === 'application/pdf' || (state.type || '').startsWith('image/') ||
    ['pdf', 'png', 'jpg', 'jpeg'].includes(ext);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="viewer" role="dialog" aria-modal="true" aria-label={`Resume — ${filename || ''}`}>
        <div className="viewer-head">
          <div className="name" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {filename || 'Resume'}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="ghost small"
                    onClick={() => api.download(`/applications/${applicationId}/resume?download=1`, filename)}>
              Download
            </button>
            <button className="dialog-close" onClick={onClose} aria-label="Close">&times;</button>
          </div>
        </div>

        <div className="viewer-body">
          {state.loading && <div className="empty">Opening the resume…</div>}

          {state.error && <div className="error" style={{ margin: 18 }}>{state.error}</div>}

          {!state.loading && !state.error && viewable && (
            <iframe src={state.url} title="Resume" className="viewer-frame" />
          )}

          {!state.loading && !state.error && !viewable && (
            <div className="empty">
              <h3>This file can’t be shown in the browser</h3>
              <p className="sub" style={{ maxWidth: 380, margin: '0 auto 16px' }}>
                It looks like a Word document. Browsers can only display PDFs and images inline —
                download it to open in Word.
              </p>
              <button onClick={() => api.download(`/applications/${applicationId}/resume?download=1`, filename)}>
                Download {filename}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
