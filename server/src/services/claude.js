// Shared Anthropic (Claude) client for all the ATS AI features — resume scoring, JD writing,
// interview questions/scoring and the recruiter — plus OCR for scanned PDFs and image resumes
// using Claude's built-in document/vision reading.
//
// Env: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional, defaults below).

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const API = 'https://api.anthropic.com/v1/messages';

export function claudeConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function headers() {
  return {
    'content-type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry transient failures (overloaded 529, rate limit 429, 5xx, network blips) with backoff,
// so a momentarily busy API recovers on its own instead of surfacing "AI busy — retry".
async function call(body, { retries = 4 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      const transientStatus = res.status === 429 || res.status === 529 || res.status >= 500;
      if (transientStatus) {
        const data = await res.json().catch(() => ({}));
        lastErr = new Error(`Claude: ${data?.error?.message || `HTTP ${res.status}`}`);
        if (attempt < retries) { await sleep(Math.min(16000, 1000 * 2 ** attempt) + Math.random() * 400); continue; }
        throw lastErr;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(`Claude: ${data?.error?.message || `HTTP ${res.status}`}`);
      return (data?.content || []).map((p) => p.text || '').join('').trim();
    } catch (err) {
      lastErr = err;
      // Network-level errors are worth another try; a thrown API error above already decided.
      const retriable = /fetch failed|network|ECONN|ETIMEDOUT|timeout|socket|EAI_AGAIN/i.test(err.message || '')
        || /HTTP 5|429|529|overload/i.test(err.message || '');
      if (attempt < retries && retriable) { await sleep(Math.min(16000, 1000 * 2 ** attempt) + Math.random() * 400); continue; }
      throw err;
    }
  }
  throw lastErr;
}

/** Ask Claude and parse a single JSON object back. We prefill "{" so the reply is always JSON. */
export async function claudeJSON(system, prompt, maxTokens = 1500) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
  const text = await call({
    model: MODEL,
    max_tokens: maxTokens,
    temperature: 0.3,
    system,
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '{' }, // prefill forces a JSON object
    ],
  });
  let raw = ('{' + text).replace(/```json|```/g, '').trim();
  const last = raw.lastIndexOf('}');
  if (last >= 0) raw = raw.slice(0, last + 1);
  return JSON.parse(raw);
}

/** Ask Claude for a plain-text answer. */
export async function claudeText(system, prompt, maxTokens = 1024, temperature = 0.3) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
  return call({
    model: MODEL,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: prompt }],
  });
}

/** OCR a (likely scanned) PDF with Claude's document reading. Returns the extracted plain text. */
export async function claudeExtractPdfText(buffer, maxTokens = 4096) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
  return call({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
          { type: 'text', text: 'Extract ALL readable text from this resume exactly as written. Return only the plain text, no commentary.' },
        ],
      },
    ],
  });
}

/** OCR an image resume (png/jpeg/webp/gif) with Claude's vision. Returns the extracted plain text. */
export async function claudeExtractImageText(buffer, mediaType = 'image/png', maxTokens = 4096) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
  const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const mt = allowed.includes(mediaType) ? mediaType : 'image/png';
  return call({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mt, data: buffer.toString('base64') } },
          { type: 'text', text: 'Extract ALL readable text from this resume image exactly as written. Return only the plain text, no commentary.' },
        ],
      },
    ],
  });
}
