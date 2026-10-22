import {
  Publication,
  StudyStats,
  AuthorRanking,
  SourceRanking,
  CountryRanking,
  InstitutionRanking,
  KeywordRanking,
  BradfordZone,
  LotkaRow,
  ScientometricNetwork,
  NetworkNode,
  NetworkEdge,
  LotkaFit,
  PriceShare,
  DataCoverage,
} from '../types';

const STOP_WORDS = new Set(
  'a an and are as at based by for from in into is it its of on or over the to towards toward using use via with within we our new approach study analysis system systems method methods paper review evaluation comparative international development research trends'.split(
    ' '
  )
);

export const cleanText = (t: string): string[] =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

export const topN = <T extends string | number>(a: T[], n: number): [T, number][] => {
  const m = new Map<T, number>();
  a.forEach((x) => x && m.set(x, (m.get(x) || 0) + 1));
  return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, n);
};

export const binCitation = (n: number): string =>
  n === 0
    ? '0'
    : n < 5
    ? '1–4'
    : n < 10
    ? '5–9'
    : n < 25
    ? '10–24'
    : n < 50
    ? '25–49'
    : n < 100
    ? '50–99'
    : '100+';

const CN =
  'afghanistan,albania,algeria,argentina,armenia,australia,austria,azerbaijan,bangladesh,belarus,belgium,bolivia,bosnia and herzegovina,brazil,bulgaria,cambodia,canada,chile,china,colombia,costa rica,croatia,cuba,cyprus,czech republic,denmark,ecuador,egypt,estonia,ethiopia,finland,france,georgia,germany,ghana,greece,hong kong,hungary,iceland,india,indonesia,iran,iraq,ireland,israel,italy,japan,jordan,kazakhstan,kenya,kuwait,latvia,lebanon,lithuania,luxembourg,macau,malaysia,malta,mexico,morocco,nepal,netherlands,new zealand,nigeria,norway,oman,pakistan,palestine,panama,peru,philippines,poland,portugal,qatar,romania,russia,saudi arabia,serbia,singapore,slovakia,slovenia,south africa,south korea,spain,sri lanka,sweden,switzerland,syria,taiwan,thailand,tunisia,turkey,uganda,ukraine,united arab emirates,united kingdom,united states,uruguay,uzbekistan,venezuela,vietnam,yemen,zimbabwe'.split(
    ','
  );

const CA: Record<string, string> = {
  usa: 'united states',
  us: 'united states',
  'u.s.a.': 'united states',
  'u.s.': 'united states',
  uk: 'united kingdom',
  england: 'united kingdom',
  scotland: 'united kingdom',
  wales: 'united kingdom',
  'northern ireland': 'united kingdom',
  korea: 'south korea',
  'republic of korea': 'south korea',
  'p.r. china': 'china',
  prc: 'china',
  "people's republic of china": 'china',
  'the netherlands': 'netherlands',
  holland: 'netherlands',
  czechia: 'czech republic',
  türkiye: 'turkey',
  turkiye: 'turkey',
  uae: 'united arab emirates',
  'russian federation': 'russia',
  vietnam: 'vietnam',
  'viet nam': 'vietnam',
};

const CS = new Set(CN);
const titleCase = (x: string) => x.replace(/\b\w/g, (m) => m.toUpperCase());

// Names that are also US states, people or ordinary words: never matched by free-text
// scanning, only accepted as the final comma-separated segment of an affiliation string
// (and "georgia" additionally needs a Georgian city to rule out the US state).
const AMBIGUOUS = new Set(['georgia', 'jordan', 'oman', 'india', 'chad', 'niger', 'mali', 'peru']);
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const countryOf = (aff: string): string => {
  if (!aff) return '';
  const lower = aff.toLowerCase();
  const parts = lower
    .split(',')
    .map((x) => x.trim().replace(/\.$/, ''))
    .reverse();

  // 1. Exact match on the trailing comma-separated segments ("..., Germany")
  for (const x of parts.slice(0, 2)) {
    const k = CA[x] || x;
    if (CS.has(k)) {
      if (k === 'georgia' && !/tbilisi|kutaisi|batumi|republic of georgia/.test(lower)) continue;
      return titleCase(k);
    }
  }

  // 2. Whole-word scan (so "Indiana" != India, "Woman" != Oman, "Romania" != Oman)
  for (const c of CN) {
    if (AMBIGUOUS.has(c)) continue;
    if (new RegExp(`(^|[^\\p{L}])${escapeRe(c)}($|[^\\p{L}])`, 'u').test(lower)) return titleCase(c);
  }
  return '';
};

const median = (sortedDesc: number[]): number => {
  const n = sortedDesc.length;
  if (!n) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? sortedDesc[mid] : (sortedDesc[mid - 1] + sortedDesc[mid]) / 2;
};

