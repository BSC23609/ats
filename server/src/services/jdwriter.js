// AI JD writer — turns the basic role details into a structured job description, using the same
// Google Gemini key and model as resume scoring. Returns a plain object (jd_doc) that the branded
// JD page renders, plus a renderer that turns it into the sanitised HTML shown on the careers page.

import { sanitise } from './html.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.7-flash';

const INSTRUCTIONS =
  `You are an experienced HR copywriter for the Bharat Steel Group, a Chennai-based industrial ` +
  `group (steel trading and processing, pre-engineered buildings, roofing, and software). Write a ` +
  `clear, professional, modern job description from the basic details given.\n\n` +
  `Keep it tight — the whole JD must fit on one page. Return ONLY JSON in exactly this shape:\n` +
  `{\n` +
  `  "tagline": "one short line that sums up the role (max 12 words)",\n` +
  `  "about_role": "2 sentence overview of the role and why it matters",\n` +
  `  "responsibilities": ["5 to 6 concrete duties, each a short phrase starting with a verb"],\n` +
  `  "requirements": ["4 to 5 must-have skills or experience, short phrases"],\n` +
  `  "preferred": ["0 to 3 nice-to-have points, short phrases (may be empty)"],\n` +
  `  "qualifications": ["1 to 2 education or certification points"],\n` +
  `  "what_we_offer": ["3 points on growth, environment and benefits, generic but relevant"]\n` +
  `}\n\n` +
  `Rules: write for an Indian audience; be specific to the role and industry; keep each list item ` +
  `to a short single line (aim for under 12 words, no full sentences or paragraphs in lists); do ` +
  `not invent a salary; do not use markdown; do not add any field beyond the shape above. If the ` +
  `user gave key points, weave them in.`;

/**
 * @returns {Promise<{jd_doc?: object, error?: string}>} never throws
 */
export async function generateJD({ title, department, location, employment_type, experience, company, notes }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: 'The JD writer is not configured (no GEMINI_API_KEY on the server).' };
  if (!title || !title.trim()) return { error: 'A job title is needed to write a JD.' };

  const prompt =
    `Company: ${company || 'Bharat Steel Group'}\n` +
    `Job title: ${title}\n` +
    `Department: ${department || 'not stated'}\n` +
    `Location: ${location || 'Chennai'}\n` +
    `Employment type: ${employment_type || 'Full-time'}\n` +
    `Experience required: ${experience || 'not stated'}\n` +
    `Key points from HR (optional): ${(notes && notes.trim()) || 'none given'}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) return { error: `Gemini: ${data?.error?.message || `HTTP ${res.status}`}` };

    const raw = (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || '')
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const doc = JSON.parse(raw);
    // Normalise: arrays are arrays, strings are strings; drop anything unexpected.
    const arr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
    const jd_doc = {
      tagline: String(doc.tagline || '').trim(),
      about_role: String(doc.about_role || '').trim(),
      responsibilities: arr(doc.responsibilities),
      requirements: arr(doc.requirements),
      preferred: arr(doc.preferred),
      qualifications: arr(doc.qualifications),
      what_we_offer: arr(doc.what_we_offer),
    };
    return { jd_doc };
  } catch (err) {
    return { error: err.message };
  }
}

const esc = (s) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const section = (heading, items) =>
  items && items.length
    ? `<p><strong>${esc(heading)}</strong></p><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
    : '';

/**
 * Render a jd_doc to the HTML shown on the careers page (and scored against). Uses only the tags
 * the editor/sanitiser allow (p, strong, ul, li) — no headings — so it round-trips cleanly.
 */
export function renderJdHtml(jd) {
  if (!jd) return null;
  const parts = [];
  if (jd.about_role) parts.push(`<p>${esc(jd.about_role)}</p>`);
  parts.push(section('Key responsibilities', jd.responsibilities));
  parts.push(section('What we are looking for', jd.requirements));
  parts.push(section('Preferred', jd.preferred));
  parts.push(section('Qualifications', jd.qualifications));
  parts.push(section('What we offer', jd.what_we_offer));
  return sanitise(parts.filter(Boolean).join(''));
}
