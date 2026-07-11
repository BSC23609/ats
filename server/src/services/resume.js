import { createRequire } from 'module';
import mammoth from 'mammoth';
import Anthropic from '@anthropic-ai/sdk';
import { q } from '../db.js';

const require = createRequire(import.meta.url);

/** Pull plain text out of a resume held in memory. Works the same whether the file
 *  came from local disk or an object store. */
export async function extractText(buffer, mimetype, filename = '') {
  if (mimetype === 'application/pdf') {
    const pdfParse = require('pdf-parse');
    const { text } = await pdfParse(buffer);
    return text;
  }
  if (mimetype.includes('word') || filename.endsWith('.docx')) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  return buffer.toString('utf8');
}

const SYSTEM = `You are a recruitment analyst for the Bharat Steel Group (Chennai) — a steel trading,
pre-engineered building, roofing and software group. You read a candidate's resume against a job
description and produce a factual overview for the HR admin.

Rules you must not break:
- Report only what the resume supports. Never invent an employer, a date, a qualification or a skill.
- If the resume does not mention something the job description asks for, that requirement is NOT met.
  Absence of evidence is not evidence of the skill. Put it in requirements_missing.
- Score the resume against THIS job description, not against a general idea of a good candidate.
- A polished resume is not a strong candidate. Judge the substance, not the writing.

Scoring scale, out of 10:
  9-10  meets every stated requirement with clear evidence, and exceeds several
  7-8   meets the core requirements; minor gaps only
  5-6   meets some requirements; at least one important gap
  3-4   substantially short of the requirements
  1-2   wrong field or wrong level entirely
Use the whole scale. Most real candidates land between 4 and 7 — do not cluster everything at 8.

Reply with a single JSON object and nothing else — no prose, no markdown fences:
{
  "score": number,                             // 0-10, one decimal place allowed
  "score_reasoning": "2-3 sentences saying plainly why this score and not one higher or lower",
  "requirements_met": [string],                // JD requirements the resume clearly evidences, quoting the evidence
  "requirements_missing": [string],            // JD requirements the resume does not evidence
  "headline": "one line, max 120 chars, e.g. 'PEB design engineer, 6 yrs, STAAD.Pro + IS 800'",
  "total_experience_years": number,
  "current_employer": string|null,
  "current_designation": string|null,
  "highest_qualification": string|null,
  "location": string|null,
  "key_skills": [string],                      // max 10, most relevant first
  "employment_history": [{"employer": string, "designation": string, "period": string}],
  "education": [{"qualification": string, "institution": string, "year": string}],
  "strengths": [string],                       // max 4, tied to this job description
  "gaps_or_concerns": [string],                // max 4: job-hopping, unexplained gaps, missing details, role mismatch
  "fit_for_role": "STRONG"|"POSSIBLE"|"WEAK",  // STRONG >= 8, POSSIBLE 5-7.9, WEAK < 5
  "questions_to_ask": [string]                 // max 4 interview questions this resume raises
}`;

/**
 * Summarise a resume with Claude. Safe to call fire-and-forget: it writes the result
 * back to the application row and never throws into the request path.
 */
export async function summariseResume(applicationId, { resumeText, position, company, experience, jobDescription }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !resumeText?.trim()) {
    await q(`UPDATE applications SET ai_status='SKIPPED' WHERE id=$1`, [applicationId]);
    return;
  }
  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      max_tokens: 2000,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content:
            `Company: ${company}\n` +
            `Position applied for: ${position}\n` +
            `Experience the candidate declared: ${experience} years\n\n` +
            `JOB DESCRIPTION\n---------------\n` +
            (jobDescription?.trim()
              ? jobDescription.slice(0, 20000)
              : `None was uploaded for this role. Score against the job title alone and say so in ` +
                `score_reasoning — a score without a job description is a weak signal.`) +
            `\n\nRESUME\n------\n${resumeText.slice(0, 60000)}`,
        },
      ],
    });

    const raw = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .replace(/```json|```/g, '')
      .trim();

    const summary = JSON.parse(raw);
    await q(`UPDATE applications SET ai_summary=$1, ai_status='DONE', updated_at=now() WHERE id=$2`, [
      summary,
      applicationId,
    ]);
  } catch (err) {
    console.error(`resume summary failed for application ${applicationId}:`, err.message);
    await q(`UPDATE applications SET ai_status='FAILED' WHERE id=$1`, [applicationId]);
  }
}