// Maximum-likelihood fit of Lotka's law f(x) = C / x^alpha on the finite support 1..xmax,
// with a Kolmogorov-Smirnov goodness-of-fit test. MLE is used instead of the classical
// least-squares log-log regression because the latter is dominated by the sparse tail
// and is biased (Clauset, Shalizi & Newman, 2009).
export function fitLotka(lotkaMap: Map<number, number>): LotkaFit | null {
  const xs = [...lotkaMap.keys()].sort((a, b) => a - b);
  const n = [...lotkaMap.values()].reduce((a, b) => a + b, 0);
  if (xs.length < 3 || n < 10) return null; // too few distinct productivity levels to fit
  const maxX = xs[xs.length - 1];
  const sumLn = xs.reduce((a, x) => a + lotkaMap.get(x)! * Math.log(x), 0);

  const logLik = (alpha: number) => {
    let z = 0;
    for (let x = 1; x <= maxX; x++) z += x ** -alpha;
    return -alpha * sumLn - n * Math.log(z);
  };

  // Golden-section search; log-likelihood is concave in alpha
  let lo = 0.01;
  let hi = 8;
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);
  for (let i = 0; i < 80; i++) {
    if (logLik(c) > logLik(d)) hi = d;
    else lo = c;
    c = hi - phi * (hi - lo);
    d = lo + phi * (hi - lo);
  }
  const alpha = (lo + hi) / 2;

  let norm = 0;
  for (let x = 1; x <= maxX; x++) norm += x ** -alpha;
  const C = 1 / norm;

  // R^2 of observed vs model log-frequencies (descriptive only)
  const lx = xs.map((x) => Math.log(lotkaMap.get(x)!));
  const lm = xs.map((x) => Math.log(n * C * x ** -alpha));
  const meanL = lx.reduce((a, b) => a + b, 0) / lx.length;
  const ssTot = lx.reduce((a, v) => a + (v - meanL) ** 2, 0);
  const ssRes = lx.reduce((a, v, i) => a + (v - lm[i]) ** 2, 0);
  const r2 = ssTot ? 1 - ssRes / ssTot : 0;

  let cumObs = 0;
  let cumTheo = 0;
  let D = 0;
  for (let x = 1; x <= maxX; x++) {
    cumObs += (lotkaMap.get(x) || 0) / n;
    cumTheo += C * x ** -alpha;
    D = Math.max(D, Math.abs(cumObs - cumTheo));
  }
  const ksCritical = 1.63 / Math.sqrt(n); // alpha = 0.01 (Pao, 1985)
  return {
    alpha: +alpha.toFixed(3),
    C: +C.toFixed(4),
    r2: +r2.toFixed(3),
    ks: +D.toFixed(4),
    ksCritical: +ksCritical.toFixed(4),
    nAuthors: n,
    maxWorks: maxX,
    // Require both a non-significant KS test and a plausible exponent (>= 1): a flat
    // distribution can trivially "fit" an alpha near zero and is not Lotka-like.
    conforms: D <= ksCritical && alpha >= 1,
  };
}

