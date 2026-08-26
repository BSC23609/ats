import { q } from '../db.js';

/** Pull plain text out of a resume buffer, robustly, and tell the caller WHY if it can't. */
export async function extractText(buffer, mimetype = '', filename = '') {
  const name = (filename || '').toLowerCase();
  const isPdf = mimetype.includes('pdf') || name.endsWith('.pdf') ||
                (buffer && buffer.slice(0, 5).toString('latin1') === '%PDF-'); // sniff the magic bytes
  const isDocx = mimetype.includes('word') || mimetype.includes('officedocument') || name.endsWith('.docx');
  const isDoc = name.endsWith('.doc') && !name.endsWith('.docx');

  if (isDoc) {
    // Old binary .doc has no reliable pure-JS parser; ask for a PDF or DOCX instead.
    const e = new Error('Old .doc format cannot be read. Ask the candidate for a PDF or DOCX.');
    e.code = 'UNSUPPORTED';
    throw e;
  }

  if (isPdf) {
    // pdfjs-dist is maintained and does not run test code on import (unlike pdf-parse@1.1.1,
    // which crashes on load in some deploys).
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;

    let text = '';
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map((i) => i.str).join(' ') + '\n';
    }
    text = text.trim();

    if (!text) {
      // A scanned/photographed resume is an image with no text layer. Nothing to extract.
      const e = new Error('This PDF has no readable text — it looks scanned or image-only. Ask for a text PDF.');
      e.code = 'NO_TEXT';
      throw e;
    }
    return text;
  }

  if (isDocx) {
    const mammoth = (await import('mammoth')).default;
    const { value } = await mammoth.extractRawText({ buffer });
    const text = (value || '').trim();
    if (!text) {
      const e = new Error('This document appears to be empty.');
      e.code = 'NO_TEXT';
      throw e;
    }
    return text;
  }

  // Last resort: treat as plain text.
  const text = buffer.toString('utf8').trim();
  if (!text) {
    const e = new Error('Could not read any text from this file.');
    e.code = 'NO_TEXT';
    throw e;
  }
  return text;
}

const INSTRUCTIONS = `You are a recruitment analyst for the Bharat Steel Group (Chennai) — a steel trading,
pre-engineered building, roofing and software group. You read a candidate's resume against a job
description and produce a factual overview for the HR admin.

Rules you must not break:
- Report only what the resume supports. Never invent an employer, a date, a qualification or a skill.
- If the resume does not mention something the job description asks for, that requirement is NOT met.
  Absence of evidence is not evidence of the skill. Put it in requirements_missing.
- Score against THIS job description, not a general idea of a good candidate.
- A polished resume is not a strong candidate. Judge the substance, not the writing.

HOW TO WEIGHT THE SCORE (out of 10):
Two factors carry the most weight, because they most often decide whether a hire actually works:

  • EXPERIENCE (heaviest). Compare the candidate's real, relevant experience to what the role asks.
    - Below the minimum asked → this is a serious shortfall; the score should rarely exceed 5.
    - Far above the range (e.g. 15 yrs for a 2–5 yr role) → flag as overqualified; likely to leave or
      cost too much. Cap enthusiasm; note it.
    - Within or just above the range → no penalty.

  • LOCATION (heavy). Compare the candidate's city/area to the job's location.
    - Same city → best; no penalty.
    - Nearby / commutable → minor penalty only.
    - Different city or state with no sign of relocation → material penalty. Steel/site roles need
      people who can actually be on site. Flag it.
    - If the candidate states willingness to relocate, treat as commutable but still flag for confirmation.

The remaining requirements (skills, qualifications, domain) share the rest of the weight. A candidate
who fits location and experience but misses some skills is usually more hireable than one who nails
the skills but can't be on site or is years short — let the scale reflect that.

Scale:
  9-10  right experience band AND location, meets the requirements, exceeds several
  7-8   right experience and location, core requirements met, minor gaps
  5-6   one heavy factor is off (under-experienced, or far away) OR several skill gaps
  3-4   both heavy factors weak, or wrong level
  1-2   wrong field entirely
Use the whole scale. Most real candidates land between 4 and 7 — do not cluster at 8.

Reply with a SINGLE JSON object and nothing else — no prose, no markdown fences:
{
  "score": number,
  "score_reasoning": "2-3 sentences: why this score, naming the experience and location verdicts explicitly",
  "experience_fit": "UNDER" | "MATCH" | "OVER",
  "experience_note": "one line comparing candidate experience to what the role asks",
  "location_fit": "LOCAL" | "COMMUTABLE" | "DISTANT" | "UNKNOWN",
  "location_note": "one line comparing candidate location to the job location",
  "requirements_met": [string],
  "requirements_missing": [string],
  "headline": "one line, max 120 chars, e.g. 'PEB design engineer, 6 yrs, STAAD.Pro + IS 800'",
  "total_experience_years": number,
  "current_employer": string|null,
  "current_designation": string|null,
  "highest_qualification": string|null,
  "location": string|null,
  "key_skills": [string],
  "employment_history": [{"employer": string, "designation": string, "period": string}],
  "education": [{"qualification": string, "institution": string, "year": string}],
  "strengths": [string],
  "gaps_or_concerns": [string],
  "fit_for_role": "STRONG" | "POSSIBLE" | "WEAK",
  "questions_to_ask": [string]
}`;

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.7-flash';

/**
 * Score a resume with Google Gemini (free tier). Fire-and-forget: writes the result back to the
 * application row and never throws into the request path. The JSON contract is unchanged from the
 * previous scorer, plus the new experience_/location_ fit fields — so the pipeline, badges and
 * detail page keep working.
 */
export async function summariseResume(
  applicationId,
  {
    resumeText,
    position,
    company,
    experience,
    jobDescription,
    experienceRange,
    jobLocation,
    candidateLocation,
  }
) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !resumeText?.trim()) {
    await q(`UPDATE applications SET ai_status='SKIPPED' WHERE id=$1`, [applicationId]);
    return;
  }

  const prompt =
    `Company: ${company}\n` +
    `Position applied for: ${position}\n` +
    `Experience the candidate declared: ${experience ?? 'not stated'} years\n` +
    (experienceRange ? `Experience the role asks for: ${experienceRange}\n` : 'Experience asked: not stated\n') +
    `Job location: ${jobLocation || 'not stated'}\n` +
    `Candidate's stated location: ${candidateLocation || 'not stated'}\n\n` +
    `JOB DESCRIPTION\n---------------\n` +
    (jobDescription?.trim()
      ? jobDescription.slice(0, 20000)
      : `None was uploaded for this role. Score against the job title alone and say so in ` +
        `score_reasoning — a score without a job description is a weak signal.`) +
    `\n\nRESUME\n------\n${resumeText.slice(0, 60000)}`;

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // The instructions go in as a system instruction; the data as the user turn.
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json', // Gemini returns clean JSON, no fences to strip
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const why = data?.error?.message || `HTTP ${res.status}`;
      throw new Error(`Gemini: ${why}`);
    }

    const raw = (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || '')
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const summary = JSON.parse(raw);
    await q(`UPDATE applications SET ai_summary=$1, ai_status='DONE', updated_at=now() WHERE id=$2`, [
      summary,
      applicationId,
    ]);
  } catch (err) {
    console.error(`resume summary failed for application ${applicationId}:`, err.message);
    await q(`UPDATE applications SET ai_status='FAILED', ai_error=$2 WHERE id=$1`,
            [applicationId, err.message.slice(0, 300)]);
  }
}
