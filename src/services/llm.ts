import { AppSettings, Publication, StudyStats } from '../types';
import { generateMarkdownTables } from './stats';

export async function callOllama(
  prompt: string,
  asJson: boolean,
  settings: AppSettings
): Promise<string> {
  const url = settings.ol.replace(/\/$/, '') + '/api/generate';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.md,
        prompt,
        stream: false,
        format: asJson ? 'json' : undefined,
        options: { temperature: 0.2, num_ctx: 8192 },
      }),
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errTxt.slice(0, 100)}`);
    }

    const data = await res.json();
    return (data.response || '').trim();
  } catch (e: any) {
    throw new Error(
      `Cannot reach Ollama at ${settings.ol} (${e.message}). Is it running with OLLAMA_ORIGINS="${window.location.origin}"?`
    );
  }
}

export async function callLlm(
  prompt: string,
  asJson: boolean,
  settings: AppSettings,
  log?: (msg: string) => void
): Promise<string> {
  if (settings.llmProvider === 'ollama') {
    try {
      return await callOllama(prompt, asJson, settings);
    } catch (err: any) {
      if (log) {
        log(`Ollama notice: ${err.message}. Using Built-in Scholarly Synthesizer…`);
      }
      throw err;
    }
  }

  throw new Error('Synthesizer mode active');
}

export async function formulateQueryWithLlm(
  mainSynonyms: string[],
  relatedByRel: Record<string, string[]>,
  settings: AppSettings,
  log: (msg: string) => void
): Promise<string[][]> {
  const ascii = (x: string) =>
    /^[\x00-\x7F]+$/.test(x) && x.length <= 40 && x.split(' ').length <= 4;

  if (settings.llmProvider === 'ollama') {
    const prompt =
      `Topic synonyms: ${JSON.stringify(mainSynonyms)}\n` +
      `Related ontology items: ${JSON.stringify(relatedByRel)}\n` +
      `Build a title-keyword query for searching scholarly literature on Wikidata QLever. Return JSON {"groups":[[...],[...]]}: 1 to 3 groups; a title must match at least one term in EVERY group (AND between groups, OR within a group). Terms are short lowercase English words or phrases (3 to 15 per group).`;

    try {
      const raw = await callLlm(prompt, true, settings, log);
      const parsed = JSON.parse(raw);
      const groups = (parsed.groups || [])
        .map((g: any) =>
          [].concat(g).map((x: any) => String(x).trim().toLowerCase()).filter(Boolean)
        )
        .filter((g: any[]) => g.length > 0)
        .slice(0, 3);

      if (groups.length > 0) {
        log('Formulated query using local Ollama model.');
        return groups;
      }
    } catch (e: any) {
      log('Ollama query formulation unavailable, switching to Built-in Scholarly Synthesizer.');
    }
  }

  // Built-in Scholarly Synthesizer
  const coreMain = mainSynonyms.filter(ascii).map((x) => x.toLowerCase());
  const instances = (relatedByRel['instance of'] || []).filter(ascii).map((x) => x.toLowerCase());
  const subclasses = (relatedByRel['subclass of'] || []).filter(ascii).map((x) => x.toLowerCase());

  const primaryTerms = [
    ...new Set([
      ...coreMain.slice(0, 5),
      ...instances.slice(0, 8),
      ...subclasses.slice(0, 4),
    ]),
  ].slice(0, 15);

  log('Formulated query groups using Built-in Scholarly Synthesizer.');
  if (primaryTerms.length > 0) {
    return [primaryTerms];
  }

  return [[coreMain[0] || 'research']];
}

export async function filterOutliersWithLlm(
  recs: Publication[],
  topic: string,
  queryText: string,
  settings: AppSettings,
  log: (msg: string) => void
): Promise<Publication[]> {
  const keep: Publication[] = [];
  let drop = 0;

  if (settings.llmProvider === 'ollama') {
    const chunk = <T>(a: T[], n: number): T[][] => {
      const r: T[][] = [];
      for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n));
      return r;
    };

    let ollamaFailed = false;
    for (const b of chunk(recs, 20)) {
      if (ollamaFailed) break;
      const list = b.map((r, i) => `${i + 1}. ${r.title} (${r.year})`).join('\n');
      try {
        const prompt =
          `Topic: "${topic}". Query: ${queryText.replace(/\n/g, ' AND ')}\n` +
          `Rate each title's relevance to the topic from 0 (unrelated outlier) to 10 (core). Return JSON {"scores":[{"i":1,"s":7},...]} for all ${b.length} items.\n` +
          `${list}`;

        const raw = await callLlm(prompt, true, settings);
        const parsed = JSON.parse(raw);
        const scoreMap = new Map<number, number>(
          (parsed.scores || []).map((x: any) => [x.i, x.s])
        );

        b.forEach((r, i) => {
          const score = scoreMap.get(i + 1);
          if (score == null || score >= settings.th) {
            keep.push(r);
          } else {
            drop++;
          }
        });
      } catch (e: any) {
        ollamaFailed = true;
        log('Ollama filter unavailable; switching to Built-in Scholarly Title Matcher…');
      }
    }

    if (!ollamaFailed) {
      log(`Ollama filter complete: kept ${keep.length}, dropped ${drop}`);
      return keep;
    }
  }

  // Built-in Scholarly Semantic Relevance Scorer
  log('Evaluating title relevance via Built-in Scholarly Outlier Scorer…');
  const topicWords = topic
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const queryWords = queryText
    .toLowerCase()
    .replace(/[|()\n]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const keywords = [...new Set([...topicWords, ...queryWords])];

  const filtered = recs.filter((r) => {
    const titleLower = r.title.toLowerCase();
    const matchesKeyword = keywords.some((kw) => titleLower.includes(kw));
    const hasSubjects = (r.keywords || []).length > 0;
    const hasCitations = (r.cites || 0) > 0;

    let score = 5;
    if (matchesKeyword) score += 4;
    if (hasSubjects) score += 2;
    if (hasCitations) score += 1;

    if (score >= settings.th) {
      return true;
    } else {
      drop++;
      return false;
    }
  });

  log(`Outlier filter complete: kept ${filtered.length} publications, dropped ${drop}.`);
  return filtered;
}

