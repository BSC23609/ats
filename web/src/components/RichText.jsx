import { useEffect, useRef } from 'react';

/**
 * A small rich-text editor: bold, italic, underline, bullets, numbering.
 *
 * It writes HTML, which is what a job description actually is — headings of responsibilities,
 * bulleted requirements. A plain textarea forces HR to fake that with dashes.
 *
 * Built on contentEditable rather than a library: the whole thing is 60 lines, ships nothing,
 * and Ctrl+B / Ctrl+I / Ctrl+U work for free because the browser already knows them.
 */

const TOOLS = [
  { cmd: 'bold', label: 'B', title: 'Bold  (Ctrl+B)', style: { fontWeight: 800 } },
  { cmd: 'italic', label: 'I', title: 'Italic  (Ctrl+I)', style: { fontStyle: 'italic' } },
  { cmd: 'underline', label: 'U', title: 'Underline  (Ctrl+U)', style: { textDecoration: 'underline' } },
  { sep: true },
  { cmd: 'insertUnorderedList', label: '• —', title: 'Bulleted list' },
  { cmd: 'insertOrderedList', label: '1. —', title: 'Numbered list' },
  { sep: true },
  { cmd: 'removeFormat', label: 'Clear', title: 'Strip formatting' },
];

export default function RichText({ value = '', onChange, placeholder, minHeight = 260 }) {
  const ref = useRef(null);

  // Only write into the node when the value came from outside (loading an existing job).
  // Writing on every keystroke would move the caret to the end of the text on each character.
  useEffect(() => {
    if (ref.current && value !== ref.current.innerHTML) ref.current.innerHTML = value || '';
  }, [value]);

  const run = (cmd) => {
    ref.current?.focus();
    document.execCommand(cmd, false, null);
    onChange(ref.current.innerHTML);
  };

  return (
    <div className="rte">
      <div className="rte-bar" role="toolbar" aria-label="Formatting">
        {TOOLS.map((t, i) =>
          t.sep ? (
            <span key={i} className="rte-sep" />
          ) : (
            <button key={t.cmd} type="button" title={t.title} aria-label={t.title}
                    className="rte-btn" style={t.style}
                    onMouseDown={(e) => e.preventDefault()}   /* keep the selection alive */
                    onClick={() => run(t.cmd)}>
              {t.label}
            </button>
          )
        )}
      </div>

      <div
        ref={ref}
        className="rte-body"
        style={{ minHeight }}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onBlur={(e) => onChange(e.currentTarget.innerHTML)}
        onPaste={(e) => {
          // Paste from Word arrives wrapped in a mountain of markup. Take the text, keep the
          // line breaks, drop everything else.
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
      />
    </div>
  );
}
