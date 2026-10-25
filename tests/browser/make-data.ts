// Generates a manuscript from synthetic data for the browser checks: tsx tests/browser/make-data.ts out.json
import fs from 'node:fs';
import { computeStudyStats } from '../../src/services/stats';
import { generatePaperWithLlm } from '../../src/services/llm';
import { parseCrossref } from '../../src/services/crossref';
let seed = 23; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const clusters = [['malaria', 'parasite', 'vector', 'mosquito', 'tropical'], ['cancer', 'tumor', 'oncology', 'breast', 'chemotherapy'], ['genomics', 'sequencing', 'mutation', 'variant', 'population']];
const ctry = ['Tunisia', 'France', 'Germany', 'United States', 'Italy'];
const recs: any[] = []; let id = 0;
for (let t = 0; t < 26; t++) {
  const n = Math.round(10 * 1.075 ** t);
  for (let i = 0; i < n; i++) {
    const c = clusters[id % 3]; const nA = 1 + Math.floor(r() * (1 + t / 5));
    recs.push({ id: 'http://www.wikidata.org/entity/Q' + (5000 + id), title: `${c[Math.floor(r() * 5)]} ${c[Math.floor(r() * 5)]} outcomes in Tunisia ${id}`, year: 1998 + t, venue: r() < 0.12 ? '' : 'Journal ' + Math.floor(Math.pow(r(), 2) * 40), doi: '10.9/' + id, omid: 'Q' + id,
      cites: Math.floor(Math.pow(1 / (1 - r() * 0.97), 1.5) - 1) * (r() < 0.35 ? 0 : 1),
      authors: Array.from({ length: nA }, () => { const a = Math.floor(Math.pow(r(), 2.2) * 300); return { k: 'a' + a, name: 'Author ' + a, aff: 'Inst ' + (a % 12), country: ctry[Math.floor(r() * 5)] }; }),
      keywords: ['Tunisia', c[Math.floor(r() * 5)], c[Math.floor(r() * 5)]], origin: 'search', via: r() < 0.4 ? 'subject' : 'title' });
    id++;
  }
}
const retrieval: any = { languages: ['en', 'fr'], mainTerms: 12, relatedItems: { narrower: 6, instance: 3 }, titleTerms: 24, subject: { ids: 10, returned: 300, truncated: false }, title: { ran: true, returned: 420, truncated: false }, merged: { total: recs.length, both: 40, subjectOnly: 200, titleOnly: recs.length - 240, titleDropped: 11 } };
const stats = computeStudyStats(recs, { excludeTerms: ['Tunisia'], upstream: { identified: recs.length + 40, duplicatesById: 22, missingYearOrTitle: 18 }, retrieval, currentYear: 2026 });
const priors: any[] = [{ id: 'p1', title: 'A bibliometric analysis of research on Tunisia', year: 2019, venue: 'Scientometrics', doi: '10.1234/abc', cites: 40, authors: [], keywords: [], origin: 'prior', omid: 'p1', reviewType: 'bibliometric' }];
const works: any = { '10.1234/abc': parseCrossref({ message: { DOI: '10.1234/abc', title: ['A bibliometric analysis of research on Tunisia'], author: [{ given: 'Amel', family: 'Ben Youssef' }, { given: 'Karim', family: 'Trabelsi' }], issued: { 'date-parts': [[2019]] }, 'container-title': ['Scientometrics'], volume: '120', issue: '2', page: '100-115', abstract: 'We analysed 2,310 documents published 2000–2017 on the topic.' } }) };
const md = await generatePaperWithLlm('Tunisia', 'Q948', 'tunisia | tunisian', stats, priors, { db: 'Wikidata (QLever)', qleverUrl: 'https://qlever.cs.uni-freiburg.de/api/wikidata', mx: 100000, llmProvider: 'synthesizer', md: 'm', rp: '', pt: '' } as any, () => {}, { fetchWork: async (d) => works[d.toLowerCase()] || null });
fs.writeFileSync(process.argv[2], JSON.stringify({ md, stats }));
console.log('manuscript chars', md.length);
