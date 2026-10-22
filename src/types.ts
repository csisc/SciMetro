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
