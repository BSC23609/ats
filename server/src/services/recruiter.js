// AI recruiter — answers an HR question across a set of pipeline candidates with Claude. It reads
// only the candidate summaries it is given, never the live database, and it advises only (it
// moves/sends nothing).

import { claudeText, claudeConfigured } from './claude.js';

const INSTRUCTIONS =
  `You are an AI recruiting assistant for an HR team at an industrial company. You are given a list ` +
  `of real job applicants from the company's recruitment pipeline. Each candidate shows a match ` +
  `score out of 10, years of experience, location, expected salary, notice period, the role they ` +
  `applied for, their current stage, and a one-line summary of their resume.\n\n` +
  `Answer the HR user's question using ONLY the candidates provided. Rules:\n` +
  `- Refer to candidates by name and reference code, e.g. "Priya (BSC-2610-0228)".\n` +
  `- Be concise and practical, like a helpful colleague. Short paragraphs or short lists.\n` +
  `- When asked to rank or shortlist, give an ordered list with a one-line reason for each pick.\n` +
  `- Base judgements only on the data given (score, experience, location, salary, summary). If ` +
  `something is not in the data, say you do not have it rather than guessing.\n` +
  `- Never invent candidates, resumes, or details that are not in the list.\n` +
  `- You advise only; you cannot move candidates or send anything.\n` +
  `- Reply in plain text. You may use simple dashes for lists. Do not use markdown headings or tables.`;

const inr = (n) => (n == null || n === '' ? null : '₹' + Number(n).toLocaleString('en-IN'));

/**
 * @param {string} question  the HR user's question
 * @param {Array}  candidates rows with { ref_code, full_name, position_applied, job_title, status,
 *                 total_experience, expected_ctc, notice_period_days, location, ai_score, ai_headline }
 * @returns {Promise<{answer?: string, error?: string}>} never throws
 */
export async function askRecruiter(question, candidates) {
  if (!claudeConfigured()) return { error: 'The AI recruiter is not configured (no ANTHROPIC_API_KEY on the server).' };
  if (!question || !question.trim()) return { error: 'Type a question first.' };
  if (!candidates.length)
    return { answer: 'There are no candidates in the current view, so there is nothing to look at. Clear the filters and try again.' };

  const lines = candidates
    .map((c, i) => {
      const score = c.ai_score != null ? `${Number(c.ai_score).toFixed(1)}/10` : 'not scored';
      const exp = c.total_experience != null ? `${c.total_experience} yrs exp` : 'experience not stated';
      const ctc = inr(c.expected_ctc) ? `expects ${inr(c.expected_ctc)}` : 'expected salary not stated';
      const notice = c.notice_period_days != null ? `${c.notice_period_days}d notice` : 'notice not stated';
      return (
        `${i + 1}. ${c.full_name} (${c.ref_code}) — role: ${c.job_title || c.position_applied}; ` +
        `stage: ${c.status}; match: ${score}; ${exp}; location: ${c.location || 'not stated'}; ` +
        `${ctc}; ${notice}. Summary: ${c.ai_headline || 'no resume summary available'}`
      );
    })
    .join('\n');

  const prompt =
    `CANDIDATES (${candidates.length})\n-----------\n${lines}\n\n` +
    `HR QUESTION\n-----------\n${question.trim()}`;

  try {
    const text = (await claudeText(INSTRUCTIONS, prompt, 1024)).trim();
    return { answer: text || 'The AI returned an empty answer. Try rephrasing the question.' };
  } catch (err) {
    return { error: err.message };
  }
}
