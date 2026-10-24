import { AppSettings, Publication, StudyStats } from '../types';
import { generateMarkdownTables } from './stats';
import { Citer } from './references';
import { compareWithLiterature } from './benchmarks';
import { fetchCrossref, toRef, extractCorpusFacts } from './crossref';
import type { CrossrefWork } from './crossref';
import { synthesizePrior } from './grounded';
import type { SourceForSynthesis } from './grounded';
import { buildFront, buildBack, renumberTables } from './paper';
import type { PriorEntry } from './paper';
import { assessReadiness } from './readiness';
import {
  fmt,
  lotkaSentence,
  priceSentence,
  collabSentence,
  growthSentence,
  citationStructureText,
  periodText,
  bradfordMultText,
  clusterText,
  screeningText,
  coverageTable,
} from './narrative';

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

export async function generatePaperWithLlm(
  topic: string,
  selectedId: string,
  queryText: string,
  stats: StudyStats,
  priorStudies: Publication[],
  settings: AppSettings,
  log: (msg: string) => void,
  deps: { fetchWork?: (doi: string) => Promise<CrossrefWork | null>; callModel?: (p: string) => Promise<string> } = {}
): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const cite = new Citer();
  const bench = compareWithLiterature(stats, cite);

  // Resolve prior review-type works to complete references through Crossref (Wikidata author
  // lists are often partial, so they are not used for citation).
  log('Resolving references of prior studies through Crossref…');
  const fetchWork = deps.fetchWork ?? ((doi: string) => fetchCrossref(doi));
  const seen = new Set<string>();
  const prior: PriorEntry[] = [];
  for (const p of priorStudies.filter((x) => x.doi).slice(0, 12)) {
    const d = p.doi.toLowerCase();
    if (seen.has(d)) continue;
    seen.add(d);
    const work = await fetchWork(p.doi);
    let key: string | null = null;
    if (work) {
      const ref = toRef(work, `prior:${work.doi}`);
      if (ref) {
        cite.register(ref);
        key = ref.key;
      }
    }
    prior.push({ pub: p, key, work: work || undefined, facts: work?.abstract ? extractCorpusFacts(work.abstract) : undefined });
  }
  log(`Prior studies: ${priorStudies.length} found, ${prior.filter((x) => x.key).length} resolved to complete references.`);

  // Optional grounded synthesis with a local model (every sentence is validated against sources)
  let priorSynthesis = '';
  let llmUsed = false;
  const modelCall =
    deps.callModel ?? (settings.llmProvider === 'ollama' ? (pr: string) => callOllama(pr, false, settings) : null);
  if (modelCall) {
    const sources: SourceForSynthesis[] = prior
      .filter((x) => x.key && x.work)
      .slice(0, 8)
      .map((x, i) => ({ tag: `S${i + 1}`, key: x.key!, year: x.work!.year || x.pub.year, title: x.work!.title, abstract: x.work!.abstract }));
    try {
      priorSynthesis = await synthesizePrior(topic, sources, cite, modelCall);
      llmUsed = !!priorSynthesis;
      log(llmUsed ? 'Grounded synthesis of prior studies accepted after validation.' : 'Grounded synthesis not used (too few abstracts or no sentence passed validation).');
    } catch (e: any) {
      log(`Grounded synthesis skipped: ${e.message}`);
    }
  }

  const ctx = {
    topic, selectedId, queryText, stats, settings, cite, bench, prior,
    priorTotal: priorStudies.length, priorSynthesis, llmUsed, date,
  };
  let md = buildFront(ctx);

  // Section 4: Empirical Results
  log('Writing Section 4: Empirical Results & Figures…');
  md += `### 3.5 Screening and selection diagnostics\n`;
  md += screeningText(stats);

  md += `## 4. Results\n\n`;

  md += `### 4.1 Publication trajectory and growth\n`;
  md += `Growth is modelled as described in Section 3.2 and compared with published rates in Section 5.2. `;
  md += `The retrieved corpus encompasses ${stats.docs} publications published between ${stats.span[0]} and ${stats.span[1]}. The fitted annual growth rate is ${stats.annualGrowthPct != null ? `${stats.annualGrowthPct}%` : 'N/A'} (${stats.growthYearsUsed ?? 0} complete years, R² = ${fmt(stats.growthR2, 2)})${
    stats.doublingTimeYears ? `, implying a doubling time of ${stats.doublingTimeYears} years` : ''
  }${(stats.excludedMissingYear || 0) > 0 ? `; ${stats.excludedMissingYear} works without a year were excluded` : ''}. The total citation accumulation reached ${stats.totalCitations.toLocaleString()} citations across the surveyed timeframe (Mean: ${stats.meanCitations} citations/work, Median: ${stats.medianCitations}). The citation indicators are a Hirsch h-index of ${stats.hIndex}, an Egghe g-index of ${stats.gIndex}, and an m-quotient of ${stats.mQuotient ?? 'N/A'}.\n\n`;
  md += `${growthSentence(stats)} ${periodText(stats)}\n\n`;
  md += `#### Citation structure\n${citationStructureText(stats)}\n\n`;
  md += `**Figure 1.** *Annual scientific production trajectory, citation accumulation, and exponential growth dynamics for ${topic} (${stats.span[0]}–${stats.span[1]}).*\n\n`;

  md += `### 4.2 Sources and Bradford's law\n`;
  md += `Sources were ranked by yield and divided into three zones of approximately equal numbers of works, following ${cite.n('bradford1934')}. `;
  md += `Bradford scattering analysis partitioned the dissemination venues into three zones. Zone 1 (Core Nucleus) comprises ${stats.bradfordZones[0]?.sourcesCount || 0} core sources producing ${stats.bradfordZones[0]?.worksCount || 0} works (${stats.bradfordZones[0]?.percentage || 0}% of the literature). Prominent core dissemination vehicles include ${stats.topSources.slice(0, 4).map((s) => `*${s.name}* (${s.works} works)`).join(', ') || 'specialized academic venues'}. Zone 2 (Extended Zone) contains ${stats.bradfordZones[1]?.sourcesCount || 0} sources yielding ${stats.bradfordZones[1]?.worksCount || 0} works, while Zone 3 (Peripheral Scattering) encompasses ${stats.bradfordZones[2]?.sourcesCount || 0} sources.\n\n`;
  md += `${bradfordMultText(stats)}\n\n`;
  md += `**Figure 2.** *Bradford's law of source scattering: Core Nucleus (Zone 1), Extended (Zone 2), and Peripheral (Zone 3) distribution.*\n\n`;

  md += `### 4.3 Authorship and Lotka's law\n`;
  md += `Author productivity is assessed against Lotka's law ${cite.p('lotka1926')}, fitted by maximum likelihood ${cite.p('clauset2009')}, and against Price's square-root law ${cite.p('price1963')}. `;
  md += `${stats.authors} distinct authors with Wikidata identities appear in the corpus (${stats.authorsPerDoc} resolved authors per work). ${collabSentence(stats)} ${lotkaSentence(stats)} ${priceSentence(stats)}\n\n`;

  md += `### 4.4 Networks\n\n`;

  // 4.4.1 Co-authorship
  md += `#### 4.4.1 Co-authorship network\n`;
  md += `Collaboration networks of scientists are typically clustered ${cite.p('newman2001')}; here only the most productive authors are shown, so density and clustering describe that subgraph and are not comparable with whole-network values. `;
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
  md += `#### 4.4.2 Subject-term network and thematic clusters\n`;
  md += `Subject terms and title words are normalised and the search terms removed (Section 3.2); association strength is measured by Salton's cosine ${cite.p('glanzel2001')}. `;
  md += `Co-word analysis reveals the conceptual backbone of ${topic}. The keyword co-occurrence network comprises ${stats.keywordNetwork.nodes.length} nodes and ${stats.keywordNetwork.edges.length} relational edges. High-frequency keywords reflect core thematic clusters, while co-occurrence tie strengths indicate emerging cross-thematic bridges (Table 14). ${clusterText(stats)}\n\n`;
  const kwMermaid = generateMermaidKeywordGraph(stats);
  if (kwMermaid) {
    md += `**Figure 4.** *Intellectual structure and thematic keyword co-occurrence fronts:*\n\n${kwMermaid}\n`;
  }

  // 4.4.3 International Collaboration
  md += `#### 4.4.3 International collaboration\n`;
  md += `Country links are compared after Salton-cosine and affinity normalisation ${cite.p('glanzel2001', 'zitt2000')}; the normalised links are in Table 27. `;
  md += `Multiple Country Publications (MCP) accounted for ${stats.multiCountryPubs} works, representing an international collaboration ratio of ${stats.internationalCollabPct != null ? `${stats.internationalCollabPct}%` : 'N/A'} (MCP ratio = ${stats.mcpRatio}). The cross-national collaboration network encompasses ${stats.countryNetwork.nodes.length} countries and ${stats.countryNetwork.edges.length} bilateral collaborative linkages (Table 15).\n\n`;
  const countryMermaid = generateMermaidCountryGraph(stats);
  if (countryMermaid) {
    md += `**Figure 5.** *Global cross-national scientific collaboration network and MCP distribution:*\n\n${countryMermaid}\n`;
  }

  // 4.4.4 Institutional Alliances
  md += `#### 4.4.4 Institutional collaboration\n`;
  md += `The institutional collaboration network comprises ${stats.institutionNetwork.nodes.length} institutions linked by ${stats.institutionNetwork.edges.length} ties, each meaning that authors from both institutions co-appear on at least one work (Table 16).\n\n`;
  md += `**Figure 6.** *Inter-institutional research alliances and university collaboration topology.*\n\n`;

  // 4.4.5 Literature Review Synthesis Figure
  md += `#### 4.4.5 Retrieval and screening flow\n`;
  md += `**Figure 7.** *Retrieval, screening and analysis workflow with the number of records at each stage.*\n\n`;

  // Output all 16 academic tables
  md += `### 4.5 Tables of indicators\n\nTables 17–27 report the additional citation-class, normalised-impact, period, growth-model and network indicators.\n\n`;
  md += generateMarkdownTables(stats);

  log('Writing Discussion, Limitations, Conclusions, Declarations and References…');
  md = cite.resolve(md);
  md += buildBack(ctx);
  md = renumberTables(md);

  const checks = assessReadiness({
    stats, settings, markdown: md, cite,
    priorTotal: priorStudies.length,
    priorResolved: prior.filter((x) => x.key).length,
    hypothesesAssessed: bench.filter((r) => r.isHypothesis && r.outcome !== 'not assessable').length,
  });
  checks.forEach((c) => log(`Pre-submission ${c.level.toUpperCase()}: ${c.message}`));

  log('Publication-ready academic manuscript generation complete.');
  return md;
}
