import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWikidataWorks, chunkTitleGroups } from '../src/services/qlever';
import { fetchWikidataTerms } from '../src/services/wikidata';
import { selectRelatedIds, collectQueryTerms, norm } from '../src/services/terms';
import type { RetrievalReport } from '../src/types';

const row = (id: number, title: string, cites = 1, year = 2020) => ({ work: `http://www.wikidata.org/entity/Q${id}`, title, year: String(year), cites: String(cites) });
const log = () => {};

function mockExec(subject: Record<string, string>[], title: Record<string, string>[], fail: { subject?: boolean; title?: boolean } = {}) {
  const calls: string[] = [];
  const exec = async (q: string) => {
    calls.push(q);
    if (q.includes('VALUES ?concept')) {
      if (fail.subject) throw new Error('subject boom');
      return subject;
    }
    if (q.includes('?work wdt:P921 wd:')) return fail.subject ? [] : subject; // single-concept retry
    if (q.includes('VALUES ?workType')) {
      if (fail.title) throw new Error('title boom');
      return title;
    }
    return [];
  };
  return { exec, calls };
}

test('subject channel is NOT filtered by title terms (a work tagged with the topic but with an unrelated title is kept)', async () => {
  const subject = Array.from({ length: 8 }, (_, i) => row(100 + i, `Prevalence in the Sfax region ${i}`));
  const { exec, calls } = mockExec(subject, []);
  const pubs = await searchWikidataWorks('Q948', ['Q1', 'Q2'], 'tunisia | tunisian', 500, 'ep', log, { exec, skipEnrich: true });
  assert.equal(pubs.length, 8);
  const subjectQuery = calls.find((c) => c.includes('VALUES ?concept'))!;
  assert.ok(!/CONTAINS/.test(subjectQuery), 'title filter leaked into the subject channel');
  assert.ok(subjectQuery.includes('wd:Q948') && subjectQuery.includes('wd:Q2'));
});

test('title channel always runs (previously only when fewer than 5 subject hits) and finds untagged works', async () => {
  const subject = Array.from({ length: 12 }, (_, i) => row(100 + i, `Tagged work ${i}`));
  const title = [row(500, 'Cancer registry of Tunisia, 2010'), row(501, 'Tunisian women and science')];
  const { exec, calls } = mockExec(subject, title);
  const rep = {} as RetrievalReport;
  const pubs = await searchWikidataWorks('Q948', [], 'tunisia', 500, 'ep', log, { exec, skipEnrich: true, report: rep });
  assert.ok(calls.some((c) => c.includes('VALUES ?workType')));
  assert.equal(pubs.length, 14);
  assert.equal(pubs.filter((p) => p.via === 'title').length, 2);
  assert.deepEqual(rep.merged, { total: 14, both: 0, subjectOnly: 12, titleOnly: 2, titleDropped: 0 });
  assert.equal(rep.title.ran, true);
});

test('works found by both channels are marked, and counted once', async () => {
  const shared = row(7, 'Tunisia health survey');
  const { exec } = mockExec([shared], [shared, row(8, 'Another Tunisia paper')]);
  const rep = {} as RetrievalReport;
  const pubs = await searchWikidataWorks('Q948', [], 'tunisia', 500, 'ep', log, { exec, skipEnrich: true, report: rep });
  assert.equal(pubs.length, 2);
  assert.equal(pubs.find((p) => p.omid === 'Q7')!.via, 'both');
  assert.equal(rep.merged.both, 1);
});

test('title-only substring false positives are discarded; subject hits are never discarded', async () => {
  const title = [row(1, 'Woman in science'), row(2, 'Research in Oman today'), row(3, 'Indiana University study')];
  const subject = [row(4, 'A study with Oman-unrelated title')];
  const { exec } = mockExec(subject, title);
  const rep = {} as RetrievalReport;
  const pubs = await searchWikidataWorks('Q842', [], 'oman', 500, 'ep', log, { exec, skipEnrich: true, report: rep });
  assert.deepEqual(pubs.map((p) => p.omid).sort(), ['Q2', 'Q4']);
  assert.equal(rep.merged.titleDropped, 2);
});

test('short terms are kept out of the title query; long term lists are chunked', async () => {
  const many = Array.from({ length: 130 }, (_, i) => `termnumber${i}`);
  const q = ['ai | wiki | ' + many.join(' | ')].join('\n');
  const { exec, calls } = mockExec([], []);
  await searchWikidataWorks('Q1', [], q, 100, 'ep', log, { exec, skipEnrich: true });
  const titleCalls = calls.filter((c) => c.includes('VALUES ?workType'));
  assert.equal(titleCalls.length, 3);
  assert.ok(titleCalls.every((c) => !c.includes('"ai"')), 'two-letter term sent to the title query');
  assert.ok(titleCalls[0].includes('"wiki"'));
  assert.equal(chunkTitleGroups([many], 50, 3).length, 3);
  assert.deepEqual(chunkTitleGroups([['ai', 'ok']]), []);
});

