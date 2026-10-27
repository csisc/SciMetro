/**
 * Journal-style manuscript builder. Every statement is derived from computed results; every
 * reference goes through the Citer so that the reference list matches the text exactly.
 * Author-specific items (declarations, domain theory) are explicit [Authors: …] placeholders:
 * a generator cannot know them, and inventing them would be misconduct.
 */
import type { AppSettings, Publication, StudyStats } from '../types';
import { Citer } from './references';
import type { BenchRow } from './benchmarks';
import { benchmarkTable } from './benchmarks';
import { coverageTable, lotkaShort, collabSentence } from './narrative';
import type { CrossrefWork } from './crossref';

export interface PriorEntry {
  pub: Publication;
  key: string | null; // citation key when the work could be resolved to a complete reference
  work?: CrossrefWork;
  facts?: { docs: number | null; docsText: string | null; period: [number, number] | null };
}

export interface PaperCtx {
  topic: string;
  selectedId: string;
  queryText: string;
  stats: StudyStats;
  settings: AppSettings;
  cite: Citer;
  bench: BenchRow[];
  prior: PriorEntry[];
  priorTotal: number;
  priorSynthesis?: string;
  llmUsed: boolean;
  date: string;
}

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const words = (n: number) => (n >= 0 && n <= 10 ? SMALL[n] : String(n));
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Numbers tables in order of appearance and rewrites every "Table N" mention accordingly.
 * Generators assemble sections in an order different from their original numbering.
 */
export function renumberTables(md: string): string {
  const order: string[] = [];
  for (const m of md.matchAll(/\*\*Table ([A-Z]?\d+)\./g)) if (!order.includes(m[1])) order.push(m[1]);
  const map = new Map(order.map((n, i) => [n, i + 1]));
  return md.replace(/\bTables? ([A-Z]?\d+)(?:–([A-Z]?\d+))?/g, (all, a: string, b?: string) => {
    const na = map.get(a);
    const nb = b ? map.get(b) : undefined;
    if (na === undefined || (b && nb === undefined)) return all;
    return `${all.startsWith('Tables') ? 'Tables' : 'Table'} ${na}${b ? `–${nb}` : ''}`;
  });
}

export const wordCount = (t: string) => (t.match(/\S+/g) || []).length;

export const PLACEHOLDER_RE = /\[Authors?:[^\]]*\]/g;

const hyp = (b: BenchRow[], id: string) => b.find((r) => r.id === id);

export function buildAbstract(ctx: PaperCtx): string {
  const { stats: s, topic, bench } = ctx;
  const g = s.growthModels?.exponential;
  const h = bench.filter((r) => r.isHypothesis);
  const assessed = h.filter((r) => r.outcome !== 'not assessable');
  const supported = h.filter((r) => r.outcome === 'supported');
  const parts: string[] = [];
  parts.push(
    `This study analyses the scholarly literature on ${topic} recorded in Wikidata (${s.docs} works, ${s.span[0]}–${s.span[1]}), retrieved through the QLever SPARQL endpoint on ${ctx.date}.`
  );
  parts.push(
    `We examine growth, citation impact, source concentration, authorship productivity, collaboration and thematic structure, and test ${words(h.length)} hypotheses derived from the scientometric literature.`
  );
  if (g) {
    parts.push(
      `Output grew by ${g.ratePct}% per year (95% CI ${g.ciLowPct}% to ${g.ciHighPct}%).`
    );
  }
  const cc = s.citationConcentration;
  if (cc && cc.n >= 30) {
    parts.push(`The 15% most cited works receive ${cc.top15PctShare}% of citations (Gini = ${cc.gini}).`);
  }
  const l = s.lotkaFit;
  if (l) {
    parts.push(
      `Author productivity ${l.conforms ? 'is compatible with' : 'departs from'} Lotka's law (α = ${l.alpha}).`
    );
  }
  parts.push(`Single-authored works make up ${s.singleAuthorPct}% of works with resolved authors (degree of collaboration ${s.degreeOfCollaboration}).`);
  const k = s.networkAnalysis?.keyword;
  if (k && k.modularity != null && k.communities.length) {
    parts.push(`The subject-term network splits into ${k.communities.length} thematic clusters (modularity ${k.modularity}).`);
  }
  if (assessed.length) {
    parts.push(`${cap(words(supported.length))} of ${words(assessed.length)} testable hypotheses were supported.`);
  }
  const cov = s.coverage;
  parts.push(
    `Results describe the Wikidata-indexed literature${cov ? ` (${cov.withAuthorsPct}% of works have resolved authors; ${s.screening?.uncitedPct ?? 'n/a'}% are uncited)` : ''} and not the whole field; queries and indicator definitions are given for replication.`
  );
  let text = parts.join(' ');
  // keep within the 250-word limit common to the target journals
  const drop = [/ The subject-term network[^.]*\./, / Single-authored works[^.]*\./];
  for (const re of drop) if (wordCount(text) > 250) text = text.replace(re, '');
  return text;
}

