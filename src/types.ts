export interface AppSettings {
  qleverUrl: string; // QLever SPARQL endpoint URL
  ol: string;        // Ollama URL
  md: string;        // Ollama model
  db: string;        // Database name, default 'Wikidata (QLever)'
  mx: number;        // Max search results
  th: number;        // Relevance threshold
  lg: string;        // Wikidata languages
  rp: string;        // GitHub repo
  pt: string;        // Folder in repo
  tk: string;        // GitHub token
  llmProvider: 'synthesizer' | 'ollama' | 'gemini'; // LLM engine
  useGeminiFallback: boolean;
  geminiApiKey?: string;
}

export interface WikidataHit {
  id: string;
  label: string;
  description?: string;
}

export interface TermPack {
  id: string;
  rel: string;
  labels: Record<string, string>;
  aliases: Record<string, string[]>;
}

export interface Author {
  k: string;       // Wikidata URI or identifier
  name: string;
  aff: string;     // Institution name
  country: string; // Country name
}

export interface Publication {
  id: string;      // Wikidata work URI
  title: string;
  year: number;
  venue: string;   // Journal or Conference
  doi: string;
  omid: string;    // Wikidata QID
  cites: number;
  nrefs?: number;
  authors: Author[];
  keywords: string[]; // Subject keywords (wdt:P921)
  origin: 'search' | 'reference' | 'citing' | 'prior';
  // Enhanced literature review attributes
  reviewType?: 'bibliometric' | 'systematic_review' | 'conceptual_survey';
  scope?: string;
  methodology?: string;
  keyFindings?: string;
  researchGap?: string;
}

export interface NetworkNode {
  id: string;
  name: string;
  type: 'author' | 'keyword' | 'country' | 'institution';
  weight: number;      // total frequency or citations
  secondary?: string;  // e.g. affiliation or country
  cluster?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  cosine?: number;      // Salton cosine: w / sqrt(o_i * o_j)
  affinity?: number;    // observed / expected co-occurrence (probabilistic affinity index)
}

export interface ScientometricNetwork {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export interface LotkaRow {
  works: number | string;
  observed: number;
  theoretical: number;
}

export interface BradfordZone {
  zone: 1 | 2 | 3;
  name: string;
  sourcesCount: number;
  worksCount: number;
  percentage: number;
  sources: string[];
}

export interface AuthorRanking {
  id: string;
  name: string;
  works: number;
  citations: number;
  hIndex: number;
  institution: string;
  country: string;
}

export interface SourceRanking {
  name: string;
  works: number;
  citations: number;
  bradfordZone: 1 | 2 | 3;
}

export interface CountryRanking {
  country: string;
  works: number;
  citations: number;
  scp: number;       // Single Country Publications
  mcp: number;       // Multiple Country Publications
  mcpRatio: number;  // International collaboration intensity
}

export interface InstitutionRanking {
  name: string;
  country: string;
  works: number;
  citations: number;
}

export interface KeywordRanking {
  keyword: string;
  count: number;
  percentage: number;
}

export interface LotkaFit {
  alpha: number;          // fitted exponent (least squares on log-log, Pao 1985)
  C: number;              // normalising constant over observed range
  r2: number;             // goodness of the log-log fit
  ks: number;             // Kolmogorov-Smirnov D statistic (max |F_obs - F_theo|)
  ksCritical: number;     // critical D at alpha = 0.01 (1.63 / sqrt(n))
  nAuthors: number;
  maxWorks: number;
  conforms: boolean;      // ks <= ksCritical
}

export interface PriceShare {
  eliteAuthors: number;   // ceil(sqrt(N))
  eliteAuthorships: number;
  totalAuthorships: number;
  sharePct: number;       // Price predicts ~50%
}

export interface DataCoverage {
  docs: number;
  withYearPct: number;
  withAuthorsPct: number;
  withAffiliationPct: number;
  withCountryPct: number;
  withVenuePct: number;
  withDoiPct: number;
  withKeywordsPct: number;
  citedPct: number;
  missingYearDocs: number;
}

export interface CssClass {
  label: string;
  rule: string;
  docs: number;
  docsPct: number;
  citationsPct: number;
}

export interface CharacteristicScores {
  beta1: number;
  beta2: number;
  beta3: number;
  classes: CssClass[];
}

export interface HIndexFamily {
  h: number;
  g: number;
  a: number;      // mean citations of the h-core (Jin 2007)
  r: number;      // sqrt of total citations of the h-core (Jin et al. 2007)
  hCoreSharePct: number;
}

export interface Concentration {
  n: number;
  gini: number;
  top10PctShare: number;   // share of the total held by the top 10% of units
  top20PctShare: number;
  top15PctShare: number;   // Seglen (1992) benchmark: 15% of articles collect ~50% of citations
  top50PctShare: number;   // Seglen (1992) benchmark: the most cited half hold ~90%
}

export interface GrowthModels {
  n: number;
  exponential: { ratePct: number; ciLowPct: number; ciHighPct: number; r2Count: number; rss: number };
  linear: { slopePerYear: number; r2Count: number; rss: number };
  preferred: 'exponential' | 'linear';
}

export interface PeriodRow {
  label: string;
  docs: number;
  sharePct: number;
  citations: number;
  cpp: number;                 // mean citations per paper
  cpy: number;                 // mean citations per work per year of exposure (age-adjusted)
  authorsPerDoc: number;
  multiAuthorPct: number;
  partial: boolean;
}

export interface RelativeImpactRow {
  name: string;
  works: number;
  cpp: number;
  rcr: number | null;          // >1: cited above the corpus expectation for the same years
  top10Pct: number | null;     // % of its works in the top 10% of their year cohort
}

export interface NetworkAnalysis {
  nodes: number;
  edges: number;
  density: number;
  avgDegree: number;
  components: number;
  transitivity: number;
  modularity: number | null;
  communities: { id: number; size: number; members: string[] }[];
  centrality: { id: string; name: string; degree: number; strength: number; betweenness: number }[];
}

export interface DiversityIndices {
  terms: number;
  shannon: number;
  evenness: number;
  simpson: number;
  raoStirling: number;
}

export interface ScreeningReport {
  upstream?: { identified: number; duplicatesById: number; missingYearOrTitle: number };
  received: number;
  removed: { reason: string; count: number; examples: string[] }[];
  included: number;
  uncitedPct: number | null;
  citationSelectionFlag: boolean;
}

export interface StudyStats {
  docs: number;
  span: [number, number];
  byYear: Record<string, number>;
  citesByYear: Record<string, number>;
  cumulativeByYear: Record<string, number>;
  annualGrowthPct: number | null;
  doublingTimeYears: number | null;
  growthR2?: number | null;       // R^2 of the log-linear growth fit
  growthYearsUsed?: number;       // complete calendar years in the fit
  excludedMissingYear?: number;   // works lacking a publication year (excluded from time series)

