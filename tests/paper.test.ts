import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Citer, REFS, formatReference } from '../src/services/references';
import { parseCrossref, stripJats, toRef, extractCorpusFacts } from '../src/services/crossref';
import type { CrossrefWork } from '../src/services/crossref';
import { compareWithLiterature } from '../src/services/benchmarks';
import { validateSynthesis } from '../src/services/grounded';
import type { SourceForSynthesis } from '../src/services/grounded';
import { computeStudyStats } from '../src/services/stats';
import { generatePaperWithLlm } from '../src/services/llm';
import { assessReadiness } from '../src/services/readiness';
import { buildAbstract, wordCount } from '../src/services/paper';
import type { Publication } from '../src/types';

let seed = 17;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} !~ ${b}`);

test('every citation key used in the source code exists in the reference bank', () => {
  const dir = path.resolve('src/services');
  const keys = new Set<string>();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf-8');
    for (const m of src.matchAll(/\b(?:c|cite)\.(?:p|n)\(([^)]*)\)/g))
      for (const k of m[1].matchAll(/'([a-z0-9]+)'/g)) keys.add(k[1]);
    for (const m of src.matchAll(/\{\{[pn]:([a-z0-9,]+)\}\}/g)) m[1].split(',').forEach((k) => keys.add(k));
  }
  assert.ok(keys.size > 20, `only ${keys.size} keys found`);
  const missing = [...keys].filter((k) => !REFS[k]);
  assert.deepEqual(missing, []);
});

test('reference bank is well-formed', () => {
  for (const [k, r] of Object.entries(REFS)) {
    assert.equal(r.key, k);
    assert.ok(r.authors.length && r.year > 1900 && r.title, k);
    if (r.type === 'article') assert.ok(r.container, k);
    if (r.type === 'book') assert.ok(r.publisher, k);
    assert.ok(!r.authors.some((a) => !a.includes(',')), `author format in ${k}`);
  }
});

test('Citer formats author-year citations and a matching list', () => {
  const c = new Citer();
  assert.equal(c.p('lotka1926'), '(Lotka 1926)');
  assert.equal(c.p('price1963', 'lotka1926'), '(Lotka 1926; Price 1963)');
  assert.equal(c.p('glanzelschubert1988'), '(Glänzel and Schubert 1988)');
  assert.equal(c.n('wuchty2007'), 'Wuchty et al. (2007)');
  assert.throws(() => c.p('doesnotexist'), /Unknown reference key/);
  const list = c.list();
  assert.equal(list.split('\n\n').length, 4); // Price 1963 is cited twice but listed once
  assert.ok(list.indexOf('Glänzel') < list.indexOf('Lotka') && list.indexOf('Lotka') < list.indexOf('Price'));
  assert.ok(!list.includes('Bradford'));
  assert.ok(c.unverified().includes('lotka1926') && !c.unverified().includes('wuchty2007'));
  assert.match(formatReference(REFS.nielsen2017), /In Blomqvist, E., Hose, K., & Paulheim, H\. \(Eds\.\)/);
  assert.match(formatReference(REFS.bornmann2021), /https:\/\/doi\.org\/10\.1057\/s41599-021-00903-w/);
});

test('Citer disambiguates same author-year works with a/b', () => {
  const c = new Citer();
  const mk = (key: string, title: string) => ({ key, type: 'article' as const, authors: ['Smith, J.', 'Doe, A.'], year: 2020, title, container: 'J', status: 'resolved' as const });
  c.register(mk('s1', 'Alpha study')); c.register(mk('s2', 'Beta study'));
  assert.equal(c.p('s1'), '(Smith and Doe 2020a)');
  assert.equal(c.p('s2'), '(Smith and Doe 2020b)');
  assert.equal(c.fresh().citedKeys().length, 0);
});

const fixture = {
  message: {
    DOI: '10.1234/ABC', title: ['A bibliometric   analysis of Topic X'],
    author: [{ given: 'Jean-Pierre Marie', family: 'Dupont' }, { given: 'Aïcha', family: 'Ben Salah' }, { name: 'The Consortium' }],
    issued: { 'date-parts': [[2019, 5]] }, 'container-title': ['Scientometrics'], volume: 120, issue: '2', page: '100-115', type: 'journal-article',
    abstract: '<jats:p><jats:title>Abstract</jats:title>We analysed 1,234 documents published 2005–2018 &amp; found growth.</jats:p>',
  },
};

test('Crossref parsing, initials, JATS stripping, citable-reference rule', () => {
  const w = parseCrossref(fixture)!;
  assert.equal(w.doi, '10.1234/abc');
  assert.deepEqual(w.authors, ['Dupont, J.-P. M.', 'Ben Salah, A.', 'The Consortium']);
  assert.equal(w.title, 'A bibliometric analysis of Topic X');
  assert.equal(w.pages, '100–115');
  assert.equal(w.year, 2019);
  assert.equal(stripJats(fixture.message.abstract), 'We analysed 1,234 documents published 2005–2018 & found growth.');
  const ref = toRef(w, 'prior:x')!;
  assert.equal(ref.status, 'resolved');
  assert.equal(toRef({ ...w, authors: [] }, 'k'), null);
  assert.equal(toRef({ ...w, container: '' }, 'k'), null);
  assert.equal(parseCrossref({}), null);
});

test('abstract facts are extracted only when explicitly stated', () => {
  assert.deepEqual(extractCorpusFacts('We analysed 1,234 documents published 2005–2018.'), { docs: 1234, docsText: '1,234 documents', period: [2005, 2018] });
  assert.deepEqual(extractCorpusFacts('A narrative review of the field.'), { docs: null, docsText: null, period: null });
  assert.equal(extractCorpusFacts('Of 3 papers, 2 were relevant').docs, null);
});

test('grounded synthesis keeps only traceable sentences and cites only kept sources', () => {
  const c = new Citer();
  const mk = (i: number, abs: string): SourceForSynthesis => {
    c.register({ key: 'k' + i, type: 'article', authors: ['Au' + i + ', X.'], year: 2000 + i, title: 'T' + i, container: 'J', status: 'resolved' });
    return { tag: 'S' + i, key: 'k' + i, year: 2000 + i, title: 'Study ' + i, abstract: abs };
  };
  const src = [mk(1, 'We analysed 1,234 documents on the topic.'), mk(2, 'A review of methods in the field.'), mk(3, 'Another study of authors.')];
  const out = validateSynthesis(
    'The first study analysed 1,234 documents [S1]. It found a 45% rise [S1]. This sentence has no source. A second study reviewed methods [S2]. Unknown tag here [S9].',
    src, c.fresh()
  );
  assert.equal(out.kept, 2);
  assert.equal(out.dropped, 3);
  assert.ok(out.text.includes('1,234') && !out.text.includes('45%'));
  const probe = c.fresh();
  validateSynthesis('Only a fabricated 99% claim [S3].', src, probe);
  assert.equal(probe.citedKeys().length, 0);
});

// ---------------------------------------------------------------------- synthetic corpora
const pub = (id: string, year: number, cites: number, o: Partial<Publication> = {}): Publication => ({
  id, title: o.title ?? `Study of subject ${id}`, year, venue: o.venue ?? 'J1', doi: o.doi ?? '10.1/' + id, omid: id,
  cites, authors: o.authors ?? [], keywords: o.keywords ?? [], origin: 'search', ...o,
});
const author = (n: number, country = 'Germany') => ({ k: 'a' + n, name: 'Author ' + n, aff: 'Inst ' + (n % 9), country });

function corpus(growth: number, teamRising: boolean, skewed: boolean): Publication[] {
  const out: Publication[] = [];
  let id = 0;
  for (let t = 0; t < 25; t++) {
    const n = Math.round(12 * (1 + growth) ** t);
    for (let i = 0; i < n; i++) {
      const size = teamRising ? 1 + Math.floor(rnd() * (1 + t / 4)) : 2;
      const cites = skewed ? Math.floor(Math.pow(1 / (1 - rnd() * 0.98), 1.8) - 1) : 5 + Math.floor(rnd() * 3);
      out.push(pub('w' + id++, 1995 + t, cites, { venue: 'J' + Math.floor(rnd() * 30), authors: Array.from({ length: size }, () => author(Math.floor(rnd() * 400))) }));
    }
  }
  return out;
}

test('benchmark outcomes follow their decision rules', () => {
  const c = new Citer();
  const a = compareWithLiterature(computeStudyStats(corpus(0.07, true, true), { currentYear: 2030 }), c);
  const get = (rows: ReturnType<typeof compareWithLiterature>, id: string) => rows.find((r) => r.id === id)!;
  assert.equal(get(a, 'H1').outcome, 'supported');
  assert.equal(get(a, 'H4').outcome, 'supported');
  assert.equal(get(a, 'H5').outcome, 'supported');
  const b = compareWithLiterature(computeStudyStats(corpus(0.3, false, false), { currentYear: 2030 }), new Citer());
  assert.equal(get(b, 'H1').outcome, 'not supported'); // 30% a year is far above published rates
  assert.equal(get(b, 'H4').outcome, 'not supported'); // constant team size
  assert.equal(get(b, 'H5').outcome, 'not supported'); // citations nearly uniform
  assert.ok(a.every((r) => r.discussion.length > 40));
});

// ---------------------------------------------------------------------- full manuscript
const settings: any = { db: 'Wikidata (QLever)', qleverUrl: 'https://qlever.example/api', mx: 100000, llmProvider: 'synthesizer', md: 'm', rp: '', pt: '' };

async function manuscript(recs: Publication[], extra: { callModel?: (p: string) => Promise<string> } = {}) {
  const stats = computeStudyStats(recs, { excludeTerms: ['Topic X'], currentYear: 2030 });
  const priors: Publication[] = [
    pub('p1', 2019, 40, { title: 'A bibliometric analysis of Topic X', doi: '10.1234/abc', reviewType: 'bibliometric' } as any),
    pub('p2', 2016, 12, { title: 'A systematic review of Topic X', doi: '10.1234/def', reviewType: 'systematic_review' } as any),
    pub('p3', 2012, 3, { title: 'Survey of Topic X without DOI', doi: '', reviewType: 'conceptual_survey' } as any),
  ];
  const works: Record<string, CrossrefWork> = {
    '10.1234/abc': parseCrossref(fixture)!,
    '10.1234/def': { doi: '10.1234/def', title: 'A systematic review of Topic X', authors: ['Garcia, M.', 'Lee, S.'], year: 2016, container: 'Journal of Reviews', volume: '4', issue: '1', pages: '1–20', type: 'journal-article', abstract: 'We screened 312 records and included studies on the field.' },
  };
  const logs: string[] = [];
  const md = await generatePaperWithLlm('Topic X', 'Q123', '"topic x"', stats, priors, settings, (m) => logs.push(m), {
    fetchWork: async (doi) => works[doi.toLowerCase()] || null,
    callModel: extra.callModel,
  });
  return { md, stats, logs };
}

test('full manuscript: structure, citations, references, abstract, no artefacts', async () => {
  const { md, logs } = await manuscript(corpus(0.07, true, true));
  for (const h of ['## Abstract', '## 1. Introduction', '## 2. Background and hypotheses', '### 2.6 Prior reviews', '## 3. Data and methods', '## 4. Results', '## 5. Discussion', '### 5.2 Comparison with the literature', '## 6. Conclusions', '## Declarations', '## References'])
    assert.ok(md.includes(h), `missing ${h}`);
  assert.ok(md.includes('**Table 28.**'));
  ['H1', 'H2', 'H3', 'H4', 'H5'].forEach((h) => assert.ok(md.includes(`**${h}.**`), h));
  assert.ok(!/undefined|NaN|\[object|null%/.test(md), 'artefact in text');
  // abstract length
  const abs = md.match(/## Abstract\s+([\s\S]*?)\n\n\*\*Keywords/)![1];
  assert.ok(wordCount(abs) <= 250, `abstract ${wordCount(abs)} words`);
  // reference list <-> text consistency
  const [body, refs] = md.split('## References');
  const entries = refs.trim().split('\n\n').filter(Boolean);
  assert.ok(entries.length >= 20, `only ${entries.length} refs`);
  for (const e of entries) {
    const sur = e.split(',')[0].replace(/\*/g, '').trim();
    const year = e.match(/\((\d{4})[a-z]?\)/)![1];
    assert.ok(new RegExp(`${sur}[^\\n]{0,45}${year}`).test(body), `reference not cited in text: ${e.slice(0, 60)}`);
  }
  // prior studies: resolved ones cited and listed, the one without DOI is not
  assert.ok(refs.includes('Dupont, J.-P. M.'));
  assert.ok(!refs.includes('without DOI'));
  assert.ok(md.includes('1,234 documents'), 'abstract fact shown in Table 2');
  assert.ok(!/\(Bornmann et al\. \(|Bradford \(Bradford|\{\{[pn]:/.test(md), 'duplicate or unresolved citation');
  assert.ok(logs.some((l) => /Pre-submission BLOCKER: \d+ author placeholder/.test(l)));
});

test('LLM synthesis: fabricated numbers are rejected, supported sentences kept and cited', async () => {
  const { md } = await manuscript(corpus(0.07, true, true), {
    callModel: async () =>
      'The bibliometric analysis covered 1,234 documents [S1]. It reported a 77% increase [S1]. The systematic review screened 312 records [S2].',
  });
  assert.ok(md.includes('The bibliometric analysis covered 1,234 documents (Dupont'));
  assert.ok(md.includes('screened 312 records'));
  assert.ok(!md.includes('77%'));
  assert.ok(md.includes('drafted the synthesis in Section 2.6'));
});

test('readiness: blockers are reported', async () => {
  const { md, stats } = await manuscript(corpus(0.07, true, true));
  const checks = assessReadiness({ stats, settings: { ...settings, mx: 5 }, markdown: md, cite: new Citer(), priorTotal: 3, priorResolved: 2, hypothesesAssessed: 5 });
  const ids = checks.filter((x) => x.level === 'blocker').map((x) => x.id);
  assert.ok(ids.includes('truncated') && ids.includes('placeholders'));
  assert.ok(checks.some((x) => x.id === 'prior' && x.level === 'warning'));
  near(checks.findIndex((x) => x.level === 'blocker'), 0);
});

test('abstract builder stays within 250 words even for rich results', async () => {
  const { stats } = await manuscript(corpus(0.07, true, true));
  const c = new Citer();
  const bench = compareWithLiterature(stats, c);
  const abs = buildAbstract({ topic: 'Topic X', selectedId: 'Q1', queryText: 'x', stats, settings, cite: c, bench, prior: [], priorTotal: 0, llmUsed: false, date: '2026-10-24' });
  assert.ok(wordCount(abs) <= 250);
});

test('tables are numbered in order of appearance and every mention is remapped', async () => {
  const { md } = await manuscript(corpus(0.07, true, true));
  const caps = [...md.matchAll(/\*\*Table (\d+)\./g)].map((m) => parseInt(m[1], 10));
  assert.deepEqual(caps, caps.map((_, i) => i + 1));
  const mentioned = [...md.matchAll(/\bTable (\d+)\b/g)].map((m) => parseInt(m[1], 10));
  assert.ok(mentioned.every((n) => n >= 1 && n <= caps.length), 'dangling table reference');
});

test('renumberTables remaps captions, singular and range mentions', async () => {
  const { renumberTables } = await import('../src/services/paper');
  const out = renumberTables('See Table 2 and Tables 17–18.\n\n**Table 2.** A\n\n**Table 17.** B\n\n**Table 18. C**\n');
  assert.equal(out, 'See Table 1 and Tables 2–3.\n\n**Table 1.** A\n\n**Table 2.** B\n\n**Table 3. C**\n');
});

test('reference list orders single-author works before multi-author works of the same first author', () => {
  const c = new Citer();
  c.p('eggherousseau1990', 'egghe2005', 'egghe2006');
  const l = c.list();
  assert.ok(l.indexOf('(2005)') < l.indexOf('(2006)') && l.indexOf('(2006)') < l.indexOf('(1990)'));
});

test('numerals are spelled out in the abstract and the conclusions', async () => {
  const { md } = await manuscript(corpus(0.07, true, true));
  const abs = md.match(/## Abstract\s+([\s\S]*?)\n\n\*\*Keywords/)![1];
  assert.match(abs, /test five hypotheses/);
  assert.ok(!/(^|\. )\d/.test(abs), 'sentence starts with a numeral');
});