export function computeStudyStats(recs: Publication[]): StudyStats {
  const R = recs;
  const currentYear = new Date().getFullYear();

  // 1. Publication and Citation Timelines
  const yrs = new Map<number, number>();
  const citesYrs = new Map<number, number>();

  const missingYearDocs = R.filter((r) => !r.year).length;
  R.forEach((r) => {
    const y = r.year;
    if (!y) return; // never impute a year: missing years are reported, not counted as "this year"
    yrs.set(y, (yrs.get(y) || 0) + 1);
    citesYrs.set(y, (citesYrs.get(y) || 0) + (r.cites || 0));
  });

  const sortedYears = [...yrs.keys()].sort((a, b) => a - b);
  const minYear = sortedYears[0] || currentYear;
  const maxYear = sortedYears[sortedYears.length - 1] || currentYear;

  // Cumulative timeline
  let cum = 0;
  const cumulativeByYear: Record<string, number> = {};
  sortedYears.forEach((y) => {
    cum += yrs.get(y) || 0;
    cumulativeByYear[String(y)] = cum;
  });

  // Annual Compound Growth Rate (CAGR) via log-linear regression
  const fullYears = sortedYears.filter((y) => y < currentYear);
  const pts = fullYears.map((y) => [y, Math.log(yrs.get(y) || 1)] as [number, number]);
  let annualGrowthPct: number | null = null;
  let doublingTimeYears: number | null = null;
  let growthR2: number | null = null;

  if (pts.length > 2) {
    const n = pts.length;
    const sx = pts.reduce((a, p) => a + p[0], 0);
    const sy = pts.reduce((a, p) => a + p[1], 0);
    const sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
    const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0);
    const denom = n * sxx - sx * sx;
    if (denom !== 0) {
      const slope = (n * sxy - sx * sy) / denom;
      const intercept = (sy - slope * sx) / n;
      const meanY = sy / n;
      const ssTot = pts.reduce((a, p) => a + (p[1] - meanY) ** 2, 0);
      const ssRes = pts.reduce((a, p) => a + (p[1] - (intercept + slope * p[0])) ** 2, 0);
      growthR2 = ssTot ? +(1 - ssRes / ssTot).toFixed(3) : null;
      const rate = Math.exp(slope) - 1;
      annualGrowthPct = +(rate * 100).toFixed(2);
      if (rate > 0) {
        doublingTimeYears = +(Math.log(2) / Math.log(1 + rate)).toFixed(1);
      }
    }
  }

  // 2. Citation Impact & Indices
  const sortedCitations = R.map((r) => r.cites || 0).sort((a, b) => b - a);
  const totalCitations = sortedCitations.reduce((a, b) => a + b, 0);
  const meanCitations = R.length ? +(totalCitations / R.length).toFixed(2) : 0;
  const medianCitations = median(sortedCitations);

  // Hirsch h-index
  let hIndex = 0;
  sortedCitations.forEach((c, idx) => {
    if (c >= idx + 1) hIndex = idx + 1;
  });

  // Egghe g-index: largest g such that top g articles have >= g^2 citations
  let gIndex = 0;
  let cumCites = 0;
  for (let i = 0; i < sortedCitations.length; i++) {
    cumCites += sortedCitations[i];
    if (cumCites >= (i + 1) * (i + 1)) {
      gIndex = i + 1;
    }
  }

  // m-quotient: h-index / span of years
  const activeSpan = Math.max(1, maxYear - minYear + 1);
  const mQuotient = hIndex > 0 ? +(hIndex / activeSpan).toFixed(2) : null;

  // 3. Authorship, Lotka's Law & Collaboration
  const authorMap = new Map<
    string,
    {
      id: string;
      name: string;
      works: number;
      citations: number;
      citationList: number[];
      affiliations: Set<string>;
      countries: Set<string>;
    }
  >();

  let singleAuthorDocs = 0;
  let multiAuthorDocs = 0;
  let totalAuthorsInMulti = 0;
  let sumInvK = 0; // for Collaborative Coefficient

  // Country publication tracking (SCP vs MCP)
  const countryCounts = new Map<
    string,
    { works: number; citations: number; scp: number; mcp: number }
  >();
  let singleCountryPubs = 0;
  let multiCountryPubs = 0;

  // Institution tracking
  const instCounts = new Map<
    string,
    { works: number; citations: number; country: string }
  >();

  R.forEach((r) => {
    const authorsCount = r.authors.length;
    if (authorsCount === 1) {
      singleAuthorDocs++;
      sumInvK += 1;
    } else if (authorsCount > 1) {
      multiAuthorDocs++;
      totalAuthorsInMulti += authorsCount;
      sumInvK += 1 / authorsCount;
    }

    // Authors aggregation
    r.authors.forEach((a) => {
      let entry = authorMap.get(a.k);
      if (!entry) {
        entry = {
          id: a.k,
          name: a.name || 'Anonymous',
          works: 0,
          citations: 0,
          citationList: [],
          affiliations: new Set<string>(),
          countries: new Set<string>(),
        };
        authorMap.set(a.k, entry);
      }
      entry.works++;
      entry.citations += r.cites || 0;
      entry.citationList.push(r.cites || 0);
      if (a.aff) entry.affiliations.add(a.aff);
      if (a.country) entry.countries.add(a.country);

      if (a.aff) {
        let instEntry = instCounts.get(a.aff);
        if (!instEntry) {
          instEntry = { works: 0, citations: 0, country: a.country || '' };
          instCounts.set(a.aff, instEntry);
        }
        instEntry.works++;
        instEntry.citations += r.cites || 0;
        if (!instEntry.country && a.country) instEntry.country = a.country;
      }
    });

    // Country collaboration analysis
    const docCountries = [
      ...new Set(r.authors.map((a) => a.country).filter(Boolean)),
    ];
    if (docCountries.length === 1) {
      singleCountryPubs++;
      const c = docCountries[0];
      let cEntry = countryCounts.get(c);
      if (!cEntry) {
        cEntry = { works: 0, citations: 0, scp: 0, mcp: 0 };
        countryCounts.set(c, cEntry);
      }
      cEntry.works++;
      cEntry.citations += r.cites || 0;
      cEntry.scp++;
    } else if (docCountries.length > 1) {
      multiCountryPubs++;
      docCountries.forEach((c) => {
        let cEntry = countryCounts.get(c);
        if (!cEntry) {
          cEntry = { works: 0, citations: 0, scp: 0, mcp: 0 };
          countryCounts.set(c, cEntry);
        }
        cEntry.works++;
        cEntry.citations += r.cites || 0;
        cEntry.mcp++;
      });
    }
  });

  const totalAuthors = authorMap.size;
  const allAuthorsList = [...authorMap.values()];

  // Collaboration Indices
  const degreeOfCollaboration = R.length
    ? +(multiAuthorDocs / R.length).toFixed(3)
    : 0; // DC (Subramanyam)
  const collaborationIndex = multiAuthorDocs
    ? +(totalAuthorsInMulti / multiAuthorDocs).toFixed(2)
    : 0; // CI
  const collaborationCoefficient = R.length
    ? +(1 - sumInvK / R.length).toFixed(3)
    : 0; // CC (Ajiferuke)
  const totalCountryPubs = singleCountryPubs + multiCountryPubs;
  const internationalCollabPct = totalCountryPubs
    ? +((100 * multiCountryPubs) / totalCountryPubs).toFixed(1)
    : null;
  const mcpRatio = totalCountryPubs
    ? +(multiCountryPubs / totalCountryPubs).toFixed(2)
    : 0;

  // Price's Law of Elite Authors (approx sqrt of total authors)
  const priceEliteCount = Math.ceil(Math.sqrt(totalAuthors));

  // Lotka's Law Distribution
  const lotkaMap = new Map<number, number>();
  allAuthorsList.forEach((a) => {
    lotkaMap.set(a.works, (lotkaMap.get(a.works) || 0) + 1);
  });

  const lotkaFit = fitLotka(lotkaMap);
  const alphaUsed = lotkaFit ? lotkaFit.alpha : 2; // 2 = classical reference when no fit is possible
  const lotkaMaxX = Math.max(1, ...lotkaMap.keys());
  let lotkaNorm = 0;
  for (let x = 1; x <= lotkaMaxX; x++) lotkaNorm += 1 / x ** alphaUsed;
  const theoFor = (k: number) => Math.round((totalAuthors / lotkaNorm) / k ** alphaUsed);

  const lotka: LotkaRow[] = [1, 2, 3, 4].map((k) => ({
    works: k,
    observed: lotkaMap.get(k) || 0,
    theoretical: theoFor(k),
  }));
  let sum5PlusObs = 0;
  let sum5PlusTheo = 0;
  for (let k = 5; k <= lotkaMaxX; k++) {
    sum5PlusObs += lotkaMap.get(k) || 0;
    sum5PlusTheo += theoFor(k);
  }
  lotka.push({ works: '5+', observed: sum5PlusObs, theoretical: sum5PlusTheo });

  // Price's law: do the sqrt(N) most productive authors produce ~50% of the output?
  const byProductivity = allAuthorsList.map((a) => a.works).sort((a, b) => b - a);
  const totalAuthorships = byProductivity.reduce((a, b) => a + b, 0);
  const eliteAuthorships = byProductivity.slice(0, priceEliteCount).reduce((a, b) => a + b, 0);
  const priceShare: PriceShare = {
    eliteAuthors: priceEliteCount,
    eliteAuthorships,
    totalAuthorships,
    sharePct: totalAuthorships ? +((100 * eliteAuthorships) / totalAuthorships).toFixed(1) : 0,
  };

  // Data coverage: how much of the corpus the indicators are actually based on
  const pctOf = (f: (r: Publication) => boolean) =>
    R.length ? +((100 * R.filter(f).length) / R.length).toFixed(1) : 0;
  const coverage: DataCoverage = {
    docs: R.length,
    withYearPct: pctOf((r) => !!r.year),
    withAuthorsPct: pctOf((r) => r.authors.length > 0),
    withAffiliationPct: pctOf((r) => r.authors.some((a) => !!a.aff)),
    withCountryPct: pctOf((r) => r.authors.some((a) => !!a.country)),
    withVenuePct: pctOf((r) => !!r.venue),
    withDoiPct: pctOf((r) => !!r.doi),
    withKeywordsPct: pctOf((r) => (r.keywords || []).length > 0),
    citedPct: pctOf((r) => (r.cites || 0) > 0),
    missingYearDocs,
  };

  // 4. Bradford's Law for Sources (Journals / Venues)
  const sourceMap = new Map<string, { works: number; citations: number }>();
  R.forEach((r) => {
    const v = r.venue || 'Unspecified Venue';
    const s = sourceMap.get(v) || { works: 0, citations: 0 };
    s.works++;
    s.citations += r.cites || 0;
    sourceMap.set(v, s);
  });

  const sortedSources = [...sourceMap.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.works - a.works);

  const thirdDocs = R.length / 3;
  let runningDocs = 0;
  const zone1Sources: string[] = [];
  const zone2Sources: string[] = [];
  const zone3Sources: string[] = [];
  let zone1Docs = 0;
  let zone2Docs = 0;
  let zone3Docs = 0;

  sortedSources.forEach((s) => {
    runningDocs += s.works;
    if (runningDocs <= thirdDocs || zone1Sources.length === 0) {
      zone1Sources.push(s.name);
      zone1Docs += s.works;
    } else if (runningDocs <= thirdDocs * 2 || zone2Sources.length === 0) {
      zone2Sources.push(s.name);
      zone2Docs += s.works;
    } else {
      zone3Sources.push(s.name);
      zone3Docs += s.works;
    }
  });

  const bradfordZones: BradfordZone[] = [
    {
      zone: 1,
      name: 'Zone 1 (Core Nucleus)',
      sourcesCount: zone1Sources.length,
      worksCount: zone1Docs,
      percentage: R.length ? +((100 * zone1Docs) / R.length).toFixed(1) : 0,
      sources: zone1Sources.slice(0, 5),
    },
    {
      zone: 2,
      name: 'Zone 2 (Moderate Yield)',
      sourcesCount: zone2Sources.length,
      worksCount: zone2Docs,
      percentage: R.length ? +((100 * zone2Docs) / R.length).toFixed(1) : 0,
      sources: zone2Sources.slice(0, 5),
    },
    {
      zone: 3,
      name: 'Zone 3 (Peripheral)',
      sourcesCount: zone3Sources.length,
      worksCount: zone3Docs,
      percentage: R.length ? +((100 * zone3Docs) / R.length).toFixed(1) : 0,
      sources: zone3Sources.slice(0, 5),
    },
  ];

  // 5. Author Rankings with local h-index
  const topAuthors: AuthorRanking[] = allAuthorsList
    .map((a) => {
      const cList = a.citationList.slice().sort((x, y) => y - x);
      let localH = 0;
      cList.forEach((c, idx) => {
        if (c >= idx + 1) localH = idx + 1;
      });
      return {
        id: a.id,
        name: a.name,
        works: a.works,
        citations: a.citations,
        hIndex: localH,
        institution: [...a.affiliations][0] || '—',
        country: [...a.countries][0] || '—',
      };
    })
    .sort((a, b) => b.works - a.works || b.citations - a.citations)
    .slice(0, 20);

  // 6. Source Rankings
  const topSources: SourceRanking[] = sortedSources.slice(0, 15).map((s) => ({
    name: s.name,
    works: s.works,
    citations: s.citations,
    bradfordZone: zone1Sources.includes(s.name)
      ? 1
      : zone2Sources.includes(s.name)
      ? 2
      : 3,
  }));

  // 7. Country Rankings
  const topCountries: CountryRanking[] = [...countryCounts.entries()]
    .map(([country, data]) => ({
      country,
      works: data.works,
      citations: data.citations,
      scp: data.scp,
      mcp: data.mcp,
      mcpRatio: data.works ? +(data.mcp / data.works).toFixed(2) : 0,
    }))
    .sort((a, b) => b.works - a.works)
    .slice(0, 15);

  // 8. Institution Rankings
  const topInstitutions: InstitutionRanking[] = [...instCounts.entries()]
    .map(([name, data]) => ({
      name,
      country: data.country || '—',
      works: data.works,
      citations: data.citations,
    }))
    .sort((a, b) => b.works - a.works)
    .slice(0, 15);

  // 9. Keywords & Subject Taxonomy
  const kwMap = new Map<string, number>();
  R.forEach((r) => {
    // Both Wikidata P921 keywords and clean title words
    const subjects = r.keywords || [];
    subjects.forEach((k) => {
      if (k) kwMap.set(k, (kwMap.get(k) || 0) + 1);
    });
    cleanText(r.title).forEach((w) => {
      kwMap.set(w, (kwMap.get(w) || 0) + 1);
    });
  });

  const topKeywords: KeywordRanking[] = [...kwMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([keyword, count]) => ({
      keyword,
      count,
      percentage: R.length ? +((100 * count) / R.length).toFixed(1) : 0,
    }));

  // Title bigrams
  const topBigrams = topN(
    R.flatMap((r) => {
      const wds = cleanText(r.title);
      return [...new Set(wds.slice(1).map((x, i) => wds[i] + ' ' + x))];
    }),
    12
  );

  // Citation bins
  const citationBins: [string, number][] = [
    '0',
    '1–4',
    '5–9',
    '10–24',
    '25–49',
    '50–99',
    '100+',
  ].map((b) => [b, R.filter((r) => binCitation(r.cites || 0) === b).length]);

  // Seminal / Top cited publications
  const topCited: [string, number, number, string][] = R.slice()
    .sort((a, b) => b.cites - a.cites)
    .slice(0, 10)
    .map((r) => [r.title, r.year, r.cites, r.doi || '']);

  // Origins
  const origins = Object.fromEntries(topN(R.map((r) => r.origin), 5));

  // 10. Interactive Scientometric Networks Construction
  // A. Co-authorship Network
  const coauthorshipNetwork = buildCoauthorshipNetwork(R, topAuthors);

  // B. Keyword Co-occurrence Network
  const keywordNetwork = buildKeywordNetwork(R, topKeywords);

  // C. Country Collaboration Network
  const countryNetwork = buildCountryNetwork(R, topCountries);

  // D. Institution Collaboration Network
  const institutionNetwork = buildInstitutionNetwork(R, topInstitutions);

  return {
    docs: R.length,
    span: [minYear, maxYear],
    byYear: Object.fromEntries(sortedYears.map((y) => [String(y), yrs.get(y) || 0])),
    citesByYear: Object.fromEntries(
      sortedYears.map((y) => [String(y), citesYrs.get(y) || 0])
    ),
    cumulativeByYear,
    annualGrowthPct,
    doublingTimeYears,
    growthR2,
    growthYearsUsed: pts.length,
    excludedMissingYear: missingYearDocs,
    totalCitations,
    meanCitations,
    medianCitations,
    hIndex,
    gIndex,
    mQuotient,
    authors: totalAuthors,
    docsPerAuthor: totalAuthors
      ? +(R.reduce((a, r) => a + r.authors.length, 0) / Math.max(1, totalAuthors)).toFixed(2)
      : 0,
    authorsPerDoc: R.length
      ? +(R.reduce((a, r) => a + r.authors.length, 0) / R.length).toFixed(2)
      : 0,
    singleAuthorPct: R.length
      ? +((100 * singleAuthorDocs) / R.length).toFixed(1)
      : 0,
    priceEliteCount,
    lotka,
    lotkaExponent: alphaUsed,
    lotkaFit,
    priceShare,
    coverage,
    degreeOfCollaboration,
    collaborationIndex,
    collaborationCoefficient,
    internationalCollabPct,
    singleCountryPubs,
    multiCountryPubs,
    mcpRatio,
    bradfordZones,
    topAuthors,
    topSources,
    topCountries,
    topInstitutions,
    topKeywords,
    topBigrams,
    citationBins,
    topCited,
    origins,
    coauthorshipNetwork,
    keywordNetwork,
    countryNetwork,
    institutionNetwork,
  };
}