test('AND-groups are preserved when the OR-group is chunked', () => {
  const chunks = chunkTitleGroups([Array.from({ length: 60 }, (_, i) => 'alphaterm' + i), ['context', 'setting']], 50, 3);
  assert.equal(chunks.length, 2);
  chunks.forEach((c) => assert.deepEqual(c[1], ['context', 'setting']));
});

test('truncation is reported per channel', async () => {
  const subject = Array.from({ length: 5 }, (_, i) => row(100 + i, 'x' + i));
  const { exec } = mockExec(subject, []);
  const rep = {} as RetrievalReport;
  await searchWikidataWorks('Q1', [], '', 5, 'ep', log, { exec, skipEnrich: true, report: rep });
  assert.equal(rep.subject.truncated, true);
  assert.equal(rep.title.ran, false);
});

test('failure of one channel is tolerated, failure of both throws', async () => {
  const ok = await searchWikidataWorks('Q1', [], 'tunisia', 50, 'ep', log, { exec: mockExec([], [row(9, 'Tunisia paper')], { subject: true }).exec, skipEnrich: true });
  assert.equal(ok.length, 1);
  await assert.rejects(
    searchWikidataWorks('Q1', [], 'tunisia', 50, 'ep', log, { exec: async () => { throw new Error('down'); }, skipEnrich: true }),
    /both retrieval channels failed/
  );
});

// ------------------------------------------------------------------------------ term gathering
const ent = (label: string, extra: any = {}) => ({ labels: { en: { value: label }, fr: { value: label + 'FR' } }, aliases: {}, sitelinks: {}, claims: {}, ...extra });

function mockWeb() {
  const urls: string[] = [];
  const getJson = async (url: string) => {
    urls.push(url);
    if (url.includes('wikipedia.org')) {
      return { query: { pages: { 1: { title: 'Tunisia', redirects: [{ title: 'Tunisie' }, { title: 'Republic of Tunisia' }, { title: 'Tunesia' }, { title: 'Talk:Tunisia' }, { title: 'Tunisia (disambiguation)' }] } } } };
    }
    if (url.includes('ids=Q948&')) {
      return { entities: { Q948: ent('Tunisia', {
        aliases: { en: [{ value: 'Tunisian Republic' }] },
        sitelinks: { enwiki: { title: 'Tunisia' } },
        claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q6256' } } } }], P1549: [{ mainsnak: { datavalue: { value: { text: 'Tunisian', language: 'en' } } } }] },
      }) } };
    }
    const ids = decodeURIComponent((url.match(/ids=([^&]+)/) || [])[1] || '').split('|');
    return { entities: Object.fromEntries(ids.map((id) => [id, ent('Item ' + id, { sitelinks: {} })])) };
  };
  return { getJson, urls };
}

test('term gathering: names, demonyms, redirects; broader items are classified but never searched', async () => {
  const { getJson, urls } = mockWeb();
  const exec = async () => [
    { item: 'http://www.wikidata.org/entity/Q6256', rel: 'broader', sl: '900' },
    { item: 'http://www.wikidata.org/entity/Q3572', rel: 'narrower', sl: '120' },
    { item: 'http://www.wikidata.org/entity/Q3573', rel: 'narrower', sl: '300' },
    { item: 'http://www.wikidata.org/entity/Q500', rel: 'instance', sl: '10' },
  ];
  const logs: string[] = [];
  const terms = await fetchWikidataTerms('Q948', ['en', 'fr'], (m) => logs.push(m), { exec, getJson });
  const main = terms[0];
  const names = [...Object.values(main.labels), ...Object.values(main.aliases).flat()].map(norm);
  ['tunisia', 'tunisiafr', 'tunisian republic', 'tunisian', 'tunisie', 'republic of tunisia', 'tunesia'].forEach((n) => assert.ok(names.includes(n), `missing ${n}`));
  assert.ok(!names.some((n) => n.includes('talk:') || n.includes('disambiguation')), 'namespaced or disambiguation redirects kept');
  assert.equal(terms.find((t) => t.id === 'Q6256')!.rel, 'broader');
  assert.deepEqual(selectRelatedIds(terms), ['Q3573', 'Q3572', 'Q500']); // narrower by rank, then instance; no broader
  assert.ok(urls.some((u) => u.includes('languages=en|fr|mul')), 'mul language not requested');
  assert.ok(urls.some((u) => u.includes('sitefilter=enwiki|frwiki')), 'sitelinks not requested');
  assert.ok(logs.some((l) => /distinct names for the main item \(\d+ from Wikipedia redirects\)/.test(l)));
  assert.ok(collectQueryTerms(terms).all.length >= 9);
});

