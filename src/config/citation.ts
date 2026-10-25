/**
 * Citation information for the tool and related work by Houcemeddine Turki and colleagues.
 *
 * Every related work below was checked against at least one independent record (publisher, PMC,
 * DOAJ, CEUR-WS, DBLP, RePEc or the conference programme) when this list was compiled, and each
 * link to the pipeline is limited to what the work's own abstract or description states.
 * The works are listed as conceptual background; they do not endorse or validate this software,
 * and SciMetro Studio does not reproduce their methods.
 */

export const APP_VERSION = '1.0.0'; // keep equal to package.json (checked by a test)
export const TOOL_NAME = 'SciMetro Studio';

export interface ToolCitation {
  apa: string;
  bibtex: string;
}

/** Citation of the tool itself. No author or persistent identifier is invented. */
export function toolCitation(url: string, accessed: Date = new Date()): ToolCitation {
  const year = accessed.getFullYear();
  const long = accessed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const iso = accessed.toISOString().slice(0, 10);
  const clean = url.replace(/[#?].*$/, '');
  return {
    apa: `${TOOL_NAME}. (${year}). ${TOOL_NAME} (Version ${APP_VERSION}) [Computer software]. ${clean} (accessed ${long})`,
    bibtex: `@software{scimetro_studio_${year},\n  title   = {${TOOL_NAME}},\n  version = {${APP_VERSION}},\n  year    = {${year}},\n  url     = {${clean}},\n  note    = {Accessed ${iso}}\n}`,
  };
}

/** Data and services the tool relies on, to be acknowledged next to the tool. */
export const DATA_SOURCES: { name: string; use: string; url: string }[] = [
  { name: 'Wikidata (CC0)', use: 'bibliographic records, authorship, subjects and citation links', url: 'https://www.wikidata.org' },
  { name: 'QLever', use: 'SPARQL endpoint used for retrieval', url: 'https://qlever.cs.uni-freiburg.de' },
  { name: 'Crossref', use: 'complete reference metadata of prior studies', url: 'https://www.crossref.org' },
  { name: 'Wikipedia', use: 'article titles and redirects used as alternative names', url: 'https://www.wikipedia.org' },
];

export type PipelinePart = 'terms' | 'metadata' | 'coverage' | 'indicators' | 'networks';

export const PIPELINE_PARTS: Record<PipelinePart, { label: string; where: string }> = {
  terms: { label: 'Terms and query formulation', where: 'Steps 1–2: multilingual labels, aliases, ontology relations and the title query' },
  metadata: { label: 'Bibliographic metadata and citation links', where: 'Retrieval, citation snowballing and keyword analysis' },
  coverage: { label: 'Coverage of open bibliographic data', where: 'Metadata and DOI coverage reported in the manuscript' },
  indicators: { label: 'Topic-level bibliometric indicators', where: 'Growth, document and geographic distribution in the results' },
  networks: { label: 'Collaboration and subject-term networks', where: 'Network analysis and thematic clusters' },
};

export type WorkKind = 'article' | 'letter' | 'research letter' | 'comment' | 'editorial';

export interface RelatedWork {
  id: string;
  part: PipelinePart;
  /** Article type, from the publisher or PubMed record (letters are marked in the interface). */
  kind: WorkKind;
  authors: string[]; // "Surname, I."
  year: number;
  title: string;
  venue: string;     // formatted venue text, without markup
  italic: string;    // the part of `venue` to set in italics ('' for none)
  doi?: string;
  url?: string;
  /** What the work does, limited to what its abstract or description states. */
  summary: string;
  /** How it connects to the pipeline. */
  relation: string;
}

export const RELATED_WORKS: RelatedWork[] = [
  {
    id: 'turki2019',
    part: 'terms',
    kind: 'article',
    authors: ['Turki, H.', 'Shafee, T.', 'Hadj Taieb, M. A.', 'Ben Aouicha, M.', 'Vrandečić, D.', 'Das, D.', 'Hamdi, H.'],
    year: 2019,
    title: 'Wikidata: A large-scale collaborative ontological medical database',
    venue: 'Journal of Biomedical Informatics, 99, 103292.',
    italic: 'Journal of Biomedical Informatics, 99',
    doi: '10.1016/j.jbi.2019.103292',
    summary: 'Presents Wikidata as a multilingual, structured and linked knowledge base and shows how its entities and relations can be processed automatically.',
    relation: 'The pipeline treats Wikidata the same way: it reads labels in several languages, aliases and ontology relations of the chosen topic to build its search terms.',
  },
  {
    id: 'turki2021talk',
    part: 'terms',
    kind: 'article',
    authors: ['Turki, H.'],
    year: 2021,
    title: 'Systematic review automation driven by Wikidata',
    venue: 'WikidataCon 2021, short presentation, 31 October 2021.',
    italic: '',
    url: 'https://pretalx.com/wdcon21/talk/HWZ8RG/',
    summary: 'Explains how Wikidata statements can support the automation of systematic-review tasks, from formulating search queries that identify relevant research evidence to recognising patterns in findings; code is published.',
    relation: 'Query formulation from Wikidata statements is the role of the pipeline’s term-gathering and query steps.',
  },
  {
    id: 'turki2021',
    part: 'metadata',
    kind: 'article',
    authors: ['Turki, H.', 'Hadj Taieb, M. A.', 'Ben Aouicha, M.', 'Fraumann, G.', 'Hauschke, C.', 'Heller, L.'],
    year: 2021,
    title: 'Enhancing knowledge graph extraction and validation from scholarly publications using bibliographic metadata',
    venue: 'Frontiers in Research Metrics and Analytics, 6, 694307.',
    italic: 'Frontiers in Research Metrics and Analytics, 6',
    doi: '10.3389/frma.2021.694307',
    summary: 'Shows how bibliographic metadata, such as titles, abstracts, controlled keywords and citation analysis, can drive and refine the extraction of knowledge from scholarly publications.',
    relation: 'The pipeline likewise relies on titles, subject keywords and citation links, rather than full texts, to retrieve and analyse a topic’s literature.',
  },
  {
    id: 'turki2023doi',
    part: 'coverage',
    kind: 'article',
    authors: ['Turki, H.', 'Fraumann, G.', 'Hadj Taieb, M. A.', 'Ben Aouicha, M.'],
    year: 2023,
    title: 'Global visibility of publications through Digital Object Identifiers',
    venue: 'Frontiers in Research Metrics and Analytics, 8, 1207980.',
    italic: 'Frontiers in Research Metrics and Analytics, 8',
    doi: '10.3389/frma.2023.1207980',
    summary: 'Analyses the availability of DOIs worldwide, matching DOI prefixes against Wikidata, and argues that missing DOIs reduce the visibility of publications from the Global South.',
    relation: 'Every manuscript reports DOI and metadata coverage, and prior studies are resolved through their DOIs.',
  },
  {
    id: 'turki2023wd',
    part: 'indicators',
    kind: 'article',
    authors: ['Turki, H.', 'Hadj Taieb, M. A.', 'Ben Aouicha, M.', 'Rasberry, L.', 'Mietchen, D.'],
    year: 2023,
    title: 'Ten years of Wikidata: A bibliometric study',
    venue: 'Wikidata’23: Wikidata Workshop at ISWC 2023 (CEUR Workshop Proceedings, Vol. 3640, paper 13).',
    italic: 'Wikidata’23: Wikidata Workshop at ISWC 2023',
    url: 'https://ceur-ws.org/Vol-3640/paper13.pdf',
    summary: 'Analyses research on Wikidata from 2012 to 2022 using Scopus (945 publications), reporting yearly growth, publication types and the concentration of institutions in the Global North.',
    relation: 'The same family of indicators (growth, document types, geographic distribution) is computed by the pipeline, here from Wikidata itself.',
  },
  {
    id: 'lrhoul2023',
    part: 'networks',
    kind: 'article',
    authors: ['Lrhoul, H.', 'Turki, H.', 'Hammouti, B.', 'Benammar, O.'],
    year: 2023,
    title: 'Internationalization of the Moroccan Journal of Chemistry: A bibliometric study',
    venue: 'Heliyon, 9(5), e15857.',
    italic: 'Heliyon, 9',
    doi: '10.1016/j.heliyon.2023.e15857',
    summary: 'A bibliometric study of a national journal that builds scientometric networks with Gephi and compares its output with national chemical research.',
    relation: 'Collaboration and topic networks are likewise built from bibliographic records in the pipeline’s network analysis.',
  },
  {
    id: 'turki2024',
    part: 'networks',
    kind: 'article',
    authors: ['Turki, H.', 'Chebil, K.'],
    year: 2024,
    title: 'A framework for integrating biomedical knowledge in Wikidata with open biological and biomedical ontologies and MeSH keywords',
    venue: 'Heliyon, 10(19), e38448.',
    italic: 'Heliyon, 10',
    url: 'https://psau.sa.elsevierpure.com/en/publications/a-framework-for-integrating-biomedical-knowledge-in-wikidata-with/',
    summary: 'Uses pointwise mutual information on the co-occurrence of MeSH keywords in PubMed to identify relations between biomedical concepts and to test relations stated in Wikidata.',
    relation: 'Association between subject keywords from their co-occurrence is the principle of the pipeline’s subject-term network.',
  },
  // ---- letters to the editor and comments ------------------------------------------------------
  {
    id: 'turki2016',
    part: 'indicators',
    kind: 'letter',
    authors: ['Turki, H.'],
    year: 2016,
    title: 'Usefulness of the single publication h-index',
    venue: 'Scientometrics, 106(3), 1281–1282.',
    italic: 'Scientometrics, 106',
    doi: '10.1007/s11192-015-1808-y',
    summary: 'A letter proposing the single publication h-index (the h-index of the works citing one publication) as useful and robust, notably for removing insignificant papers from a scientist’s h-core and for determining the citation activity of a paper.',
    relation: 'The pipeline reports the h-index, the g-index and the A- and R-indices of the h-core for a whole corpus; this letter concerns h-type indices applied to a single publication.',
  },
  {
    id: 'turki2018letters',
    part: 'indicators',
    kind: 'letter',
    authors: ['Turki, H.', 'Hadj Taieb, M. A.', 'Ben Aouicha, M.'],
    year: 2018,
    title: 'The value of letters to the editor',
    venue: 'Scientometrics, 117(2), 1285–1287.',
    italic: 'Scientometrics, 117',
    doi: '10.1007/s11192-018-2906-4',
    summary: 'Shows the interest of scientists in writing and citing letters to the editor, and reports the countries and institutions that published the most letters between 1996 and 2018.',
    relation: 'Ranking countries and institutions by output is among the results the pipeline produces for a topic.',
  },
  {
    id: 'turki2019arab',
    part: 'indicators',
    kind: 'research letter',
    authors: ['Turki, H.', 'Ben Aouicha, M.', 'Hadj Taieb, M. A.'],
    year: 2019,
    title: 'Discussing Arab Spring’s effect on scientific productivity and research performance in Arab countries',
    venue: 'Scientometrics, 120(1), 337–339.',
    italic: 'Scientometrics, 120',
    doi: '10.1007/s11192-019-03127-7',
    summary: 'Discusses whether the Arab Spring explains changes in the research productivity and impact of Arab countries, pointing to non-sociopolitical factors that can lie behind the variations in countries such as Qatar, the United Arab Emirates, Saudi Arabia, Tunisia, Lebanon and Algeria.',
    relation: 'Country-level output and impact are among the indicators the pipeline computes; the letter cautions against reading such variations as the effect of one cause.',
  },
  {
    id: 'turki2020nobel',
    part: 'metadata',
    kind: 'letter',
    authors: ['Turki, H.', 'Hadj Taieb, M. A.', 'Ben Aouicha, M.'],
    year: 2020,
    title: 'Facts to consider when analyzing the references of Nobel Prize scientific background',
    venue: 'Scientometrics, 124(1), 787–790.',
    italic: 'Scientometrics, 124',
    doi: '10.1007/s11192-020-03456-y',
    summary: 'Proposes extending analyses of the references of Nobel Prize scientific backgrounds with the number of mentions of each work, the author rank of the laureates, and citation and co-citation networks.',
    relation: 'The pipeline uses citation links to count citations and to expand a corpus; it does not yet build the citation or co-citation networks that this letter suggests.',
  },
  {
    id: 'turki2022beauties',
    part: 'metadata',
    kind: 'research letter',
    authors: ['Turki, H.', 'Hadj Taieb, M. A.', 'Ben Aouicha, M.'],
    year: 2022,
    title: 'Awakening sleeping beauties during the COVID-19 pandemic influences the citation impact of their references',
    venue: 'Scientometrics, 127(10), 6047–6050.',
    italic: 'Scientometrics, 127',
    doi: '10.1007/s11192-022-04501-8',
    summary: 'Shows that a peak of citations for a sleeping beauty is associated with a sharp increase in the citations received by its references, a cascade of citation-based awakening.',
    relation: 'The pipeline follows the same kind of links, to cited and citing works, when it expands a corpus by snowballing.',
  },
  {
    id: 'turki2018jce',
    part: 'metadata',
    kind: 'comment',
    authors: ['Turki, H.'],
    year: 2018,
    title: 'Citation analysis is also useful to assess the eligibility of biomedical research works for inclusion in living systematic reviews',
    venue: 'Journal of Clinical Epidemiology, 97, 124–125.',
    italic: 'Journal of Clinical Epidemiology, 97',
    doi: '10.1016/j.jclinepi.2017.11.002',
    summary: 'A published comment on Thomas et al.’s paper on combining human and machine effort in living systematic reviews. Its title states that citation analysis can help assess whether biomedical works are eligible for inclusion in living reviews; Thomas’s published reply agrees that citation analysis may have a role in study identification. PubMed lists no abstract.',
    relation: 'The pipeline follows citation links to find candidate works but does not assess their eligibility, and the manuscript states that snowballed works are not topic-filtered.',
  },
  {
    id: 'benaouicha2023editorial',
    part: 'coverage',
    kind: 'editorial',
    authors: ['Ben Aouicha, M.', 'Turki, H.', 'Hadj Taieb, M. A.'],
    year: 2023,
    title: 'Editorial: Linked open bibliographic data for real-time research assessment',
    venue: 'Frontiers in Research Metrics and Analytics, 8, 1275731.',
    italic: 'Frontiers in Research Metrics and Analytics, 8',
    doi: '10.3389/frma.2023.1275731',
    summary: 'Introduces a collection on open bibliographic data for research assessment. It notes that open knowledge graphs can combine bibliographic metadata with non-bibliographic information such as country and prize data, that open bibliographic resources contain inconsistencies and biases (for example, self-citations mistakenly recorded in OpenCitations), and that the data quality of open resources has to be assessed.',
    relation: 'This is why every manuscript reports metadata coverage, why journal items and duplicates are screened out, and why results are described as conditional on what Wikidata holds.',
  },
];

/** APA-style plain text of a related work. */
export function formatAuthors(a: string[]): string {
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} & ${a[1]}`;
  return `${a.slice(0, -1).join(', ')}, & ${a[a.length - 1]}`;
}

/** APA bracketed description of the article type; empty for ordinary articles. */
export function kindTag(w: RelatedWork): string {
  return w.kind === 'letter'
    ? ' [Letter to the editor]'
    : w.kind === 'research letter'
    ? ' [Research letter]'
    : w.kind === 'comment'
    ? ' [Comment]'
    : w.kind === 'editorial'
    ? ' [Editorial]'
    : '';
}

export function relatedApa(w: RelatedWork): string {
  const link = w.doi ? ` https://doi.org/${w.doi}` : w.url ? ` ${w.url}` : '';
  return `${formatAuthors(w.authors)} (${w.year}). ${w.title}${kindTag(w)}. ${w.venue}${link}`;
}

export function relatedBibtex(w: RelatedWork): string {
  const kind = w.id === 'turki2021talk' ? 'misc' : w.venue.startsWith('Wikidata’23') ? 'inproceedings' : 'article';
  const au = w.authors.map((a) => a.replace(/^([^,]+), (.+)$/, '$1, $2')).join(' and ');
  const lines = [`@${kind}{${w.id},`, `  author = {${au}},`, `  title  = {${w.title}},`, `  year   = {${w.year}},`];
  if (w.kind !== 'article') lines.push(`  note   = {${kindTag(w).trim().slice(1, -1)}},`);
  if (w.doi) lines.push(`  doi    = {${w.doi}},`);
  else if (w.url) lines.push(`  url    = {${w.url}},`);
  return lines.join('\n').replace(/,$/, '') + '\n}';
}