// --- Network Builders ---

function buildCoauthorshipNetwork(
  recs: Publication[],
  topAuths: AuthorRanking[]
): ScientometricNetwork {
  const eligibleIds = new Set(topAuths.slice(0, 25).map((a) => a.id));
  const nodeMap = new Map<string, NetworkNode>();
  const edgeMap = new Map<string, number>();

  topAuths.slice(0, 25).forEach((a) => {
    nodeMap.set(a.id, {
      id: a.id,
      name: a.name,
      type: 'author',
      weight: a.works,
      secondary: a.institution !== '—' ? a.institution : a.country,
    });
  });

  recs.forEach((r) => {
    const present = r.authors.filter((a) => eligibleIds.has(a.k));
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const u = present[i].k;
        const v = present[j].k;
        const key = u < v ? `${u}__${v}` : `${v}__${u}`;
        edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
      }
    }
  });

  const edges: NetworkEdge[] = [...edgeMap.entries()].map(([k, weight]) => {
    const [source, target] = k.split('__');
    return { source, target, weight };
  });

  return { nodes: [...nodeMap.values()], edges };
}

function buildKeywordNetwork(
  recs: Publication[],
  topKw: KeywordRanking[]
): ScientometricNetwork {
  const eligibleKw = new Set(topKw.slice(0, 20).map((k) => k.keyword.toLowerCase()));
  const nodeMap = new Map<string, NetworkNode>();
  const edgeMap = new Map<string, number>();

  topKw.slice(0, 20).forEach((k) => {
    const key = k.keyword.toLowerCase();
    nodeMap.set(key, {
      id: key,
      name: k.keyword,
      type: 'keyword',
      weight: k.count,
    });
  });

  recs.forEach((r) => {
    const docTerms = [
      ...(r.keywords || []),
      ...cleanText(r.title),
    ]
      .map((w) => w.toLowerCase())
      .filter((w) => eligibleKw.has(w));

    const unique = [...new Set(docTerms)];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const u = unique[i];
        const v = unique[j];
        const key = u < v ? `${u}__${v}` : `${v}__${u}`;
        edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
      }
    }
  });

  const edges: NetworkEdge[] = [...edgeMap.entries()]
    .filter(([_, w]) => w >= 1)
    .map(([k, weight]) => {
      const [source, target] = k.split('__');
      return { source, target, weight };
    });

  return { nodes: [...nodeMap.values()], edges };
}