test('term gathering degrades gracefully: ranked query -> unranked query -> search API', async () => {
  const { getJson } = mockWeb();
  let n = 0;
  const exec = async (q: string) => {
    n++;
    if (q.includes('wikibase:sitelinks')) throw new Error('no sitelinks predicate');
    return [{ item: 'http://www.wikidata.org/entity/Q3572', rel: 'narrower' }];
  };
  const terms = await fetchWikidataTerms('Q948', ['en'], () => {}, { exec, getJson });
  assert.equal(n, 2);
  assert.ok(terms.some((t) => t.id === 'Q3572' && t.rel === 'narrower'));

  const failing = async () => { throw new Error('endpoint down'); };
  const getJson2 = async (url: string) =>
    url.includes('list=search') ? { query: { search: [{ title: 'Q777' }] } } : getJson(url);
  const t2 = await fetchWikidataTerms('Q948', ['en'], () => {}, { exec: failing, getJson: getJson2 });
  assert.ok(t2.some((t) => t.id === 'Q777'));
});

// ------------------------------------------------------------------------------ whole chain
import { buildQueryGroups } from '../src/services/terms';
import { computeStudyStats } from '../src/services/stats';
import { generatePaperWithLlm } from '../src/services/llm';
import { assessReadiness } from '../src/services/readiness';
import { Citer } from '../src/services/references';

test('accent-stripped spellings are searched in addition to the accented ones', () => {
  const [chunk] = chunkTitleGroups([['génomique', 'cancer']]);
  assert.deepEqual(chunk[0], ['génomique', 'genomique', 'cancer']);
});

test('end to end: terms -> query -> two channels -> statistics -> manuscript methods match the report', async () => {
  // 1. terms (mock web)
  const { getJson } = mockWeb();
  const exec1 = async () => [
    { item: 'http://www.wikidata.org/entity/Q6256', rel: 'broader', sl: '900' },
    { item: 'http://www.wikidata.org/entity/Q3572', rel: 'narrower', sl: '120' },
    { item: 'http://www.wikidata.org/entity/Q500', rel: 'instance', sl: '10' },
  ];
  const terms = await fetchWikidataTerms('Q948', ['en', 'fr'], () => {}, { exec: exec1, getJson });
  const groups = buildQueryGroups(terms);
  assert.ok(groups[0].includes('tunisian') && groups[0].includes('tunisie'));
  assert.ok(!groups[0].some((t) => /^item q6256/.test(t)), 'a broader class entered the query');

  // 2. retrieval (mock endpoint)
  let seed = 3; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mk = (id: number, title: string, y: number) => ({ ...row(id, title, Math.floor(r() * 20), y), doi: '10.1/' + id });
  const subject = Array.from({ length: 120 }, (_, i) => mk(1000 + i, `Study ${i} of an unspecified region`, 2000 + (i % 24)));
  const titleOnly = Array.from({ length: 90 }, (_, i) => mk(2000 + i, `Tunisian cohort ${i}`, 2000 + (i % 24)));
  const noise = [mk(3000, 'Woman in the wiki', 2010)];
  const { exec } = mockExec(subject, [...titleOnly, ...noise, subject[0]]);
  const rep = { languages: ['en', 'fr'], mainTerms: 7, relatedItems: { narrower: 1, instance: 1 } } as RetrievalReport;
  const pubs = await searchWikidataWorks('Q948', selectRelatedIds(terms), groups.map((g) => g.join(' | ')).join('\n'), 5000, 'ep', () => {}, { exec, skipEnrich: true, report: rep });
  assert.equal(pubs.length, 120 + 90);
  assert.equal(rep.merged.both, 1);
  assert.equal(rep.merged.titleDropped, 1); // "Woman in the wiki" does not match any Tunisia term at word boundaries

  // 3. statistics + manuscript
  pubs.forEach((p, i) => { p.authors = [{ k: 'a' + (i % 50), name: 'A' + (i % 50), aff: 'I', country: 'France' } as any]; });
  const stats = computeStudyStats(pubs, { excludeTerms: ['Tunisia'], retrieval: rep, currentYear: 2026 });
  const md = await generatePaperWithLlm('Tunisia', 'Q948', groups[0].join(' | '), stats, [], { db: 'W', qleverUrl: 'https://ep', mx: 5000, llmProvider: 'synthesizer', md: 'm', rp: '', pt: '' } as any, () => {}, {});
  assert.ok(md.includes('two complementary channels'));
  assert.ok(md.includes('The subject channel returned 120 works and the title channel 92'));
  assert.ok(md.includes('210 distinct works (119 found by subject only, 90 by title only, 1 by both; 1 title hits were discarded'));
  assert.ok(md.includes('broader classes of the topic are deliberately not searched'));
  assert.ok(md.includes('(en, fr)'));
  assert.ok(!/truncated sample/i.test(md));

  // 4. a truncated channel is a blocker
  const checks = assessReadiness({ stats: { ...stats, retrieval: { ...rep, subject: { ...rep.subject, truncated: true } } } as any, settings: { mx: 5000 } as any, markdown: md, cite: new Citer(), priorTotal: 0, priorResolved: 0, hypothesesAssessed: 5 });
  assert.ok(checks.some((c) => c.id === 'truncated' && c.level === 'blocker'));
});