export const citePublication = (p: Publication): string => {
  const authorText =
    p.authors.length > 0
      ? `${p.authors.slice(0, 3).map((a) => a.name).join(', ')}${
          p.authors.length > 3 ? ' et al.' : ''
        }`
      : 'Anonymous';
  const yearText = p.year ? `(${p.year})` : '(n.d.)';
  const venueText = p.venue ? `*${p.venue}*` : '*Scholarly Publication*';
  const doiText = p.doi ? `. https://doi.org/${p.doi}` : '';
  const citesText = p.cites ? ` [Cited by ${p.cites.toLocaleString()}]` : '';

  return `${authorText} ${yearText}. ${p.title}. ${venueText}${doiText}${citesText}`;
};

// Generates Mermaid Graph Syntax for Markdown embedding
function generateMermaidCoauthorshipGraph(s: StudyStats): string {
  const authorNameMap = new Map(s.coauthorshipNetwork.nodes.map((n) => [n.id, n.name]));
  const topEdges = s.coauthorshipNetwork.edges
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  if (!topEdges.length) return '';

  const cleanNode = (id: string, name: string) => {
    const safeId = id.replace(/[^a-zA-Z0-9]/g, '_');
    const safeName = name.replace(/["()]/g, '');
    return `${safeId}["${safeName}"]`;
  };

  const lines = ['```mermaid', 'graph LR', '  %% Co-authorship Collaboration Topology'];
  topEdges.forEach((e) => {
    const nameA = authorNameMap.get(e.source) || e.source;
    const nameB = authorNameMap.get(e.target) || e.target;
    lines.push(`  ${cleanNode(e.source, nameA)} ---|${e.weight} works| ${cleanNode(e.target, nameB)}`);
  });
  lines.push('```\n');
  return lines.join('\n');
}

function generateMermaidKeywordGraph(s: StudyStats): string {
  const topEdges = s.keywordNetwork.edges
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  if (!topEdges.length) return '';

  const cleanId = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '_');
  const cleanLabel = (str: string) => str.replace(/["()]/g, '');

  const lines = ['```mermaid', 'graph TD', '  %% Conceptual Keyword Co-occurrence Fronts'];
  topEdges.forEach((e) => {
    lines.push(`  ${cleanId(e.source)}["${cleanLabel(e.source)}"] ===|${e.weight}| ${cleanId(e.target)}["${cleanLabel(e.target)}"]`);
  });
  lines.push('```\n');
  return lines.join('\n');
}

function generateMermaidCountryGraph(s: StudyStats): string {
  const topEdges = s.countryNetwork.edges
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);

  if (!topEdges.length) return '';

  const cleanId = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '_');
  const cleanLabel = (str: string) => str.replace(/["()]/g, '');

  const lines = ['```mermaid', 'graph LR', '  %% International Scientific Collaboration Axes'];
  topEdges.forEach((e) => {
    lines.push(`  ${cleanId(e.source)}["${cleanLabel(e.source)}"] ---|${e.weight} joint| ${cleanId(e.target)}["${cleanLabel(e.target)}"]`);
  });
  lines.push('```\n');
  return lines.join('\n');
}

// ---- Data-driven interpretation helpers: every verdict below comes from a computed test ----
const fmt = (x: number | null | undefined, d = 1) => (x == null ? 'n/a' : String(+x.toFixed(d)));

function lotkaSentence(s: StudyStats): string {
  const f = s.lotkaFit;
  if (!f) {
    return `Lotka's law could not be fitted: the corpus has too few distinct productivity levels or authors with resolved identities (author-level indicators here rest on only ${s.authors} resolved authors).`;
  }
  const base = `A maximum-likelihood fit of Lotka's law over ${f.nAuthors} authors (1 to ${f.maxWorks} works) gives α = ${f.alpha} (C = ${f.C}); the Kolmogorov–Smirnov statistic is D = ${f.ks} against a 1% critical value of ${f.ksCritical}`;
  return f.conforms
    ? `${base}, so the hypothesis that author productivity follows Lotka's law is not rejected.`
    : `${base}, so the hypothesis that author productivity follows Lotka's law is rejected at the 1% level${f.alpha < 1 ? ' (the fitted exponent is below 1, i.e. the distribution is flatter than any Lotka-type law)' : ''}.`;
}

function priceSentence(s: StudyStats): string {
  const p = s.priceShare;
  if (!p || !p.totalAuthorships) return '';
  const verdict =
    p.sharePct >= 45
      ? 'consistent with'
      : 'well below';
  return `The √N = ${p.eliteAuthors} most productive authors account for ${p.sharePct}% of all authorships, ${verdict} the 50% that Price's law predicts.`;
}

function collabSentence(s: StudyStats): string {
  const dc = s.degreeOfCollaboration;
  const level = dc >= 0.8 ? 'high' : dc >= 0.5 ? 'moderate' : 'low';
  return `Single-authored works make up ${s.singleAuthorPct}% of works with resolved authors (DC = ${dc}, a ${level} degree of collaboration; CC = ${s.collaborationCoefficient}).`;
}

function coverageTable(s: StudyStats): string {
  const c = s.coverage;
  if (!c) return '';
  const rows: [string, number][] = [
    ['Publication year', c.withYearPct],
    ['≥1 author resolved to a Wikidata item', c.withAuthorsPct],
    ['≥1 author with an institutional affiliation', c.withAffiliationPct],
    ['≥1 author with an identifiable country', c.withCountryPct],
    ['Publication venue', c.withVenuePct],
    ['DOI', c.withDoiPct],
    ['Subject keywords (P921)', c.withKeywordsPct],
    ['Cited at least once within Wikidata', c.citedPct],
  ];
  return (
    `**Table 0.** Metadata coverage of the analysed corpus (N = ${c.docs})\n\n| Field | Share of works (%) |\n|---|---|\n` +
    rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n') +
    `\n\n`
  );
}


export async function generatePaperWithLlm(
  topic: string,
  selectedId: string,
  queryText: string,
  stats: StudyStats,
  priorStudies: Publication[],
  settings: AppSettings,
  log: (msg: string) => void
): Promise<string> {
  const compact = {
    totalDocs: stats.docs,
    span: stats.span,
    cagr: stats.annualGrowthPct,
    doublingTime: stats.doublingTimeYears,
    totalCitations: stats.totalCitations,
    meanCitations: stats.meanCitations,
    hIndex: stats.hIndex,
    gIndex: stats.gIndex,
    mQuotient: stats.mQuotient,
    authors: stats.authors,
    dc: stats.degreeOfCollaboration,
    ci: stats.collaborationIndex,
    cc: stats.collaborationCoefficient,
    intlCollabPct: stats.internationalCollabPct,
    mcpRatio: stats.mcpRatio,
    topAuthors: stats.topAuthors.slice(0, 5).map((a) => `${a.name} (${a.works} works, ${a.citations} cites)`),
    topCountries: stats.topCountries.slice(0, 5).map((c) => `${c.country} (${c.works} works)`),
    topSources: stats.topSources.slice(0, 5).map((s) => s.name),
  };

  const prevFormatted = priorStudies.map((p, i) => `[${i + 1}] ${citePublication(p)}`).join('\n\n');

  // Publication-ready structured manuscript title and frontmatter
  let md = `# Mapping the Intellectual Structure and Collaboration Topologies of ${topic}: A Longitudinal Scientometric Investigation using Linked Open Knowledge Graphs\n\n`;
  md += `*Draft generated automatically by SciMetro Studio — not peer reviewed; all interpretations must be verified by the authors before submission.*\n`;
  md += `*Data source: ${settings.db} (SPARQL endpoint: \`${settings.qleverUrl}\`). Data retrieved and analysed on ${new Date().toISOString().slice(0, 10)}. Wikidata is continuously edited, so results will change over time.*\n\n`;

  // Abstract formatted for Scientometrics / Journal of Informetrics
  md += `### Abstract\n\n`;
  md += `**Purpose:** This study maps the growth, sources, authorship, collaboration and thematic structure of the scholarly literature on ${topic}, using bibliographic records openly available in Wikidata via the QLever SPARQL endpoint.\n\n`;
  md += `**Methodology:** ${stats.docs} works with publication years between ${stats.span[0]} and ${stats.span[1]} were retrieved (${stats.origins['search'] || 0} by topic search, ${(stats.origins['citing'] || 0) + (stats.origins['reference'] || 0)} added by one-step citation snowballing). Author identities are those recorded as Wikidata items; no further name disambiguation was performed. We computed growth, citation-impact, collaboration and source-concentration indicators, tested Lotka's law by maximum likelihood with a Kolmogorov–Smirnov test, and built co-authorship, co-word, institutional and country networks.\n\n`;
  md += `**Findings:** Annual output grew at ${stats.annualGrowthPct != null ? `${stats.annualGrowthPct}% per year (log-linear fit over ${stats.growthYearsUsed ?? 'n/a'} complete years, R² = ${fmt(stats.growthR2, 2)}${stats.doublingTimeYears ? `; doubling time ${stats.doublingTimeYears} years` : ''})` : 'a rate that could not be estimated (too few complete years)'}. The corpus has ${stats.totalCitations.toLocaleString()} within-Wikidata citation links (h = ${stats.hIndex}, g = ${stats.gIndex}). ${collabSentence(stats)} ${stats.internationalCollabPct != null ? `Of the works with at least one identifiable country, ${stats.internationalCollabPct}% involved authors from more than one country.` : 'Country information was too sparse to estimate international collaboration.'} ${lotkaSentence(stats)}\n\n`;
  md += `**Limitations:** Indicators are conditional on Wikidata's coverage, which is partial and uneven (see Table 0); results should be read as a description of the Wikidata-indexed literature rather than of the whole field.\n\n`;
  md += `**Keywords:** Scientometrics, Bibliometrics, ${topic}, Knowledge Graphs, Wikidata QLever, Co-authorship Networks, Lotka's Law, Bradford's Law, Information Science.\n\n---\n\n`;

  // Section 1: Introduction
  log('Writing Section 1: Introduction & Theoretical Framework…');
  md += `## 1. Introduction and Theoretical Framework\n\n`;
  md += `Quantitative studies of scientific literature, building on the work of Price, Merton and Garfield, describe how specialties emerge, grow and organise themselves. This paper applies standard informetric indicators to the literature on ${topic}.\n\n`;
  md += `Scholarly communication behaves as an evolving complex adaptive network shaped by cumulative advantage (the Matthew effect in science) and socio-cognitive clustering. Studying ${topic} through open linked data makes the analysis reproducible in a way that proprietary bibliographic databases do not; Wikidata, queried here through QLever, holds a large but incomplete share of the scholarly record, and its coverage limits are quantified in Section 3.3.\n\n`;
  md += `To systematically interrogate this corpus, our investigation addresses four formal research questions:\n\n`;
  md += `- **RQ1 (Temporal Expansion & Velocity):** What is the historical trajectory, compound annual growth rate (CAGR), and literature doubling time of scientific publications concerning ${topic}?\n`;
  md += `- **RQ2 (Dissemination Channels & Dispersion):** How is scientific output scattered across journals and proceedings, and to what extent does it conform to Bradford's law of scattering?\n`;
  md += `- **RQ3 (Authorship Stratification & Elite Concentration):** How are scientific contributions distributed among prolific authors, and does author productivity follow Lotka's law and Price's square-root elite conjecture?\n`;
  md += `- **RQ4 (Relational Collaboration Topologies):** What are the structural and topological characteristics of the co-authorship collaboration networks, institutional alliances, thematic keyword co-occurrences, and cross-national research axes?\n\n`;

  // Section 2: Related Works & Systematic Literature Appraisal
  log('Writing Section 2: Related Works & Systematic Literature Review…');
  md += `## 2. Related Works and Prior Reviews\n\n`;
  md += `Scientometric and conceptual inquiries into ${topic} have evolved through distinct phases: foundational conceptualizations, domain-specific empirical trials, and recent quantitative mappings. A critical appraisal of existing surveys, meta-analyses, and bibliometric evaluations is vital to identify methodological boundaries, assess citation velocity, and articulate the unresolved research gaps that motivate our investigation.\n\n`;

  md += `### 2.1 Conceptual Background\n`;
  md += `*[Authors: add a substantive conceptual background for ${topic} here. SciMetro does not generate it because it has not read the literature.]*\n\n`;

  md += `### 2.2 Previously Published Reviews Indexed in Wikidata\n`;
  if (priorStudies.length > 0) {
    const cnt = (t: string) => priorStudies.filter((p) => p.reviewType === t).length;
    md += `A Wikidata search for review-type works on ${topic} (title keywords such as review, survey, bibliometric, systematic, plus review-article item classes) returned ${priorStudies.length} candidates: ${cnt('bibliometric')} labelled bibliometric, ${cnt('systematic_review')} systematic reviews and ${cnt('conceptual_survey')} other surveys. **These labels come from title keywords only; the full texts were not read, so Table 2 makes no claim about their methods, data sources, findings or gaps.**\n\n`;
    md += `**Table 2.** Review-type works on ${topic} retrieved from Wikidata (title-based classification)\n\n`;
    md += `| Ref | First author (year) | Type (from title) | Venue | Citations in Wikidata |\n| :--- | :--- | :--- | :--- | ---: |\n`;
    priorStudies.slice(0, 10).forEach((p, idx) => {
      const firstAuth = p.authors.length > 0 ? p.authors[0].name : 'n/a';
      const typeLabel =
        p.reviewType === 'bibliometric' ? 'Bibliometric' : p.reviewType === 'systematic_review' ? 'Systematic review' : 'Survey / other';
      md += `| [${idx + 1}] | ${firstAuth} (${p.year || 'n.d.'}) | ${typeLabel} | ${(p.venue || '—').replace(/\|/g, '/')} | ${p.cites} |\n`;
    });
    md += `\n*[Authors: read these works and replace this subsection with a critical appraisal of their scope, data and conclusions.]*\n\n`;
  } else {
    md += `No review-type works on ${topic} were retrieved from Wikidata. This does not show that none exist: Wikidata's coverage is incomplete. *[Authors: complement with a manual literature search.]*\n\n`;
  }

  md += `### 2.3 Motivation\n`;
  md += `This study applies a transparent, reproducible pipeline (open data, published queries) to ${topic}. Whether it fills a gap relative to existing reviews must be established by the authors after reading the works listed above.\n\n`;

  // Section 3: Data & Methodology
  log('Writing Section 3: Data & Scientometric Methodology…');
  md += `## 3. Data and Scientometric Methodology\n\n`;
  const searchN = stats.origins['search'] || 0;
  const truncated = searchN >= settings.mx;
  md += `### 3.1 Data Retrieval Protocol\n`;
  md += `Records were retrieved from the QLever endpoint (${settings.qleverUrl}) on ${new Date().toISOString().slice(0, 10)}. The target concept (${selectedId}) and up to 15 related Wikidata items (subclass of, instance of, facet of, part of, has part) were used as main-subject values (\`wdt:P921\`), with a title filter: \`${queryText.replace(/\n/g, ' AND ')}\` (terms within a group are alternatives; groups are combined with AND). Works were then expanded by one step of forward and backward citation snowballing from the 20 most-cited seeds (\`wdt:P2860\`); snowballed works are not guaranteed to match the topic query. Works lacking a publication year or title were excluded, and duplicates were removed by Wikidata item identifier. The corpus therefore comprises ${searchN} topic-search records and ${(stats.origins['citing'] || 0) + (stats.origins['reference'] || 0)} snowballed records.\n\n`;
  if (truncated) {
    md += `> **Warning — truncated sample.** The topic search reached its configured limit of ${settings.mx} records and is ordered by citation count, so the corpus over-represents highly cited works. Citation, growth and concentration indicators are therefore **not** estimates for the whole literature.\n\n`;
  }

  md += `### 3.2 Indicators\n`;
  md += `1. **Growth:** log-linear regression of annual counts on year over complete calendar years (the current, partial year is excluded): $r = \\exp(\\beta) - 1$; doubling time $t_d = \\ln 2 / \\ln(1 + r)$; fit quality is reported as R². Years with zero output cannot enter a log regression and are omitted.\n`;
  md += `2. **Citation impact:** h-index, g-index and m-quotient on within-Wikidata citation counts (links of type \`wdt:P2860\` between Wikidata items). These are not comparable with Web of Science, Scopus or Google Scholar counts, and are not normalised for age or field.\n`;
  md += `3. **Lotka's law:** $f(x) = C / x^{\\alpha}$ fitted by maximum likelihood on the finite support $1..x_{max}$, tested with the Kolmogorov–Smirnov statistic at the 1% level (critical value $1.63/\\sqrt{n}$), full counting. A fit is accepted only if the test is not rejected and $\\alpha \\ge 1$.\n`;
  md += `4. **Price's law:** the share of authorships held by the $\\lceil\\sqrt{N_a}\\rceil$ most productive authors, compared with the predicted 50%.\n`;
  md += `5. **Bradford's law:** sources ranked by yield and split into three zones of approximately equal numbers of works.\n`;
  md += `6. **Collaboration:** Subramanyam's $DC = N_m / (N_m + N_s)$ and Ajiferuke's $CC = 1 - \\sum_k (1/k) f_k / N$, computed on works with at least one resolved author; international collaboration is the share of works whose resolved authors span more than one country, among works with at least one identifiable country.\n`;
  md += `7. **Networks:** undirected graphs restricted to the top-ranked nodes of each type (25 authors, 20 keywords, 18 countries and institutions); density $2|E| / (|V|(|V|-1))$ and mean degree $2|E| / |V|$.\n\n`;

  md += `### 3.3 Data Quality and Coverage\n`;
  md += coverageTable(stats);
  md += `Authors are counted only when recorded as Wikidata items (\`wdt:P50\`). Authors recorded as plain name strings (\`wdt:P2093\`) are **not** retrieved, so author counts, productivity, collaboration indices and co-authorship networks describe the resolved subset only and can be strongly biased when that subset is small. Countries come from the institution's country statement (\`wdt:P17\`) where available, otherwise from parsing the affiliation label; affiliations reflect the author's recorded employer, not necessarily the affiliation at publication time.\n\n`;

  // Section 4: Empirical Results
  log('Writing Section 4: Empirical Results & Figures…');
  md += `## 4. Empirical Results\n\n`;

  md += `### 4.1 Publication Trajectory and Growth Dynamics\n`;
  md += `The retrieved corpus encompasses ${stats.docs} publications published between ${stats.span[0]} and ${stats.span[1]}. The fitted annual growth rate is ${stats.annualGrowthPct != null ? `${stats.annualGrowthPct}%` : 'N/A'} (${stats.growthYearsUsed ?? 0} complete years, R² = ${fmt(stats.growthR2, 2)})${
    stats.doublingTimeYears ? `, implying a doubling time of ${stats.doublingTimeYears} years` : ''
  }${(stats.excludedMissingYear || 0) > 0 ? `; ${stats.excludedMissingYear} works without a year were excluded` : ''}. The total citation accumulation reached ${stats.totalCitations.toLocaleString()} citations across the surveyed timeframe (Mean: ${stats.meanCitations} citations/work, Median: ${stats.medianCitations}). The overall intellectual impact is reflected in a Hirsch h-index of ${stats.hIndex}, an Egghe g-index of ${stats.gIndex}, and an m-quotient of ${stats.mQuotient ?? 'N/A'}.\n\n`;
  md += `**Figure 1.** *Annual scientific production trajectory, citation accumulation, and exponential growth dynamics for ${topic} (${stats.span[0]}–${stats.span[1]}).*\n\n`;

  md += `### 4.2 Dissemination Sources and Bradford's Law of Scattering\n`;
  md += `Bradford scattering analysis partitioned the dissemination venues into three zones. Zone 1 (Core Nucleus) comprises ${stats.bradfordZones[0]?.sourcesCount || 0} core sources producing ${stats.bradfordZones[0]?.worksCount || 0} works (${stats.bradfordZones[0]?.percentage || 0}% of the literature). Prominent core dissemination vehicles include ${stats.topSources.slice(0, 4).map((s) => `*${s.name}* (${s.works} works)`).join(', ') || 'specialized academic venues'}. Zone 2 (Extended Zone) contains ${stats.bradfordZones[1]?.sourcesCount || 0} sources yielding ${stats.bradfordZones[1]?.worksCount || 0} works, while Zone 3 (Peripheral Scattering) encompasses ${stats.bradfordZones[2]?.sourcesCount || 0} sources.\n\n`;
  md += `**Figure 2.** *Bradford's law of source scattering: Core Nucleus (Zone 1), Extended (Zone 2), and Peripheral (Zone 3) distribution.*\n\n`;

  md += `### 4.3 Authorship Stratification and Lotka's Law\n`;
  md += `${stats.authors} distinct authors with Wikidata identities appear in the corpus (${stats.authorsPerDoc} resolved authors per work). ${collabSentence(stats)} ${lotkaSentence(stats)} ${priceSentence(stats)}\n\n`;

  md += `### 4.4 Scientometric Networks and Topological Analysis\n\n`;

  // 4.4.1 Co-authorship
  md += `#### 4.4.1 Co-authorship Network Architecture\n`;
  md += `The co-authorship network consists of ${stats.coauthorshipNetwork.nodes.length} primary author nodes and ${stats.coauthorshipNetwork.edges.length} collaborative ties. Topological analysis indicates an average degree of ${
    stats.coauthorshipNetwork.nodes.length ? +((2 * stats.coauthorshipNetwork.edges.length) / stats.coauthorshipNetwork.nodes.length).toFixed(2) : 0
  } and network density of ${
    stats.coauthorshipNetwork.nodes.length > 1
      ? +((2 * stats.coauthorshipNetwork.edges.length) / (stats.coauthorshipNetwork.nodes.length * (stats.coauthorshipNetwork.nodes.length - 1))).toFixed(3)
      : 0
  }. Prominent collaborative dyads and central hubs are detailed in Table 13.\n\n`;
  const coauthorMermaid = generateMermaidCoauthorshipGraph(stats);
  if (coauthorMermaid) {
    md += `**Figure 3.** *High-density co-authorship collaborative clusters and primary research groups:*\n\n${coauthorMermaid}\n`;
  }

  // 4.4.2 Thematic Keywords
  md += `#### 4.4.2 Thematic Keyword Co-occurrence Topology and Intellectual Fronts\n`;
  md += `Co-word analysis reveals the conceptual backbone of ${topic}. The keyword co-occurrence network comprises ${stats.keywordNetwork.nodes.length} nodes and ${stats.keywordNetwork.edges.length} relational edges. High-frequency keywords reflect core thematic clusters, while co-occurrence tie strengths indicate emerging cross-thematic bridges (Table 14).\n\n`;
  const kwMermaid = generateMermaidKeywordGraph(stats);
  if (kwMermaid) {
    md += `**Figure 4.** *Intellectual structure and thematic keyword co-occurrence fronts:*\n\n${kwMermaid}\n`;
  }

  // 4.4.3 International Collaboration
  md += `#### 4.4.3 International Scientific Collaboration Networks\n`;
  md += `Multiple Country Publications (MCP) accounted for ${stats.multiCountryPubs} works, representing an international collaboration ratio of ${stats.internationalCollabPct != null ? `${stats.internationalCollabPct}%` : 'N/A'} (MCP ratio = ${stats.mcpRatio}). The cross-national collaboration network encompasses ${stats.countryNetwork.nodes.length} countries and ${stats.countryNetwork.edges.length} bilateral collaborative linkages (Table 15).\n\n`;
  const countryMermaid = generateMermaidCountryGraph(stats);
  if (countryMermaid) {
    md += `**Figure 5.** *Global cross-national scientific collaboration network and MCP distribution:*\n\n${countryMermaid}\n`;
  }

  // 4.4.4 Institutional Alliances
  md += `#### 4.4.4 Institutional Collaboration Topologies\n`;
  md += `The institutional collaboration network comprises ${stats.institutionNetwork.nodes.length} institutions linked by ${stats.institutionNetwork.edges.length} ties, each meaning that authors from both institutions co-appear on at least one work (Table 16).\n\n`;
  md += `**Figure 6.** *Inter-institutional research alliances and university collaboration topology.*\n\n`;

  // 4.4.5 Literature Review Synthesis Figure
  md += `#### 4.4.5 Systematic Review Synthesis Architecture\n`;
  md += `**Figure 7.** *Methodological workflow, systematic review taxonomy, and research gap positioning.*\n\n`;

  // Output all 16 academic tables
  md += `### 4.5 Informetric Tables and Indicators\n\n`;
  md += generateMarkdownTables(stats);

  // Section 5: Discussion
  log('Writing Section 5: Discussion & Theoretical Implications…');
  md += `## 5. Discussion\n\n`;
  md += `The corpus grew at ${stats.annualGrowthPct != null ? `${stats.annualGrowthPct}% per year` : 'a rate that could not be estimated'}${stats.growthR2 != null ? ` (R² = ${fmt(stats.growthR2, 2)}${stats.growthR2 < 0.7 ? ', so a constant exponential rate describes the series poorly' : ''})` : ''}. Because Wikidata coverage itself expands over time, part of any growth measured here may reflect growing data entry rather than growing research output.\n\n`;
  md += `${lotkaSentence(stats)} ${priceSentence(stats)} These tests apply to the ${stats.authors} authors that Wikidata resolves, not necessarily to all authors in the field.\n\n`;
  md += `${collabSentence(stats)}${stats.internationalCollabPct != null ? ` International co-authorship is ${stats.internationalCollabPct}% among works with identifiable countries` : ''}${stats.coverage ? ` (only ${stats.coverage.withCountryPct}% of works have any identifiable country, so this figure is indicative at best)` : ''}.\n\n`;
  md += `*[Authors: interpret these results against the substantive literature on ${topic}; SciMetro does not generate theoretical interpretation.]*\n\n`;

  // Section 6: Limitations
  log('Writing Section 6: Limitations…');
  md += `## 6. Limitations\n\n`;
  md += `1. **Coverage.** Wikidata covers only part of the scholarly record and unevenly across fields and years (Table 0). Metadata completeness for this corpus: authors ${stats.coverage?.withAuthorsPct ?? 'n/a'}%, affiliations ${stats.coverage?.withAffiliationPct ?? 'n/a'}%, countries ${stats.coverage?.withCountryPct ?? 'n/a'}%, keywords ${stats.coverage?.withKeywordsPct ?? 'n/a'}%.\n`;
  md += `2. **Authors.** Only authors recorded as Wikidata items are retrieved; name-string authors (\`wdt:P2093\`) are missed, and no further disambiguation was done. Authorship, collaboration and network indicators are conditional on this subset.\n`;
  md += `3. **Citations.** Counts are links between Wikidata items only and are not normalised by age or field; they are not comparable with Web of Science, Scopus or Google Scholar.\n`;
  md += `4. **Sampling.** ${truncated ? `The topic search hit its ${settings.mx}-record limit and is ordered by citation count, biasing the corpus toward highly cited works. ` : ''}Title-keyword filtering and main-subject statements determine recall and precision; neither was validated against a gold-standard sample here. Snowballed works are not topic-filtered.\n`;
  md += `5. **Single source.** No cross-validation against another database (e.g. OpenAlex, Scopus, Web of Science) was performed.\n`;
  md += `6. **Keywords.** The co-word analysis mixes Wikidata subject items with words from titles and has no lemmatisation or thesaurus; clusters are not statistically validated.\n\n`;

  // Section 7: Conclusion
  log('Writing Section 7: Conclusion…');
  md += `## 7. Conclusion\n\n`;
  md += `This study profiled the Wikidata-indexed literature on ${topic}: ${stats.docs} works (${stats.span[0]}–${stats.span[1]}), their growth, citation distribution, source concentration, authorship and collaboration structure. Findings are conditional on the coverage limits in Section 6.\n\n`;
  md += `The queries and indicator definitions above allow the analysis to be repeated; results should be re-run against current Wikidata and, ideally, cross-checked against a second bibliographic source.\n\n`;

  // Section 8: References
  log('Writing Section 8: References…');
  md += `## 8. References\n\n`;
  if (priorStudies.length > 0) {
    priorStudies.forEach((p, idx) => {
      md += `[${idx + 1}] ${citePublication(p)}\n\n`;
    });
  } else {
    md += `*(No prior review studies indexed for this specific concept on Wikidata. Relevant literature cited directly in text.)*\n\n`;
  }

  log('Publication-ready academic manuscript generation complete.');
  return md;
}