function buildCountryNetwork(
  recs: Publication[],
  topC: CountryRanking[]
): ScientometricNetwork {
  const eligibleCountries = new Set(topC.slice(0, 18).map((c) => c.country));
  const nodeMap = new Map<string, NetworkNode>();
  const edgeMap = new Map<string, number>();

  topC.slice(0, 18).forEach((c) => {
    nodeMap.set(c.country, {
      id: c.country,
      name: c.country,
      type: 'country',
      weight: c.works,
      secondary: `${c.mcpRatio * 100}% intl`,
    });
  });

  recs.forEach((r) => {
    const docCountries = [
      ...new Set(
        r.authors
          .map((a) => a.country)
          .filter((c) => c && eligibleCountries.has(c))
      ),
    ];

    for (let i = 0; i < docCountries.length; i++) {
      for (let j = i + 1; j < docCountries.length; j++) {
        const u = docCountries[i];
        const v = docCountries[j];
        const key = u < v ? `${u}__${v}` : `${v}__${u}`;
        edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
      }
    }
  });

  const edges: NetworkEdge[] = [...edgeMap.entries()].map(([k, weight]) => {
    const [source, target] = k.split('__');
    return { source, target, weight };
  });

  return { nodes: [...nodeMap.values()], edges };
}

function buildInstitutionNetwork(
  recs: Publication[],
  topInst: InstitutionRanking[]
): ScientometricNetwork {
  const eligibleInst = new Set(topInst.slice(0, 18).map((inst) => inst.name));
  const nodeMap = new Map<string, NetworkNode>();
  const edgeMap = new Map<string, number>();

  topInst.slice(0, 18).forEach((inst) => {
    nodeMap.set(inst.name, {
      id: inst.name,
      name: inst.name,
      type: 'institution',
      weight: inst.works,
      secondary: inst.country,
    });
  });

  recs.forEach((r) => {
    const docInsts = [
      ...new Set(
        r.authors
          .map((a) => a.aff)
          .filter((aff) => aff && eligibleInst.has(aff))
      ),
    ];

    for (let i = 0; i < docInsts.length; i++) {
      for (let j = i + 1; j < docInsts.length; j++) {
        const u = docInsts[i];
        const v = docInsts[j];
        const key = u < v ? `${u}__${v}` : `${v}__${u}`;
        edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
      }
    }
  });

  const edges: NetworkEdge[] = [...edgeMap.entries()].map(([k, weight]) => {
    const [source, target] = k.split('__');
    return { source, target, weight };
  });

  return { nodes: [...nodeMap.values()], edges };
}