export function buildFront(ctx: PaperCtx): string {
  const { stats: s, topic, cite: c, bench, settings } = ctx;
  let md = '';
  md += `# ${topic}: a scientometric analysis of the Wikidata-indexed literature, ${s.span[0]}–${s.span[1]}\n\n`;
  md += `*Draft generated by SciMetro Studio on ${ctx.date}; the authors are responsible for verifying every statement before submission.*\n\n`;
  md += `### Abstract\n\n${buildAbstract(ctx)}\n\n`;
  md += `**Keywords:** scientometrics; bibliometric analysis; ${topic}; Wikidata; open bibliographic data; Lotka's law; Bradford's law; co-authorship\n\n`;

  // ---------------------------------------------------------------- 1 Introduction
  md += `## 1. Introduction\n\n`;
  md += `Quantitative studies of science describe how scholarly output grows, how it concentrates on few authors and sources, and how credit accumulates ${c.p('price1963', 'eggherousseau1990')}. Several empirical regularities are central: Lotka's law of author productivity ${c.p('lotka1926')}, Bradford's law of the scattering of sources ${c.p('bradford1934')}, and cumulative advantage in citations ${c.p('merton1968', 'price1976')}. Bibliometric analysis of a single topic is now a standard way to map its development and research fronts ${c.p('donthu2021')}.\n\n`;
  md += `Most such studies draw on proprietary or restricted databases, whose coverage of documents and citation links differs markedly ${c.p('visser2021', 'martinmartin2021')}. Open sources allow analyses to be repeated and audited. Wikidata, a collaboratively edited knowledge base ${c.p('vrandecic2014')}, holds bibliographic records, authorship and citation links for scholarly works that can be queried with SPARQL ${c.p('nielsen2017', 'waagmeester2020')}, and open citation data are also provided by OpenCitations ${c.p('peroni2020')}. Whether scientometric analysis of Wikidata reproduces the regularities established on closed databases is the question addressed here.\n\n`;
  md += `This study analyses the literature on ${topic} (Wikidata item ${ctx.selectedId}) using ${s.docs} works published between ${s.span[0]} and ${s.span[1]}. ${ctx.priorTotal > 0 ? `Wikidata lists ${ctx.priorTotal} review-type works on this topic (Section 2.6).` : 'Wikidata lists no review-type works on this topic (Section 2.6).'} We address five research questions: (RQ1) how fast has the literature grown, and how does that compare with the growth of science as a whole; (RQ2) how concentrated are sources, authors and citations; (RQ3) how collaborative is the field and how has collaboration changed; (RQ4) which thematic clusters structure it; and (RQ5) how far can an open knowledge graph support such an analysis, given its coverage. The contribution is an empirical test of five literature-derived hypotheses on a reproducible open data source, with explicit decision rules and a quantified account of data coverage.\n\n`;

  // ---------------------------------------------------------------- 2 Background
  md += `## 2. Background and hypotheses\n\n`;
  md += `### 2.1 Growth of the literature\n`;
  md += `Scientific output has grown exponentially over long periods ${c.p('price1963')}. Recent estimates place the long-run growth of science at about 4.1% per year, with phases of faster growth, and about 8–9% per year after the Second World War ${c.p('bornmann2015', 'bornmann2021')}. Topic-level series can grow faster or slower than science as a whole.\n\n`;
  md += `**${hyp(bench, 'H1')!.id}.** ${hyp(bench, 'H1')!.expectation}\n\n`;

  md += `### 2.2 Productivity, concentration and scattering\n`;
  md += `Lotka's law states that the number of authors producing n works falls as a power of n, with an exponent close to 2 in the original data ${c.p('lotka1926')}; later work shows that exponents vary between fields and data sets ${c.p('egghe2005')}, and that power laws should be fitted by maximum likelihood and tested rather than read off a log-log regression ${c.p('clauset2009')}. Price's square-root law links the output of the most productive authors to the size of the author population ${c.p('price1963')}. Bradford's law describes how documents on a subject scatter across sources: ranking sources by yield, equal thirds of the documents come from zones whose numbers of sources grow geometrically ${c.p('bradford1934')}, a pattern formalised in informetrics ${c.p('eggherousseau1990')}.\n\n`;
  md += `**${hyp(bench, 'H2')!.id}.** ${hyp(bench, 'H2')!.expectation}\n\n`;
  md += `**${hyp(bench, 'H3')!.id}.** ${hyp(bench, 'H3')!.expectation}\n\n`;

  md += `### 2.3 Collaboration\n`;
  md += `Co-authorship is the standard proxy for research collaboration ${c.p('subramanyam1983')} and is measured with the degree of collaboration ${c.p('subramanyam1983')} and the collaborative coefficient ${c.p('ajiferuke1988')}. Team size has risen across fields ${c.p('wuchty2007')}, and international co-authorship has grown through self-organising network processes ${c.p('wagner2005')}; link strengths between countries are best compared after normalisation for size ${c.p('glanzel2001', 'zitt2000')}. Scientific collaboration networks show marked clustering ${c.p('newman2001')}.\n\n`;
  md += `**${hyp(bench, 'H4')!.id}.** ${hyp(bench, 'H4')!.expectation}\n\n`;

  md += `### 2.4 Citation distributions and impact indicators\n`;
  md += `Citation counts are highly skewed: a small share of papers collects most citations ${c.p('seglen1992')}, a pattern attributed to cumulative advantage ${c.p('merton1968', 'price1976')}. Skewness makes means unreliable, which motivates classes based on characteristic scores and scales ${c.p('glanzelschubert1988')}, relative indicators normalised by publication year ${c.p('schubertbraun1986')}, and size-independent indices such as the h-index ${c.p('hirsch2005')}, the g-index ${c.p('egghe2006')} and the A- and R-indices ${c.p('jin2007')}; the literature on citation impact indicators is reviewed by ${c.n('waltman2016')}.\n\n`;
  md += `**${hyp(bench, 'H5')!.id}.** ${hyp(bench, 'H5')!.expectation}\n\n`;

  md += `### 2.5 Open bibliographic data\n`;
  md += `Bibliographic databases differ in the documents and citation links they cover ${c.p('visser2021', 'martinmartin2021')}. Wikidata offers open, queryable scholarly metadata with persistent identifiers ${c.p('nielsen2017')}, and its role as a hub for linked data is documented in the life sciences ${c.p('waagmeester2020')}. Its bibliographic coverage is partial and uneven, so every indicator reported here is conditional on what Wikidata holds; Section 3.4 quantifies this for the present corpus.\n\n`;

  md += `### 2.6 Prior reviews of ${topic} recorded in Wikidata\n`;
  md += priorSection(ctx);

  // ---------------------------------------------------------------- 3 Data and methods
  md += `## 3. Data and methods\n\n`;
  const searchN = s.origins['search'] || 0;
  const snow = (s.origins['citing'] || 0) + (s.origins['reference'] || 0);
  const rt = s.retrieval;
  const truncated = rt ? rt.subject.truncated || rt.title.truncated : searchN >= settings.mx;
  const relPhrase = (r: Record<string, number>) => {
    const names: Record<string, [string, string]> = {
      'same as': ['equivalent item', 'equivalent items'],
      narrower: ['narrower class', 'narrower classes'],
      instance: ['instance', 'instances'],
      part: ['part', 'parts'],
      facet: ['facet', 'facets'],
    };
    return Object.entries(r)
      .filter(([k]) => k !== 'broader')
      .map(([k, n]) => `${n} ${(names[k] || [k, k])[n === 1 ? 0 : 1]}`)
      .join(', ');
  };
  md += `### 3.1 Data source and retrieval\n`;
  if (rt) {
    md += `Records were retrieved from the QLever SPARQL endpoint (${settings.qleverUrl}) on ${ctx.date} through two complementary channels, because only a minority of Wikidata scholarly works carry a main-subject statement. The **subject channel** returns works whose main subject (\`wdt:P921\`) is the topic (${ctx.selectedId}) or ${rt.subject.ids - 1 === 1 ? 'one related item' : `one of ${rt.subject.ids - 1} related items`} (${relPhrase(rt.relatedItems)}), ranked by the number of Wikipedia articles and capped per relation; broader classes of the topic are deliberately not searched, since they would add works about the general class. The **title channel** returns scholarly works (articles, reviews, preprints, conference papers, theses and chapters) whose title contains one of ${rt.titleTerms} terms: names of the topic and of the related items in ${rt.languages.length} languages (${rt.languages.join(', ')}) taken from labels, aliases, Wikipedia article titles and redirects, official names and demonyms (${rt.mainTerms} distinct names for the topic itself). Terms shorter than four letters are not used, accent-stripped spellings are searched as well, and title-only hits must match a term at word boundaries (so that, for example, "Oman" does not match "woman"). The query is \`${ctx.queryText.replace(/\n/g, ' AND ')}\` (terms within a group are alternatives; groups are combined with AND). Journal and periodical items were excluded by type.\n\n`;
    md += `The subject channel returned ${rt.subject.returned} works and the title channel ${rt.title.returned}; after merging, the corpus holds ${rt.merged.total} distinct works (${rt.merged.subjectOnly} found by subject only, ${rt.merged.titleOnly} by title only, ${rt.merged.both} by both; ${rt.merged.titleDropped} title hits were discarded by the word-boundary check). `;
    const approx = [rt.subject.approximate && 'subject', rt.title.approximate && 'title'].filter(Boolean) as string[];
    if (approx.length) {
      md += `For the ${approx.join(' and ')} channel${approx.length > 1 ? 's' : ''}, the exact citation-ranked query exceeded the endpoint's time limit, so works were first selected without ranking (a limited number of matches, in index order) and then ranked by citations; the retained works are therefore the most cited among the matches examined, not among all matches. `;
    }
  } else {
    md += `Records were retrieved from the QLever SPARQL endpoint (${settings.qleverUrl}) on ${ctx.date}. The target concept (${ctx.selectedId}) and related Wikidata items were used as main-subject values (\`wdt:P921\`), combined with a title filter: \`${ctx.queryText.replace(/\n/g, ' AND ')}\` (terms within a group are alternatives; groups are combined with AND). Journal and periodical items were excluded by type. `;
  }
  md += `Works were then expanded by one step of forward and backward citation snowballing (\`wdt:P2860\`) from the 20 most-cited seeds; snowballed works are not guaranteed to match the topic query. Works lacking a publication year or title were excluded and duplicates were removed (Section 3.5). The corpus comprises ${searchN} topic-search records and ${snow} snowballed records. The selection logic follows the PRISMA 2020 flow idea ${c.p('page2021')}, adapted to bibliographic mapping.\n\n`;
  if (truncated) {
    md += `> **Warning — truncated sample.** A retrieval channel reached its configured limit of ${settings.mx} records and is ordered by citation count, so the corpus over-represents highly cited works. Citation, growth and concentration indicators are therefore not estimates for the whole literature.\n\n`;
  }

  md += `### 3.2 Indicators\n\n`;
  md += `Let $n_t$ be the number of works published in year $t$, $c_{(1)} \\ge c_{(2)} \\ge \\dots$ the citation counts of the works in descending order, and $N$ the number of works.\n\n`;

  md += `**Growth.** An exponential model is fitted by least squares to $\\ln n_t$ over complete calendar years with output (the current, partial year is excluded), with a 95% t-based confidence interval for $\\beta$; it is compared with a linear model by residual sum of squares on the count scale. The annual growth rate and doubling time are\n\n`;
  md += `$$\n r = e^{\\beta} - 1, \\qquad t_d = \\frac{\\ln 2}{\\ln(1+r)} \\tag{1}\n$$\n\n`;

  md += `**Citation impact.** The h-index ${c.p('hirsch2005')}, the g-index with zero-padding so that $g$ may exceed $N$ ${c.p('egghe2006')}, and the A- and R-indices of the h-core ${c.p('jin2007')} are\n\n`;
  md += `$$\n h = \\max\\{k : c_{(k)} \\ge k\\} \\tag{2}\n$$\n\n`;
  md += `$$\n g = \\max\\Big\\{k : \\sum_{i=1}^{k} c_{(i)} \\ge k^{2}\\Big\\}, \\qquad A = \\frac{1}{h}\\sum_{i=1}^{h} c_{(i)}, \\qquad R = \\sqrt{\\sum_{i=1}^{h} c_{(i)}} \\tag{3}\n$$\n\n`;
  md += `Counts are links between Wikidata items (\`wdt:P2860\`) and are not comparable with other databases ${c.p('visser2021')}.\n\n`;

  md += `**Citation classes.** Characteristic scores and scales ${c.p('glanzelschubert1988')} define three thresholds from the data and four classes (poorly, fairly, remarkably and outstandingly cited):\n\n`;
  md += `$$\n \\beta_1 = \\bar c, \\qquad \\beta_2 = \\operatorname{mean}\\{c_i : c_i \\ge \\beta_1\\}, \\qquad \\beta_3 = \\operatorname{mean}\\{c_i : c_i \\ge \\beta_2\\} \\tag{4}\n$$\n\n`;

  md += `**Normalised impact.** The relative citation rate of a unit $u$ (a country, institution or source) compares its citations with those expected from corpus works of the same publication year ${c.p('schubertbraun1986')}; cohorts of fewer than five works are skipped:\n\n`;
  md += `$$\n \\mathrm{RCR}_u = \\frac{\\sum_{i \\in u} c_i}{\\sum_{i \\in u} \\bar c_{y(i)}} \\tag{5}\n$$\n\n`;
  md += `where $\\bar c_{y}$ is the mean number of citations of corpus works published in year $y$. The share of a unit's works in the top 10% of their year cohort (cohorts of at least ten works, mid-rank percentiles) is reported alongside. Both are given for countries, institutions and sources, not for the whole corpus, where they equal 1 and about 10% by construction.\n\n`;

  md += `**Concentration.** Inequality of citations, author productivity and source yield is measured by the Gini coefficient of the values $x_{(1)} \\le \\dots \\le x_{(n)}$ ${c.p('eggherousseau1990')}, together with the shares of citations held by the 15% and 50% most cited works ${c.p('seglen1992')}:\n\n`;
  md += `$$\n G = \\frac{2\\sum_{i=1}^{n} i\\, x_{(i)}}{n \\sum_{i=1}^{n} x_{(i)}} - \\frac{n+1}{n} \\tag{6}\n$$\n\n`;

  md += `**Lotka's law.** The number of authors with $x$ works is modelled as ${c.p('lotka1926')}\n\n`;
  md += `$$\n f(x) = \\frac{C}{x^{\\alpha}}, \\qquad C = \\Big(\\sum_{x=1}^{x_{\\max}} x^{-\\alpha}\\Big)^{-1} \\tag{7}\n$$\n\n`;
  md += `The exponent $\\alpha$ is estimated by maximum likelihood on the finite support $1,\\dots,x_{\\max}$ rather than by log-log regression ${c.p('clauset2009')}, and the fit is tested with the Kolmogorov–Smirnov statistic at the 1% level (full counting):\n\n`;
  md += `$$\n D = \\max_{x}\\, \\big| F_{\\mathrm{obs}}(x) - F_{\\mathrm{theo}}(x) \\big|, \\qquad D_{\\mathrm{crit}} = \\frac{1.63}{\\sqrt{n}} \\tag{8}\n$$\n\n`;
  md += `A Lotka-type law is accepted only if $D \\le D_{\\mathrm{crit}}$ and $\\alpha \\ge 1$ (Eqs. (7) and (8)). Price's law ${c.p('price1963')} is assessed as the share of authorships held by the $\\lceil\\sqrt{N_a}\\rceil$ most productive of $N_a$ authors, against a predicted 50%:\n\n`;
  md += `$$\n S = \\frac{\\sum_{i=1}^{\\lceil\\sqrt{N_a}\\rceil} w_{(i)}}{\\sum_{i=1}^{N_a} w_{(i)}} \\tag{9}\n$$\n\n`;

  md += `**Bradford's law.** Sources are ranked by yield and split into three zones of approximately equal numbers of works. With $n_1, n_2, n_3$ the numbers of sources in the zones, the multipliers are ${c.p('bradford1934', 'eggherousseau1990')}\n\n`;
  md += `$$\n k_1 = \\frac{n_2}{n_1}, \\qquad k_2 = \\frac{n_3}{n_2} \\tag{10}\n$$\n\n`;
  md += `Works without a recorded venue are excluded.\n\n`;

  md += `**Collaboration.** The degree of collaboration ${c.p('subramanyam1983')} and the collaborative coefficient ${c.p('ajiferuke1988')} are computed on works with at least one resolved author, with $N_m$ and $N_s$ the numbers of multi-authored and single-authored works and $f_k$ the number of works with $k$ authors:\n\n`;
  md += `$$\n \\mathrm{DC} = \\frac{N_m}{N_m + N_s}, \\qquad \\mathrm{CC} = 1 - \\frac{\\sum_{k} f_k / k}{N} \\tag{11}\n$$\n\n`;
  md += `International collaboration is the share of works whose resolved authors span more than one country, among works with at least one identifiable country.\n\n`;

  md += `**Networks.** Graphs are built on the top-ranked nodes of each type (25 authors, 30 subject terms, 18 countries and institutions). With $w_{ij}$ the number of works shared by nodes $i$ and $j$, $o_i$ the number of works containing node $i$ and $N$ the number of works, edges are normalised by Salton's cosine ${c.p('glanzel2001')} and the affinity index ${c.p('zitt2000')}:\n\n`;
  md += `$$\n \\cos_{ij} = \\frac{w_{ij}}{\\sqrt{o_i\\, o_j}}, \\qquad A_{ij} = \\frac{w_{ij}\\, N}{o_i\\, o_j} \\tag{12}\n$$\n\n`;
  md += `Communities are found by greedy modularity optimisation ${c.p('clauset2004')}, maximising\n\n`;
  md += `$$\n Q = \\sum_{c}\\left[\\frac{L_c}{m} - \\left(\\frac{d_c}{2m}\\right)^{2}\\right] \\tag{13}\n$$\n\n`;
  md += `where $L_c$ is the weight of edges inside community $c$, $d_c$ the total weight incident to its nodes and $m$ the total edge weight. Betweenness centrality, transitivity and connected components are also reported, and diversity of the subject-term profile is measured by Shannon entropy, the Simpson index and Rao–Stirling diversity ${c.p('leydesdorffrafols2011')}. The search terms and generic words are removed from the co-word analysis, and terms are merged across case, accents and plural forms.\n\n`;

  md += `### 3.3 Hypothesis tests and decision rules\n`;
  md += `The five hypotheses of Section 2 are assessed with the following pre-stated rules: H1 holds if the 95% confidence interval of the exponential growth rate intersects 4.1–9% per year; H2 if the Kolmogorov–Smirnov test does not reject a Lotka-type law and the fitted exponent lies between 1.5 and 2.5; H3 if the two Bradford multipliers differ by at most 25%; H4 if authors per work are positively rank-correlated with period (Spearman ρ ≥ 0.5, at least four complete periods) and higher in the last than in the first period; H5 if the 15% most cited works receive at least 50% of citations. These thresholds are conventions chosen for transparency, not statistical significance levels; with few periods or sources the tests have little power.\n\n`;

  md += `### 3.4 Data quality and coverage\n`;
  md += coverageTable(s);
  md += `Authors are counted only when recorded as Wikidata items (\`wdt:P50\`); authors recorded as plain name strings (\`wdt:P2093\`) are not retrieved, so authorship, collaboration and co-authorship indicators describe the resolved subset only. Countries come from the institution's country statement (\`wdt:P17\`) where available, otherwise from parsing the affiliation label; affiliations reflect the author's recorded employer, not necessarily the affiliation at publication time. Differences in coverage between bibliographic sources are known to be large ${c.p('visser2021')}.\n\n`;
  return md;
}

