import { one, q } from '../db.js';
import { claudeJSON, claudeConfigured, claudeExtractPdfText, claudeExtractImageText } from './claude.js';
import { getFile } from './storage.js';
import { toText, describeRange } from './html.js';

/** Pull plain text out of a resume buffer, robustly, and tell the caller WHY if it can't. */
export async function extractText(buffer, mimetype = '', filename = '') {
  const name = (filename || '').toLowerCase();
  const isPdf = mimetype.includes('pdf') || name.endsWith('.pdf') ||
                (buffer && buffer.slice(0, 5).toString('latin1') === '%PDF-'); // sniff the magic bytes
  const isDocx = mimetype.includes('word') || mimetype.includes('officedocument') || name.endsWith('.docx');
  const isDoc = name.endsWith('.doc') && !name.endsWith('.docx');
  const isImage = mimetype.includes('image') || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(name);

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

    // A scanned/photographed resume has little or no text layer — OCR it with Claude's document reading.
    if (text.length < 40) {
      if (claudeConfigured()) {
        try {
          const ocr = (await claudeExtractPdfText(buffer)).trim();
          if (ocr) return ocr;
        } catch (err) {
          console.error('PDF OCR failed:', err.message);
        }
      }
      if (!text) {
        const e = new Error('This PDF has no readable text — it looks scanned or image-only. Ask for a text PDF.');
        e.code = 'NO_TEXT';
        throw e;
      }
    }
    return text;
  }

  if (isImage) {
    // An image resume (photo/screenshot) — read it with Claude's vision OCR.
    if (claudeConfigured()) {
      try {
        const mt = mimetype && mimetype.includes('image') ? mimetype
          : name.endsWith('.png') ? 'image/png'
          : /\.jpe?g$/.test(name) ? 'image/jpeg'
          : name.endsWith('.webp') ? 'image/webp'
          : name.endsWith('.gif') ? 'image/gif' : 'image/png';
        const ocr = (await claudeExtractImageText(buffer, mt)).trim();
        if (ocr) return ocr;
      } catch (err) {
        console.error('Image OCR failed:', err.message);
      }
    }
    const e = new Error('This image resume could not be read. Ask for a text PDF or Word file.');
    e.code = 'NO_TEXT';
    throw e;
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

/**
 * Score a resume with Claude. Fire-and-forget: writes the result back to the application row and
 * never throws into the request path. The JSON contract is unchanged — so the pipeline, badges and
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
  if (!claudeConfigured() || !resumeText?.trim()) {
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
    // Score with a fast model (Haiku) for quick turnaround; fall back to the default model if that
    // model isn't available on the account. ANTHROPIC_SCORING_MODEL overrides the fast default.
    const fastModel = process.env.ANTHROPIC_SCORING_MODEL || 'claude-haiku-5-5';
    let summary;
    try {
      // Fail fast on the fast model (1 quick retry) so a flake drops to the main model promptly.
      summary = await claudeJSON(INSTRUCTIONS, prompt, 2000, fastModel, { retries: 1 });
    } catch (err) {
      // The fast model can flake — not on the plan, an off-format reply, a transient blip. Fall back
      // to the default model once before giving up, so a weak fast model doesn't leave it unscored.
      console.error(`resume score: fast model failed (${err.message.slice(0, 120)}), retrying on default model`);
      summary = await claudeJSON(INSTRUCTIONS, prompt, 2000);
    }
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

// Transient failures (no credit, overloaded, rate-limited, network) should keep being retried once
// the account is funded; genuinely unscoreable resumes should eventually stop. This tells them apart.
const TRANSIENT_ERR = /credit|billing|overload|rate|429|529|HTTP 5|unavailable|timeout|ECONN|network|fetch failed|quota/i;

/** Re-run scoring for one application, re-extracting the resume text from storage if needed. Throws. */
export async function rescoreApplication(appId) {
  const app = await one(
    `SELECT a.*, c.name AS company_name FROM applications a JOIN companies c ON c.id=a.company_id WHERE a.id=$1`,
    [appId]
  );
  if (!app) return;
  const job = app.job_id
    ? await one('SELECT jd_text, description, min_experience, max_experience, location FROM jobs WHERE id=$1', [app.job_id])
    : null;

  let text = app.resume_text;
  if (!text && app.resume_path) {
    const buffer = await getFile(app.resume_path);
    text = await extractText(buffer, '', app.resume_filename || '');
    await q('UPDATE applications SET resume_text=$1 WHERE id=$2', [text, appId]);
  }
  await summariseResume(appId, {
    resumeText: text,
    position: app.position_applied,
    company: app.company_name,
    experience: app.total_experience,
    jobDescription: job?.jd_text || toText(job?.description),
    experienceRange: describeRange(job?.min_experience, job?.max_experience),
    jobLocation: job?.location,
    candidateLocation: [app.area, app.city, app.pincode].map((x) => (x || '').trim()).filter(Boolean).join(', ') || app.current_location,
  });
}

/**
 * Background sweep: automatically re-score FAILED resumes so transient problems (a busy API, or a
 * key that was briefly out of credit) heal themselves without anyone clicking Retry. Capped per run,
 * and each row is only retried a limited number of times for NON-transient failures, so a genuinely
 * unreadable resume can't loop forever and burn credit.
 */
export async function rescoreFailed(limit = 6) {
  if (!claudeConfigured()) return;
  let rows = [];
  try {
    ({ rows } = await q(
      `SELECT id FROM applications
         WHERE ai_status IN ('FAILED', 'PENDING', 'NOT_SCORED', 'SKIPPED')
           AND resume_path IS NOT NULL
           AND COALESCE(ai_attempts, 0) < 8
         ORDER BY updated_at ASC NULLS FIRST
         LIMIT $1`,
      [limit]
    ));
  } catch (err) {
    console.error('rescoreFailed query error:', err.message);
    return;
  }

  const sleep = (ms) => new Promise((rz) => setTimeout(rz, ms));
  for (const r of rows) {
    try {
      await rescoreApplication(r.id);
    } catch (err) {
      await q(`UPDATE applications SET ai_status='FAILED', ai_error=$2 WHERE id=$1`,
              [r.id, (err.message || 'failed').slice(0, 300)]).catch(() => {});
    }
    // Only count the attempt for permanent failures; transient ones stay eligible for next time.
    const row = await one(`SELECT ai_status, ai_error FROM applications WHERE id=$1`, [r.id]).catch(() => null);
    if (row && row.ai_status === 'FAILED' && !TRANSIENT_ERR.test(row.ai_error || '')) {
      await q(`UPDATE applications SET ai_attempts = COALESCE(ai_attempts, 0) + 1 WHERE id=$1`, [r.id]).catch(() => {});
    }
    // Pace the calls so a burst doesn't trip the API rate limit.
    await sleep(1500);
  }
}
