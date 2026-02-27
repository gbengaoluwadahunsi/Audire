/**
 * Turn a reading summary into different content formats: article, blog, LinkedIn, Twitter, TikTok.
 * Uses simple templates and character limits; user can edit before posting.
 */

const TWITTER_MAX = 280;
const TIKTOK_HOOK_MAX = 150;
const TIKTOK_SCRIPT_MAX = 500;
const LINKEDIN_OPTIMAL = 1300;

function truncate(s, max, suffix = '…') {
  const t = (s || '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - suffix.length).trim() + suffix;
}

function firstSentence(text, maxChars = 200) {
  const t = (text || '').trim();
  const match = t.match(/^[^.!?]+[.!?]/);
  if (match) return match[0].length <= maxChars ? match[0] : truncate(match[0], maxChars);
  return truncate(t, maxChars);
}

/** Article: structured long-form (intro, body, conclusion) */
export function formatForArticle(summaryText) {
  const s = (summaryText || '').trim();
  const intro = firstSentence(s, 120);
  const body = s.length > 500 ? s : s + '\n\n[Expand with more detail from your notes.]';
  const conclusion = 'Key takeaway: ' + firstSentence(s, 100);
  const content = `# Article

## Introduction
${intro}

## Main points
${body}

## Conclusion
${conclusion}
`;
  return { content, label: 'Article', charCount: content.length };
}

/** Blog post: title suggestion + body + CTA */
export function formatForBlog(summaryText) {
  const s = (summaryText || '').trim();
  const first = firstSentence(s, 80);
  const title = first.replace(/[.!?]+$/, '');
  const content = `# ${title}

${s}

---
*What would you add? Drop a comment below.*
`;
  return { content, label: 'Blog post', charCount: content.length };
}

/** LinkedIn: professional tone, optimal length ~1300 */
export function formatForLinkedIn(summaryText) {
  const s = (summaryText || '').trim();
  const hook = firstSentence(s, 150);
  const body = s.length > LINKEDIN_OPTIMAL ? truncate(s, LINKEDIN_OPTIMAL) : s;
  const content = `${hook}

${body}

#reading #learning #books
`;
  return { content, label: 'LinkedIn', charCount: content.length };
}

/** Twitter/X: 280 chars or thread hint */
export function formatForTwitter(summaryText) {
  const s = (summaryText || '').trim();
  const one = truncate(s, TWITTER_MAX);
  const content = one.length < s.length
    ? one + '\n\n— Thread 🧵 (continue in next tweets)'
    : one;
  return { content, label: 'Twitter/X', charCount: one.length };
}

/** TikTok: hook (short) + script (for caption or voiceover) */
export function formatForTikTok(summaryText) {
  const s = (summaryText || '').trim();
  const hook = truncate(s, TIKTOK_HOOK_MAX);
  const script = truncate(s, TIKTOK_SCRIPT_MAX);
  const content = `HOOK (first 3 sec):
${hook}

SCRIPT / CAPTION:
${script}
`;
  return { content, label: 'TikTok', charCount: hook.length + script.length };
}

export const FORMATS = [
  { id: 'article', fn: formatForArticle },
  { id: 'blog', fn: formatForBlog },
  { id: 'linkedin', fn: formatForLinkedIn },
  { id: 'twitter', fn: formatForTwitter },
  { id: 'tiktok', fn: formatForTikTok },
];