function priorSection(ctx: PaperCtx): string {
  const { prior, priorTotal, cite: c, topic } = ctx;
  if (priorTotal === 0) {
    return `No review-type works on ${topic} were retrieved from Wikidata. This does not show that none exist, because Wikidata's coverage is incomplete. *[Authors: complement with a manual literature search and discuss the closest prior reviews here.]*\n\n`;
  }
  const resolved = prior.filter((p) => p.key);
  let md = `A Wikidata search for review-type works on ${topic} returned ${priorTotal} candidates, of which ${resolved.length} could be resolved to complete bibliographic records through Crossref (Table F1)${priorTotal > resolved.length ? `; the other ${priorTotal - resolved.length} lack a DOI or sufficient metadata and are not cited` : ''}. Types are assigned from title keywords only.\n\n`;
  if (resolved.length) {
    md += `**Table F1.** Review-type works on ${topic} with complete bibliographic records\n\n`;
    md += `| Study | Title | Type (from title) | Cited by (Wikidata) | Figures stated in abstract |\n|---|---|---|---|---|\n`;
    resolved.slice(0, 10).forEach((p) => {
      const t = p.pub.reviewType === 'bibliometric' ? 'Bibliometric' : p.pub.reviewType === 'systematic_review' ? 'Systematic review' : 'Survey / other';
      const f = p.facts;
      const stated = f && (f.docsText || f.period) ? [f.docsText, f.period ? `${f.period[0]}–${f.period[1]}` : null].filter(Boolean).join('; ') : '—';
      md += `| ${c.n(p.key!)} | ${(p.work?.title || p.pub.title).replace(/\|/g, '/')} | ${t} | ${p.pub.cites} | ${stated} |\n`;
    });
    md += `\n`;
    const years = resolved.map((p) => p.work?.year || p.pub.year).filter(Boolean) as number[];
    const nb = resolved.filter((p) => p.pub.reviewType === 'bibliometric').length;
    md += `The resolved works were published between ${Math.min(...years)} and ${Math.max(...years)}; ${nb} ${nb === 1 ? 'is' : 'are'} bibliometric by title. `;
    // only bibliometric studies whose abstract names documents/publications/papers/articles are comparable
    const sizes = resolved
      .filter((p) => p.pub.reviewType === 'bibliometric' && /documents|publications|papers|articles/.test(p.facts?.docsText || ''))
      .map((p) => p.facts!.docs)
      .filter((x): x is number => !!x);
    if (sizes.length) {
      md += `Bibliometric studies whose abstracts state a corpus size report ${Math.min(...sizes).toLocaleString('en-US')}${sizes.length > 1 ? ` to ${Math.max(...sizes).toLocaleString('en-US')}` : ''} documents, against ${ctx.stats.docs.toLocaleString('en-US')} here; these figures are not directly comparable because the sources, queries and document types differ. `;
    }
    md += `The present study does not extract or compare their substantive findings.\n\n`;
    if (ctx.priorSynthesis) md += `${ctx.priorSynthesis}\n\n`;
  }
  md += `*[Authors: read the works in Table F1 and add a critical appraisal of their scope, data and conclusions; this generator has only seen titles and, where available, abstracts.]*\n\n`;
  return md;
}

