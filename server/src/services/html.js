/**
 * Job descriptions are written in a rich-text box, so they arrive as HTML. Two jobs here:
 *
 *   sanitise() — the HTML is written by an HR admin, not the public, so this is not the last line
 *                of defence. But it is stored and later rendered on the public careers page, so an
 *                admin account that got taken over must not be able to plant a script there.
 *                Allow the handful of tags the editor produces; strip everything else.
 *
 *   toText()   — the AI scores a resume against the job description, and it wants prose, not markup.
 */

const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'p', 'br', 'div']);

export function sanitise(html) {
  if (!html) return null;

  let out = String(html)
    // scripts, styles and their contents go entirely
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    // every remaining tag: keep it only if it is on the list, and strip all its attributes
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (tag, name) => {
      const n = name.toLowerCase();
      if (!ALLOWED.has(n)) return '';
      return tag.startsWith('</') ? `</${n}>` : n === 'br' ? '<br>' : `<${n}>`;
    });

  // an editor left empty still hands back "<br>" or "<div><br></div>"
  if (!out.replace(/<[^>]*>/g, '').trim()) return null;
  return out.trim().slice(0, 20000);
}

export function toText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<li>/gi, '\n• ')
    .replace(/<\/(p|div|ul|ol|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The experience a role asks for, in words. Mirrors what candidates see on the careers page. */
export function describeRange(min, max) {
  const lo = Number(min) || 0;
  const hi = max == null ? null : Number(max);
  if (!lo && hi == null) return null;
  if (!lo && hi != null) return `up to ${hi} years`;
  if (lo && hi == null) return `${lo} years or more`;
  if (lo === hi) return `${lo} years`;
  return `${lo} to ${hi} years`;
}
