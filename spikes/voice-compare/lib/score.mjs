// Scoring: Korean CER, English WER, key-term recall.

const PUNCT = /[\s.,!?;:'"`~\-–—…()[\]{}<>/\\|@#$%^&*_+=“”‘’「」『』、。·]/g;

// Korean number words with counters -> digits, applied to reference and hypothesis alike,
// so "두 개" and "2개" (or "하나" and "1개") are the same characters for CER.
const KO_NUM = [
  [/하나/g, '1개'], [/한개/g, '1개'], [/한잔/g, '1잔'], [/일개/g, '1개'],
  [/두개/g, '2개'], [/두잔/g, '2잔'], [/둘/g, '2개'], [/이개/g, '2개'],
  [/세개/g, '3개'], [/세잔/g, '3잔'], [/셋/g, '3개'], [/삼개/g, '3개'],
  [/네개/g, '4개'], [/네잔/g, '4잔'], [/넷/g, '4개'],
];

export function normKo(s) {
  let t = (s ?? '').toLowerCase().replace(PUNCT, '');
  for (const [re, to] of KO_NUM) t = t.replace(re, to);
  return t;
}

const EN_NUM = { 0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' };
export function wordsEn(s) {
  return (s ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
    .map((w) => EN_NUM[w] ?? w);
}

export function editDistance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Edit count and reference length: characters for Korean (CER), words for English (WER). */
export function errorCounts(lang, ref, hyp) {
  const [r, h] = lang === 'ko' ? [[...normKo(ref)], [...normKo(hyp)]] : [wordsEn(ref), wordsEn(hyp)];
  return { edits: editDistance(r, h), refLen: Math.max(1, r.length) };
}

/** Per-clip error rate. Not capped (insertions can push it above 1); summaries use corpus-level edits / reference length. */
export function errorRate(lang, ref, hyp) {
  const { edits, refLen } = errorCounts(lang, ref, hyp);
  return edits / refLen;
}

/** Key-term recall. Korean: substring match with spaces/punctuation removed (raw form, so "2개" and "두개" are both
 *  listed as variants). English: a term matches 1-4 consecutive words joined without spaces, allowing a plural s/es. */
export function termHits(lang, terms, hyp) {
  if (lang === 'ko') {
    const h = (hyp ?? '').toLowerCase().replace(PUNCT, '');
    return terms.map((vs) => vs.some((v) => h.includes(v.toLowerCase().replace(PUNCT, ''))));
  }
  const w = (hyp ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const grams = new Set();
  for (let i = 0; i < w.length; i++) {
    let g = '';
    for (let j = i; j < Math.min(w.length, i + 4); j++) { g += w[j]; grams.add(g); }
  }
  return terms.map((vs) => vs.some((v) => grams.has(v) || grams.has(v + 's') || grams.has(v + 'es')));
}

export function scoreClip(utt, hyp) {
  const hits = termHits(utt.lang, utt.terms, hyp);
  const { edits, refLen } = errorCounts(utt.lang, utt.text, hyp);
  return {
    errorRate: +(edits / refLen).toFixed(4),
    edits,
    refLen,
    termHits: hits.filter(Boolean).length,
    termTotal: hits.length,
    missedTerms: utt.terms.filter((_, i) => !hits[i]).map((vs) => vs[0]),
  };
}
