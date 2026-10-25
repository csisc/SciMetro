import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import {
  APP_VERSION, RELATED_WORKS, PIPELINE_PARTS, DATA_SOURCES, toolCitation, relatedApa, relatedBibtex, formatAuthors, kindTag,
} from '../src/config/citation';

const balanced = (s: string) => (s.match(/{/g) || []).length === (s.match(/}/g) || []).length;

test('the displayed version equals the package version', () => {
  assert.equal(APP_VERSION, JSON.parse(fs.readFileSync('package.json', 'utf-8')).version);
});

test('tool citation: version, year, clean URL, no invented author or DOI', () => {
  const c = toolCitation('https://example.org/app/?x=1#cite-tool', new Date('2026-10-25T10:00:00Z'));
  assert.match(c.apa, /^SciMetro Studio\. \(2026\)\. SciMetro Studio \(Version 1\.0\.0\) \[Computer software\]\. https:\/\/example\.org\/app\/ \(accessed 25 October 2026\)$/);
  assert.ok(!/\?x=1|#cite-tool/.test(c.apa + c.bibtex));
  assert.ok(balanced(c.bibtex) && c.bibtex.startsWith('@software{scimetro_studio_2026,'));
  assert.ok(!/doi|author/i.test(c.bibtex), 'invented identifier or author');
  assert.ok(c.bibtex.includes('Accessed 2026-10-25'));
});

test('related works: complete, unique, identifiers well-formed, all pipeline parts covered', () => {
  assert.equal(RELATED_WORKS.length, 14);
  assert.equal(new Set(RELATED_WORKS.map((w) => w.id)).size, RELATED_WORKS.length);
  for (const w of RELATED_WORKS) {
    assert.ok(w.title && w.year >= 2016 && w.authors.length >= 1 && w.summary && w.relation, w.id);
    assert.ok(w.authors.some((a) => a.startsWith('Turki, H')), `${w.id}: Turki missing from authors`);
    assert.ok(w.doi || w.url, `${w.id}: no identifier`);
    if (w.doi) assert.match(w.doi, /^10\.\d{4,9}\/\S+$/);
    if (w.url) assert.match(w.url, /^https:\/\//);
    assert.ok(w.italic === '' || w.venue.includes(w.italic), `${w.id}: italic part not in venue`);
    assert.ok(w.part in PIPELINE_PARTS);
    assert.ok(['article', 'letter', 'research letter', 'comment', 'editorial'].includes(w.kind), `${w.id}: kind`);
  }
  const used = new Set(RELATED_WORKS.map((w) => w.part));
  assert.deepEqual([...used].sort(), Object.keys(PIPELINE_PARTS).sort());
});

test('reference formatting', () => {
  assert.equal(formatAuthors(['A, B.']), 'A, B.');
  assert.equal(formatAuthors(['A, B.', 'C, D.']), 'A, B. & C, D.');
  const w = RELATED_WORKS.find((x) => x.id === 'turki2019')!;
  assert.equal(
    relatedApa(w),
    'Turki, H., Shafee, T., Hadj Taieb, M. A., Ben Aouicha, M., Vrandečić, D., Das, D., & Hamdi, H. (2019). Wikidata: A large-scale collaborative ontological medical database. Journal of Biomedical Informatics, 99, 103292. https://doi.org/10.1016/j.jbi.2019.103292'
  );
  const keys = RELATED_WORKS.map((x) => relatedBibtex(x).match(/^@\w+\{([^,]+),/)![1]);
  assert.equal(new Set(keys).size, keys.length, 'duplicate BibTeX keys');
  RELATED_WORKS.forEach((x) => assert.ok(balanced(relatedBibtex(x)), x.id));
  assert.match(relatedBibtex(RELATED_WORKS.find((x) => x.id === 'turki2021talk')!), /^@misc\{/);
  assert.match(relatedBibtex(RELATED_WORKS.find((x) => x.id === 'turki2023wd')!), /^@inproceedings\{/);
});

// Identifiers and pages as verified against the publisher, PubMed, RePEc or Crossref-derived records.
const VERIFIED_LETTERS: Record<string, { kind: string; doi: string; pages: string; year: number }> = {
  turki2016: { kind: 'letter', doi: '10.1007/s11192-015-1808-y', pages: '106(3), 1281–1282', year: 2016 },
  turki2018letters: { kind: 'letter', doi: '10.1007/s11192-018-2906-4', pages: '117(2), 1285–1287', year: 2018 },
  turki2019arab: { kind: 'research letter', doi: '10.1007/s11192-019-03127-7', pages: '120(1), 337–339', year: 2019 },
  turki2020nobel: { kind: 'letter', doi: '10.1007/s11192-020-03456-y', pages: '124(1), 787–790', year: 2020 },
  turki2022beauties: { kind: 'research letter', doi: '10.1007/s11192-022-04501-8', pages: '127(10), 6047–6050', year: 2022 },
  turki2018jce: { kind: 'comment', doi: '10.1016/j.jclinepi.2017.11.002', pages: '97, 124–125', year: 2018 },
};

test('the letters and comments are included, with the identifiers and pages that were verified', () => {
  for (const [id, v] of Object.entries(VERIFIED_LETTERS)) {
    const w = RELATED_WORKS.find((x) => x.id === id);
    assert.ok(w, `missing ${id}`);
    assert.equal(w!.kind, v.kind, id);
    assert.equal(w!.doi, v.doi, id);
    assert.equal(w!.year, v.year, id);
    assert.ok(w!.venue.includes(v.pages), `${id}: pages ${w!.venue}`);
  }
  assert.equal(RELATED_WORKS.filter((w) => w.kind !== 'article' && w.kind !== 'editorial').length, 6);
  const ed = RELATED_WORKS.find((w) => w.id === 'benaouicha2023editorial')!;
  assert.equal(ed.kind, 'editorial');
  assert.equal(ed.doi, '10.3389/frma.2023.1275731');
  assert.ok(ed.venue.includes('8, 1275731') && ed.year === 2023);
  assert.ok(relatedApa(ed).includes('Editorial: Linked open bibliographic data for real-time research assessment [Editorial].'));
  assert.ok(RELATED_WORKS.filter((w) => w.kind === 'article').every((w) => !/letter|comment/i.test(kindTag(w))));
});

test('article type appears in APA and BibTeX', () => {
  const l = RELATED_WORKS.find((w) => w.id === 'turki2018letters')!;
  assert.ok(relatedApa(l).includes('The value of letters to the editor [Letter to the editor]. Scientometrics'));
  assert.ok(relatedApa(RELATED_WORKS.find((w) => w.id === 'turki2019arab')!).includes('[Research letter]'));
  assert.ok(relatedApa(RELATED_WORKS.find((w) => w.id === 'turki2018jce')!).includes('[Comment]'));
  assert.ok(relatedBibtex(l).includes('note   = {Letter to the editor}'));
  assert.ok(!relatedBibtex(RELATED_WORKS.find((w) => w.id === 'turki2019')!).includes('note'));
  assert.equal(kindTag(RELATED_WORKS.find((w) => w.id === 'turki2019')!), '');
});

test('claims about each letter stay within what its own record states', () => {
  const by = (id: string) => RELATED_WORKS.find((w) => w.id === id)!;
  // the comment has no abstract: the summary must say so instead of describing its content
  assert.ok(/no abstract/i.test(by('turki2018jce').summary));
  // the Nobel letter suggests co-citation networks; the pipeline builds none, and the entry must say so
  assert.ok(/does not yet build the citation or co-citation networks/.test(by('turki2020nobel').relation));
  assert.ok(/does not assess their eligibility/.test(by('turki2018jce').relation));
});

test('data sources to acknowledge are listed', () => {
  assert.deepEqual(DATA_SOURCES.map((d) => d.name.split(' ')[0]), ['Wikidata', 'QLever', 'Crossref', 'Wikipedia']);
});

test('interface: "To Cite the Tool" section and header link render with all works, links and copy actions', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const cite: any = await vite.ssrLoadModule('/src/components/CiteTool.tsx');
    const head: any = await vite.ssrLoadModule('/src/components/Header.tsx');
    const html = renderToStaticMarkup(React.createElement(cite.CiteTool));
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    assert.ok(html.includes('id="cite-tool"') && text.includes('To Cite the Tool'));
    assert.ok(text.includes('Related work by Houcemeddine Turki'));
    assert.ok(text.includes('do not endorse this software'), 'relation to the tool must be stated as background, not endorsement');
    for (const w of RELATED_WORKS) {
      assert.ok(text.includes(w.title), `missing: ${w.title}`);
      const link = w.doi ? `https://doi.org/${w.doi}` : w.url!;
      assert.ok(html.includes(`href="${link}"`), `missing link ${link}`);
    }
    Object.values(PIPELINE_PARTS).forEach((p) => assert.ok(text.includes(p.label), p.label));
    assert.ok(text.includes('Version 1.0.0') && text.includes('Copy APA') && text.includes('Copy BibTeX') && text.includes('Copy all (APA)'));
    assert.ok(/<em>Journal of Biomedical Informatics, 99<\/em>/.test(html), 'venue not italicised');
    assert.equal((html.match(/uppercase tracking-wide/g) || []).length, 7, 'type badges (6 letters/comments + 1 editorial)');
    assert.ok(text.includes('[Letter to the editor]') && text.includes('[Research letter]') && text.includes('[Comment]'));
    assert.ok(text.includes('including 6 letters to the editor and comments and 1 editorial'));
    assert.ok(text.includes('[Editorial]'));
    assert.ok(html.includes('rel="noreferrer noopener"'));

    const h = renderToStaticMarkup(React.createElement(head.Header, { onOpenStoredStudies: () => {}, storedStudiesCount: 0 }));
    assert.ok(h.includes('href="#cite-tool"') && h.includes('To Cite the Tool'));
  } finally {
    await vite.close();
  }
});
