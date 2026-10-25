import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gini, concentration, hIndexFamily, characteristicScores, expectedCitationsByYear,
  relativeCitationRate, percentileByWork, top10Share, fitGrowthModels, tCrit975, periodTable,
  enrichEdges, analyseNetwork, diversity, screenRecords, bradfordMultiplier,
} from '../src/services/scientometrics';
import { fitLotka, countryOf, computeStudyStats } from '../src/services/stats';
import type { Publication, ScientometricNetwork } from '../src/types';

const near = (a: number, b: number, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} !~ ${b}`);
const pub = (id: string, year: number, cites: number, o: Partial<Publication> = {}): Publication => ({
  id, title: o.title ?? `Title of paper number ${id}`, year, venue: o.venue ?? 'J', doi: o.doi ?? '',
  omid: id, cites, authors: o.authors ?? [], keywords: o.keywords ?? [], origin: 'search',
});

test('gini: equal = 0, one-holder = (n-1)/n', () => {
  near(gini([1, 1, 1, 1]), 0);
  near(gini([0, 0, 0, 4]), 0.75);
});

test('concentration shares', () => {
  const c = concentration([50, 10, 10, 10, 5, 5, 4, 3, 2, 1]);
  assert.equal(c.n, 10);
  near(c.top10PctShare, 50, 0.1); // top 1 of 10 holds 50 of 100
});

test('h, g (Egghe, can exceed N), A, R', () => {
  const f = hIndexFamily([10, 8, 5, 4, 3]);
  assert.equal(f.h, 4); assert.equal(f.g, 5);
  near(f.a, 6.75); near(f.r, Math.sqrt(27), 0.01);
  assert.equal(hIndexFamily([100, 0, 0]).g, 10); // g > N via zero-padding
  assert.equal(hIndexFamily([]).h, 0);
});

test('characteristic scores and scales', () => {
  const css = characteristicScores([0, 0, 0, 0, 1, 1, 2, 3, 5, 40])!;
  near(css.beta1, 5.2);
  assert.equal(css.classes.reduce((a, c) => a + c.docs, 0), 10);
  assert.equal(css.classes[3].docs, 1);
  near(css.classes.reduce((a, c) => a + c.citationsPct, 0), 100, 0.2);
  assert.equal(characteristicScores([1, 2, 3]), null);
});

test('relative citation rate: year-stratified expectation', () => {
  const ref = [0, 5, 10, 15, 20].map((c, i) => pub('a' + i, 2000, c));
  const exp = expectedCitationsByYear(ref);
  near(exp.get(2000)!, 10);
  near(relativeCitationRate([ref[4]], exp).rcr!, 2.0);
  near(relativeCitationRate(ref, exp).rcr!, 1.0);
  assert.equal(relativeCitationRate([pub('z', 1990, 5)], exp).rcr, null); // no cohort
});

test('top-10% share within year cohorts', () => {
  const ref = Array.from({ length: 20 }, (_, i) => pub('p' + i, 2005, i)); // cites 0..19
  const pct = percentileByWork(ref);
  near(top10Share(ref, pct)!, 10, 0.1); // exactly the top 2 of 20
});

test('t critical values', () => {
  near(tCrit975(5), 2.571, 0.01); near(tCrit975(10), 2.228, 0.005); near(tCrit975(30), 2.042, 0.003);
});

test('growth: exponential data recovers rate with CI covering truth; linear data prefers linear', () => {
  const exp: [number, number][] = Array.from({ length: 15 }, (_, t) => [2000 + t, 5 * 1.1 ** t]);
  const g = fitGrowthModels(exp)!;
  near(g.exponential.ratePct, 10, 0.01);
  assert.equal(g.preferred, 'exponential');
  const lin: [number, number][] = Array.from({ length: 15 }, (_, t) => [2000 + t, 3 + 2 * t]);
  assert.equal(fitGrowthModels(lin)!.preferred, 'linear');
  // noisy exponential: CI must bracket the point estimate
  let seed = 3; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const noisy: [number, number][] = Array.from({ length: 20 }, (_, t) => [2000 + t, 10 * 1.08 ** t * (0.8 + 0.4 * r())]);
  const gn = fitGrowthModels(noisy)!;
  assert.ok(gn.exponential.ciLowPct < gn.exponential.ratePct && gn.exponential.ratePct < gn.exponential.ciHighPct);
  assert.equal(fitGrowthModels([[2000, 1], [2001, 2]]), null);
});

test('period table: width, partial flag, current year excluded', () => {
  const recs: Publication[] = [];
  for (let y = 2000; y <= 2019; y++) recs.push(pub('y' + y, y, y - 1990), pub('y' + y + 'b', y, 1));
  recs.push(pub('now', 2026, 0));
  const t = periodTable(recs, 2026);
  assert.equal(t.width, 5);
  assert.equal(t.rows.length, 4);
  assert.equal(t.rows[0].docs, 10);
  assert.equal(t.excludedCurrentYear, 1);
});

test('network: two cliques + bridge -> 2 communities, bridge nodes top betweenness', () => {
  const ids = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4'];
  const nodes = ids.map((id) => ({ id, name: id, type: 'keyword' as const, weight: 5 }));
  const edges: { source: string; target: string; weight: number }[] = [];
  for (const g of [ids.slice(0, 4), ids.slice(4)])
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) edges.push({ source: g[i], target: g[j], weight: 3 });
  edges.push({ source: 'a4', target: 'b1', weight: 1 });
  const a = analyseNetwork({ nodes, edges } as ScientometricNetwork);
  assert.equal(a.communities.length, 2);
  assert.equal(a.components, 1);
  assert.ok(a.modularity! > 0.3, `Q=${a.modularity}`);
  assert.deepEqual(new Set(a.centrality.slice(0, 2).map((c) => c.id)), new Set(['a4', 'b1']));
  assert.equal(a.edges, 13);
  // determinism
  assert.deepEqual(analyseNetwork({ nodes, edges } as ScientometricNetwork), a);
});

test('network: triangle transitivity = 1, path = 0', () => {
  const mk = (e: [string, string][]) => analyseNetwork({
    nodes: ['x', 'y', 'z'].map((id) => ({ id, name: id, type: 'author' as const, weight: 1 })),
    edges: e.map(([source, target]) => ({ source, target, weight: 1 })),
  } as ScientometricNetwork);
  near(mk([['x', 'y'], ['y', 'z'], ['x', 'z']]).transitivity, 1);
  near(mk([['x', 'y'], ['y', 'z']]).transitivity, 0);
});

test('Salton cosine and affinity index', () => {
  const net = { nodes: [{ id: 'u', name: 'u', type: 'country' as const, weight: 4 }, { id: 'v', name: 'v', type: 'country' as const, weight: 9 }],
    edges: [{ source: 'u', target: 'v', weight: 4 }] } as ScientometricNetwork;
  const e = enrichEdges(net, 100).edges[0];
  near(e.cosine!, 4 / 6, 0.001); near(e.affinity!, (4 * 100) / 36, 0.01);
});

test('diversity: even > skewed; identical terms have zero Rao-Stirling', () => {
  const even = Array.from({ length: 40 }, (_, i) => [`t${i % 4}`]);
  const skew = Array.from({ length: 40 }, (_, i) => [i < 37 ? 't0' : `t${i % 4}`]);
  assert.ok(diversity(even)!.shannon > diversity(skew)!.shannon);
  assert.equal(diversity([['a'], ['b']]), null);
});

test('screening removes journal items and duplicates, flags citation-ranked samples', () => {
  const recs = [
    pub('j', 2026, 32859, { title: 'Cancer Research' }),
    pub('1', 2001, 10, { venue: 'Cancer Research', doi: '10.1/x' }),
    pub('2', 2001, 3, { venue: 'Cancer Research', doi: '10.1/X' }),
    pub('3', 2005, 4, { title: 'A sufficiently long and identical paper title here', venue: 'BMC' }),
    pub('4', 2004, 9, { title: 'A sufficiently long and identical paper title here', venue: 'arXiv' }),
  ];
  const { kept, report } = screenRecords(recs);
  assert.equal(kept.length, 2);
  assert.ok(kept.find((r) => r.id === '1') && kept.find((r) => r.id === '4'));
  assert.equal(report.removed.length, 3);
  const sample = Array.from({ length: 60 }, (_, i) => pub('s' + i, 2010, 10 + i, { title: 'Distinct title ' + i }));
  assert.equal(screenRecords(sample).report.citationSelectionFlag, true);
  const natural = Array.from({ length: 60 }, (_, i) => pub('n' + i, 2010, i % 3 === 0 ? 5 : 0, { title: 'Other title ' + i }));
  assert.equal(screenRecords(natural).report.citationSelectionFlag, false);
});

test('bradford multiplier', () => {
  const b = bradfordMultiplier(5, 20, 80);
  assert.equal(b.k1, 4); assert.equal(b.k2, 4);
});

test('Lotka MLE recovers planted exponent; rejects flat; countryOf word boundaries', () => {
  const m = new Map<number, number>(); let z = 0;
  for (let x = 1; x <= 60; x++) z += 1 / x ** 2.0;
  for (let x = 1; x <= 60; x++) { const c = Math.round(3000 / z / x ** 2.0); if (c) m.set(x, c); }
  const f = fitLotka(m)!;
  near(f.alpha, 2.0, 0.05); assert.equal(f.conforms, true);
  assert.equal(fitLotka(new Map([[1, 100], [2, 100], [3, 100], [4, 100], [5, 100]]))!.conforms, false);
  assert.equal(countryOf('Indiana University'), '');
  assert.equal(countryOf('Woman Hospital'), '');
  assert.equal(countryOf('Technical University of Munich, Germany'), 'Germany');
});

test('computeStudyStats end-to-end: median, missing year, venue exclusion', () => {
  const recs = [pub('1', 2015, 0), pub('2', 2016, 10), pub('3', 2017, 20), pub('4', 2018, 100), pub('5', 0, 5)];
  recs[0].venue = ''; 
  const s = computeStudyStats(recs);
  assert.equal(s.medianCitations, 10);
  assert.equal(s.excludedMissingYear, 1);
  assert.equal(s.worksWithVenue, 4);
  assert.ok(!s.topSources.some((x) => x.name === 'Unspecified Venue'));
});

test('period table reports exposure-adjusted citations (older work, same citations -> lower per year)', () => {
  const recs: Publication[] = [];
  for (let i = 0; i < 6; i++) recs.push(pub('o' + i, 2000, 20), pub('n' + i, 2020, 20));
  const t = periodTable(recs, 2026);
  const old = t.rows[0], recent = t.rows[t.rows.length - 1];
  assert.equal(old.cpp, recent.cpp);
  near(recent.cpy / old.cpy, 27 / 7, 0.01); // exposure 7 vs 27 years
});

test('pipeline: search term is excluded and planted thematic clusters are recovered', () => {
  const topics = [['malaria', 'parasite', 'vector', 'mosquito'], ['cancer', 'tumor', 'oncology', 'chemotherapy'], ['genomics', 'sequencing', 'mutation', 'variant']];
  let seed = 5; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const recs = Array.from({ length: 240 }, (_, i) => {
    const t = topics[i % 3];
    return pub('k' + i, 2000 + (i % 20), Math.floor(r() * 30), {
      title: `Study ${i}`, keywords: ['Tunisia', 'tunisia', t[Math.floor(r() * 4)], t[Math.floor(r() * 4)], t[Math.floor(r() * 4)]],
    });
  });
  const withTerm = computeStudyStats(recs, { excludeTerms: ['Tunisia'], screen: false });
  assert.ok(!withTerm.topKeywords.some((k) => k.keyword === 'tunisia'));
  const without = computeStudyStats(recs, { screen: false });
  assert.equal(without.topKeywords[0].keyword, 'tunisia'); // case variants merged, and it dominates if not excluded
  const cl = withTerm.networkAnalysis!.keyword.communities;
  assert.equal(cl.length, 3);
  topics.forEach((t) => assert.ok(cl.some((c) => t.every((w) => c.members.includes(w)))));
  assert.ok(withTerm.networkAnalysis!.keyword.modularity! > 0.25);
});
