// AI first-round interview — generates tailored questions from the candidate's self-introduction,
// resume and the job description, and scores the finished transcript. Backed by Claude.

import { claudeJSON, claudeConfigured } from './claude.js';

export function interviewAiConfigured() {
  return claudeConfigured();
}

/**
 * Build the interview question set once the candidate has introduced themselves.
 * Returns an array of short, spoken-friendly questions tailored to this candidate and role.
 */
export async function generateQuestions({ position, company, intro, resumeText, jobDescription, count = 6 }) {
  const system =
    `You are an experienced interviewer at ${company} conducting a short first-round screening ` +
    `for the "${position}" role. From the candidate's self-introduction, their resume and the job ` +
    `description, write ${count} interview questions that probe their real fit for THIS role.\n\n` +
    `Rules:\n` +
    `- Each question is ONE sentence, spoken aloud, plain and clear (no numbering, no preamble).\n` +
    `- Build directly on specifics the candidate mentioned in their introduction and resume.\n` +
    `- Mix: one on a claim from their introduction, a couple on resume experience relevant to the role, ` +
    `one on a core skill the job needs, one situational/behavioural, one on expectations or availability.\n` +
    `- Keep them answerable in about 30 seconds each. No multi-part questions.\n` +
    `- Order them from easiest to most probing.\n` +
    `Return JSON: {"questions": ["...", "..."]}`;

  const prompt =
    `ROLE: ${position} at ${company}\n\n` +
    `CANDIDATE SELF-INTRODUCTION\n---------------------------\n${(intro || 'Not provided.').slice(0, 4000)}\n\n` +
    `JOB DESCRIPTION\n---------------\n${(jobDescription || 'Not provided — use the role title.').slice(0, 8000)}\n\n` +
    `RESUME\n------\n${(resumeText || 'No resume text available.').slice(0, 20000)}`;

  const out = await claudeJSON(system, prompt, 1024);
  const questions = Array.isArray(out?.questions) ? out.questions.filter((x) => typeof x === 'string' && x.trim()) : [];
  if (!questions.length) throw new Error('No questions were generated.');
  return questions.map((s) => s.trim()).slice(0, count);
}

/**
 * Score the finished interview transcript. Returns { score (0-10), summary, strengths[], concerns[],
 * recommendation }.
 */
export async function scoreInterview({ position, company, jobDescription, transcript }) {
  const convo = (transcript || [])
    .map((t) => `${t.role === 'ai' ? 'INTERVIEWER' : 'CANDIDATE'}: ${t.text}`)
    .join('\n');

  const system =
    `You are a hiring panel scoring a first-round screening interview for the "${position}" role at ${company}. ` +
    `Judge only what the candidate actually said — their relevance to the role, clarity, depth and any red flags. ` +
    `Transcripts come from speech-to-text and may contain minor transcription errors; do not penalise wording. ` +
    `Use the whole 0-10 scale; most real first-round candidates land between 4 and 7. A very short or evasive ` +
    `interview should score low.\n` +
    `Return JSON: {"score": number (0-10, one decimal), "summary": "2-3 sentences", ` +
    `"strengths": ["..."], "concerns": ["..."], "recommendation": "PROCEED" | "MAYBE" | "REJECT"}`;

  const prompt =
    `JOB DESCRIPTION\n---------------\n${(jobDescription || 'Not provided — use the role title.').slice(0, 8000)}\n\n` +
    `INTERVIEW TRANSCRIPT\n--------------------\n${convo.slice(0, 24000)}`;

  const out = await claudeJSON(system, prompt, 1024);
  let score = Number(out?.score);
  if (!Number.isFinite(score)) score = null;
  else score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));
  return {
    score,
    summary: out?.summary || '',
    strengths: Array.isArray(out?.strengths) ? out.strengths : [],
    concerns: Array.isArray(out?.concerns) ? out.concerns : [],
    recommendation: out?.recommendation || '',
  };
}