  // Impact metrics
  totalCitations: number;
  meanCitations: number;
  medianCitations: number;
  hIndex: number;
  gIndex: number;
  mQuotient: number | null;

  // Authors & Productivity
  authors: number;
  docsPerAuthor: number;
  authorsPerDoc: number;
  singleAuthorPct: number;
  priceEliteCount: number;
  lotka: LotkaRow[];
  lotkaExponent: number;          // fitted alpha when estimable, else 2 (reference value)
  lotkaFit?: LotkaFit | null;
  screening?: ScreeningReport;
  worksWithVenue?: number;
  bradfordMultiplier?: { k1: number | null; k2: number | null; sourcesZone: [number, number, number] };
  hFamily?: HIndexFamily;
  css?: CharacteristicScores | null;
  citationConcentration?: Concentration;
  authorConcentration?: Concentration;
  sourceConcentration?: Concentration;
  growthModels?: GrowthModels | null;
  periods?: PeriodRow[];
  periodWidth?: number;
  countryImpact?: RelativeImpactRow[];
  institutionImpact?: RelativeImpactRow[];
  venueImpact?: RelativeImpactRow[];
  networkAnalysis?: {
    coauthorship: NetworkAnalysis;
    keyword: NetworkAnalysis;
    country: NetworkAnalysis;
    institution: NetworkAnalysis;
  };
  diversity?: DiversityIndices | null;
  excludedTerms?: string[];
  priceShare?: PriceShare;
  coverage?: DataCoverage;

  // Collaboration indices
  degreeOfCollaboration: number; // DC (Subramanyam, 1983)
  collaborationIndex: number;     // CI
  collaborationCoefficient: number; // CC (Ajiferuke, 1988)
  internationalCollabPct: number | null;
  singleCountryPubs: number;
  multiCountryPubs: number;
  mcpRatio: number;

  // Bradford's law
  bradfordZones: BradfordZone[];

  // Detailed Rankings
  topAuthors: AuthorRanking[];
  topSources: SourceRanking[];
  topCountries: CountryRanking[];
  topInstitutions: InstitutionRanking[];
  topKeywords: KeywordRanking[];
  topBigrams: [string, number][];
  citationBins: [string, number][];
  topCited: [string, number, number, string][]; // title, year, cites, doi
  origins: Record<string, number>;

  // Interactive Networks
  coauthorshipNetwork: ScientometricNetwork;
  keywordNetwork: ScientometricNetwork;
  countryNetwork: ScientometricNetwork;
  institutionNetwork: ScientometricNetwork;
}

export interface StoredStudyMeta {
  slug: string;
  title: string;
  date: string;
  works?: number;
  database: string;
  paperMarkdown: string;
  jsonData: string;
  savedAt: string;
}

export type StepStatus = 'idle' | 'running' | 'done' | 'failed';

export interface PipelineStepDef {
  id: string;
  name: string;
  status: StepStatus;
  message?: string;
}