export const generateMarkdownTables = (s: StudyStats): string => {
  const tb = (h: string[], rows: (string | number)[][]) =>
    `| ${h.join(' | ')} |\n|${h.map(() => '---').join('|')}|\n${rows
      .map((r) => `| ${r.join(' | ')} |`)
      .join('\n')}\n\n`;

  return (
    `**Table 1.** Main Bibliometric & Scientometric Indicators\n\n` +
    tb(
      ['Indicator', 'Value'],
      [
        ['Total Publications', s.docs],
        ['Period', s.span.join('–')],
        ['Annual Growth Rate (CAGR %)', s.annualGrowthPct ?? 'n/a'],
        ['Doubling Time (years)', s.doublingTimeYears ?? 'n/a'],
        ['Total Citations', s.totalCitations],
        ['Mean Citations per Work', s.meanCitations],
        ['Median Citations', s.medianCitations],
        ['Hirsch h-index', s.hIndex],
        ['Egghe g-index', s.gIndex],
        ['m-quotient (h / years)', s.mQuotient ?? 'n/a'],
        ['Unique Authors', s.authors],
        ['Authors per Work', s.authorsPerDoc],
        ['Single-authored Works (%)', s.singleAuthorPct],
        ['Degree of Collaboration (DC)', s.degreeOfCollaboration],
        ['Collaboration Index (CI)', s.collaborationIndex],
        ['Collaborative Coefficient (CC)', s.collaborationCoefficient],
        ['International Collaboration (%)', s.internationalCollabPct ?? 'n/a'],
        ['MCP Ratio', s.mcpRatio],
      ]
    ) +
    `**Table 2.** Temporal Evolution (Works and Citations per Year)\n\n` +
    tb(
      ['Year', 'Works', 'Cumulative Works', 'Citations Received'],
      Object.entries(s.byYear).map(([y, w]) => [
        y,
        w,
        s.cumulativeByYear[y] || w,
        s.citesByYear[y] || 0,
      ])
    ) +
    `**Table 3.** Lotka's Law of Author Productivity\n\n` +
    tb(
      ['Works (x)', 'Observed Authors', 'Theoretical (Lotka)'],
      s.lotka.map((row) => [row.works, row.observed, row.theoretical])
    ) +
    `**Table 4.** Bradford's Law of Source Scattering\n\n` +
    tb(
      ['Bradford Zone', 'Number of Sources', 'Total Works', 'Share (%)', 'Key Sources'],
      s.bradfordZones.map((z) => [
        z.name,
        z.sourcesCount,
        z.worksCount,
        `${z.percentage}%`,
        z.sources.join('; '),
      ])
    ) +
    `**Table 5.** Top Productive & Influential Authors\n\n` +
    tb(
      ['Author', 'Works', 'Citations', 'h-index', 'Institution', 'Country'],
      s.topAuthors
        .slice(0, 12)
        .map((a) => [a.name, a.works, a.citations, a.hIndex, a.institution, a.country])
    ) +
    `**Table 6.** Leading Publication Venues (Sources)\n\n` +
    tb(
      ['Source Title', 'Works', 'Citations', 'Bradford Zone'],
      s.topSources.map((src) => [src.name, src.works, src.citations, `Zone ${src.bradfordZone}`])
    ) +
    `**Table 7.** Country Scientific Productivity & International Collaboration\n\n` +
    tb(
      ['Country', 'Total Works', 'Citations', 'SCP', 'MCP', 'MCP Ratio'],
      s.topCountries.map((c) => [c.country, c.works, c.citations, c.scp, c.mcp, c.mcpRatio])
    ) +
    `**Table 8.** Leading Academic Institutions\n\n` +
    tb(
      ['Institution', 'Country', 'Works', 'Citations'],
      s.topInstitutions.map((i) => [i.name, i.country, i.works, i.citations])
    ) +
    `**Table 9.** Thematic Keywords & Subject Topics\n\n` +
    tb(
      ['Keyword / Concept', 'Frequency', 'Prevalence (%)'],
      s.topKeywords.slice(0, 15).map((k) => [k.keyword, k.count, `${k.percentage}%`])
    ) +
    `**Table 10.** Citation Distribution Spectrum\n\n` +
    tb(['Citation Range', 'Number of Publications'], s.citationBins) +
    `**Table 11.** Seminal & Most Cited Publications\n\n` +
    tb(
      ['Title', 'Year', 'Citations', 'DOI'],
      s.topCited.map(([title, year, cites, doi]) => [
        title,
        year,
        cites,
        doi ? `https://doi.org/${doi}` : '—',
      ])
    ) +
    `**Table 12.** Scientometric Network Topologies & Structural Properties\n\n` +
    tb(
      ['Network Type', 'Nodes (N)', 'Edges (E)', 'Average Degree', 'Network Density', 'Leading Central Hubs'],
      [
        [
          'Co-authorship Collaboration',
          s.coauthorshipNetwork.nodes.length,
          s.coauthorshipNetwork.edges.length,
          s.coauthorshipNetwork.nodes.length
            ? +((2 * s.coauthorshipNetwork.edges.length) / s.coauthorshipNetwork.nodes.length).toFixed(2)
            : 0,
          s.coauthorshipNetwork.nodes.length > 1
            ? +(
                (2 * s.coauthorshipNetwork.edges.length) /
                (s.coauthorshipNetwork.nodes.length * (s.coauthorshipNetwork.nodes.length - 1))
              ).toFixed(3)
            : 0,
          s.topAuthors.slice(0, 3).map((a) => a.name).join('; ') || '—',
        ],
        [
          'Thematic Keyword Co-occurrence',
          s.keywordNetwork.nodes.length,
          s.keywordNetwork.edges.length,
          s.keywordNetwork.nodes.length
            ? +((2 * s.keywordNetwork.edges.length) / s.keywordNetwork.nodes.length).toFixed(2)
            : 0,
          s.keywordNetwork.nodes.length > 1
            ? +(
                (2 * s.keywordNetwork.edges.length) /
                (s.keywordNetwork.nodes.length * (s.keywordNetwork.nodes.length - 1))
              ).toFixed(3)
            : 0,
          s.topKeywords.slice(0, 3).map((k) => k.keyword).join('; ') || '—',
        ],
        [
          'Cross-National Collaboration',
          s.countryNetwork.nodes.length,
          s.countryNetwork.edges.length,
          s.countryNetwork.nodes.length
            ? +((2 * s.countryNetwork.edges.length) / s.countryNetwork.nodes.length).toFixed(2)
            : 0,
          s.countryNetwork.nodes.length > 1
            ? +(
                (2 * s.countryNetwork.edges.length) /
                (s.countryNetwork.nodes.length * (s.countryNetwork.nodes.length - 1))
              ).toFixed(3)
            : 0,
          s.topCountries.slice(0, 3).map((c) => c.country).join('; ') || '—',
        ],
        [
          'Inter-Institutional Partnerships',
          s.institutionNetwork.nodes.length,
          s.institutionNetwork.edges.length,
          s.institutionNetwork.nodes.length
            ? +((2 * s.institutionNetwork.edges.length) / s.institutionNetwork.nodes.length).toFixed(2)
            : 0,
          s.institutionNetwork.nodes.length > 1
            ? +(
                (2 * s.institutionNetwork.edges.length) /
                (s.institutionNetwork.nodes.length * (s.institutionNetwork.nodes.length - 1))
              ).toFixed(3)
            : 0,
          s.topInstitutions.slice(0, 3).map((i) => i.name).join('; ') || '—',
        ],
      ]
    ) +
    `**Table 13.** Strongest Co-authorship Collaborative Ties (Dyads)\n\n` +
    (() => {
      const authorNameMap = new Map(s.coauthorshipNetwork.nodes.map((n) => [n.id, n.name]));
      const sortedAuthorEdges = s.coauthorshipNetwork.edges
        .slice()
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 8);
      return tb(
        ['Author 1', 'Author 2', 'Co-authored Publications', 'Tie Strength'],
        sortedAuthorEdges.length
          ? sortedAuthorEdges.map((e) => [
              authorNameMap.get(e.source) || e.source,
              authorNameMap.get(e.target) || e.target,
              e.weight,
              e.weight > 2 ? 'Strong' : 'Moderate',
            ])
          : [['(No co-authorship links meeting threshold)', '—', '—', '—']]
      );
    })() +
    `**Table 14.** High-Frequency Thematic Keyword Co-occurrences\n\n` +
    (() => {
      const sortedKwEdges = s.keywordNetwork.edges
        .slice()
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 8);
      return tb(
        ['Concept / Keyword A', 'Concept / Keyword B', 'Co-occurrence Frequency', 'Thematic Association'],
        sortedKwEdges.length
          ? sortedKwEdges.map((e) => [
              e.source,
              e.target,
              e.weight,
              'Core Thematic Cluster',
            ])
          : [['(No keyword co-occurrences meeting threshold)', '—', '—', '—']]
      );
    })() +
    `**Table 15.** Bilateral Cross-National Research Collaboration Axes\n\n` +
    (() => {
      const sortedCountryEdges = s.countryNetwork.edges
        .slice()
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 8);
      return tb(
        ['Country A', 'Country B', 'Joint Publications', 'Collaboration Status'],
        sortedCountryEdges.length
          ? sortedCountryEdges.map((e) => [
              e.source,
              e.target,
              e.weight,
              'Bilateral International Axis',
            ])
          : [['(No cross-national links recorded)', '—', '—', '—']]
      );
    })() +
    `**Table 16.** Leading Inter-Institutional Academic Partnerships\n\n` +
    (() => {
      const sortedInstEdges = s.institutionNetwork.edges
        .slice()
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 8);
      return tb(
        ['Institution A', 'Institution B', 'Joint Publications', 'Partnership Level'],
        sortedInstEdges.length
          ? sortedInstEdges.map((e) => [
              e.source,
              e.target,
              e.weight,
              'Inter-organizational Alliance',
            ])
          : [['(No inter-institutional links recorded)', '—', '—', '—']]
      );
    })()
  );
};