export function buildBack(ctx: PaperCtx): string {
  const { stats: s, topic, cite: c, bench, settings } = ctx;
  let md = '';
  const H = bench.filter((r) => r.isHypothesis);
  const sup = H.filter((r) => r.outcome === 'supported').length;
  const assessed = H.filter((r) => r.outcome !== 'not assessable').length;

  md += `## 5. Discussion\n\n`;
  md += `### 5.1 Summary of findings\n`;
  const g = s.growthModels?.exponential;
  md += `**RQ1 (growth).** ${g ? `The literature grew by ${g.ratePct}% per year (95% CI ${g.ciLowPct}% to ${g.ciHighPct}%; ${s.growthModels!.preferred} model preferred).` : 'Growth could not be modelled.'} **RQ2 (concentration).** ${s.citationConcentration ? `Citations are concentrated (Gini ${s.citationConcentration.gini}); the 10% most cited works receive ${s.citationConcentration.top10PctShare}% of citations.` : ''} ${lotkaShort(s)} **RQ3 (collaboration).** ${collabSentence(s)} **RQ4 (themes).** ${s.networkAnalysis?.keyword ? `The subject-term network has ${s.networkAnalysis.keyword.communities.length} clusters of two or more terms (Q = ${s.networkAnalysis.keyword.modularity ?? 'n/a'}).` : ''} **RQ5 (data).** ${s.coverage ? `${s.coverage.withAuthorsPct}% of works have resolved authors, ${s.coverage.withCountryPct}% an identifiable country and ${s.coverage.withKeywordsPct}% subject keywords.` : ''}\n\n`;

  md += `### 5.2 Comparison with the literature\n`;
  md += `**Table 28.** Hypotheses derived from the literature and their outcomes\n\n${benchmarkTable(bench)}`;
  md += `${cap(words(sup))} of the ${words(assessed)} assessable hypotheses are supported${assessed < H.length ? ` (${words(H.length - assessed)} could not be assessed)` : ''}. Row N1 is a descriptive check, not a hypothesis.\n\n`;
  bench.forEach((r) => {
    md += `**${r.id}.** ${r.discussion}\n\n`;
  });

  md += `### 5.3 Implications for scientometrics on open data\n`;
  const cov = s.coverage;
  if (cov) {
    const weakAuth = cov.withAuthorsPct < 50;
    md += `${weakAuth ? `Only ${cov.withAuthorsPct}% of works have resolved authors, so the authorship, collaboration and productivity indicators rest on a minority of the corpus and should not be generalised.` : `In this corpus ${cov.withAuthorsPct}% of works have resolved authors, which supports author-level analysis, although name-string authors remain missing.`} Coverage of countries (${cov.withCountryPct}%) and of subject keywords (${cov.withKeywordsPct}%) bounds the international and thematic analyses in the same way. Because bibliographic sources differ widely in documents and citation links ${c.p('visser2021', 'martinmartin2021')}, results obtained on Wikidata should be cross-checked against at least one independent source before they are used for evaluation; used descriptively, with coverage reported as here, the approach is reproducible and auditable ${c.p('nielsen2017')}.\n\n`;
  }
  const top = s.topSources.slice(0, 3).map((x) => x.name).filter(Boolean);
  if (top.length) md += `The most productive sources are ${top.join('; ')} (Table 5); the field-specific meaning of this core is for the authors to interpret. *[Authors: relate the core sources, authors and themes to the substantive literature on ${topic}.]*\n\n`;

  md += `### 5.4 Limitations\n`;
  const truncated = (s.origins['search'] || 0) >= settings.mx;
  md += `1. **Coverage.** Wikidata covers part of the scholarly record, unevenly across fields and years, as bibliographic sources differ widely in coverage ${c.p('visser2021')}; Section 3.4 quantifies this. Metadata completeness here: authors ${cov?.withAuthorsPct ?? 'n/a'}%, affiliations ${cov?.withAffiliationPct ?? 'n/a'}%, countries ${cov?.withCountryPct ?? 'n/a'}%, keywords ${cov?.withKeywordsPct ?? 'n/a'}%. Growth in Wikidata's coverage also inflates measured growth.\n`;
  md += `2. **Authors.** Only authors recorded as Wikidata items are retrieved, and no name disambiguation was performed.\n`;
  md += `3. **Citations.** Counts are links between Wikidata items, not normalised by field, and not comparable with other databases ${c.p('visser2021')}.\n`;
  md += `4. **Sampling.** ${truncated ? `The topic search reached its ${settings.mx}-record limit and is ordered by citation count, biasing the corpus toward highly cited works. ` : ''}Recall and precision of the title-keyword and main-subject filters were not validated against a gold standard; snowballed works are not topic-filtered.\n`;
  md += `5. **Reference set.** Relative citation rates and top-10% shares of countries, institutions and sources use the corpus itself as reference and describe standing within it only ${c.p('schubertbraun1986')}; citations are cumulative to the retrieval date, so only cohort-normalised indicators correct for age.\n`;
  md += `6. **Networks and keywords.** Networks cover only top-ranked nodes; communities come from a greedy heuristic ${c.p('clauset2004')} and are not validated against an independent classification; the co-word analysis mixes Wikidata subject items with title words and has no thesaurus.\n`;
  md += `7. **Benchmarks.** The comparison values come from studies of other populations and data sources (Section 5.2); agreement or disagreement is indicative, and the decision thresholds are conventions.\n\n`;

  md += `## 6. Conclusions\n\n`;
  md += `We analysed ${s.docs} works on ${topic} recorded in Wikidata (${s.span[0]}–${s.span[1]}) and tested ${words(H.length)} hypotheses derived from the scientometric literature; ${assessed === H.length ? `${words(sup)} of ${words(H.length)} were supported` : `${words(sup)} of the ${words(assessed)} that could be assessed were supported`}. ${g ? `Output grew by ${g.ratePct}% per year (95% CI ${g.ciLowPct}% to ${g.ciHighPct}%). ` : ''}${lotkaShort(s)} The results show what an open, reproducible pipeline can and cannot establish at present: distributions of citations and sources can be examined, whereas authorship-based indicators depend on how completely authors are recorded.\n\n`;
  md += `Future work should (i) retrieve authors recorded as name strings and their order, so that first- and corresponding-author analyses become possible; (ii) retrieve the full result set rather than a citation-ranked sample; (iii) cross-validate indicators against an independent source such as OpenCitations ${c.p('peroni2020')}; and (iv) add field-normalised citation indicators with a world reference set ${c.p('waltman2016')}.\n\n`;

  md += `## Declarations\n\n`;
  const repo = settings.rp ? `https://github.com/${settings.rp}${settings.pt ? '/' + settings.pt.replace(/^\/+/, '') : ''}` : '';
  md += `**Data availability.** All data are drawn from Wikidata (CC0). The SPARQL queries and parameters are given in Section 3.1 and the data were retrieved on ${ctx.date}; Wikidata changes continuously, so a re-run will differ. ${repo ? `The derived dataset and manuscript are archived at ${repo}.` : '[Authors: deposit the derived dataset in a public repository and give its DOI or URL.]'}\n\n`;
  md += `**Code availability.** Indicators were computed with SciMetro Studio. [Authors: give the repository URL and version or commit used.]\n\n`;
  md += `**Use of automated tools.** The text, tables and figures were generated by SciMetro Studio from the computed indicators using rule-based templates${ctx.llmUsed ? `; a locally hosted language model (${settings.md}) drafted the synthesis in Section 2.6 under automatic validation of citations and figures` : ''}. Bibliographic details of references resolved through Crossref were retrieved automatically. The authors are responsible for the content.\n\n`;
  md += `**Competing interests.** [Authors: declare any competing interests.]\n\n`;
  md += `**Funding.** [Authors: declare funding sources or state that there was none.]\n\n`;
  md += `**Author contributions.** [Authors: describe contributions.]\n\n`;
  md += `**Ethics.** Not applicable: the study uses only public bibliographic metadata and involves no human participants.\n\n`;

  md += `## References\n\n${c.list()}\n`;
  return md;
}
