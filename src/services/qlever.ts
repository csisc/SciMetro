import { Publication, Author } from '../types';
import { countryOf } from './stats';

export const DEFAULT_QLEVER_ENDPOINT = 'https://qlever.cs.uni-freiburg.de/api/wikidata';

const PREFIXES = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

const E = encodeURIComponent;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const chunk = <T>(a: T[], n: number): T[][] => {
  const r: T[][] = [];
  for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n));
  return r;
};

const lit = (x: string) =>
  '"' +
  x
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ') +
  '"';

export const parseQueryGroups = (t: string): string[][] =>
  t
    .split('\n')
    .map((l) =>
      l
        .split('|')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
    )
    .filter((g) => g.length > 0);

const filterOf = (g: string[][]) =>
  g
    .map(
      (a) =>
        '(' +
        a.map((t) => `CONTAINS(LCASE(STR(?title)),${lit(t)})`).join(' || ') +
        ')'
    )
    .join(' && ');

export async function executeQLeverOnce(
  sparqlQuery: string,
  endpoint = DEFAULT_QLEVER_ENDPOINT
): Promise<Record<string, string>[]> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 90000);
  const H = { Accept: 'application/sparql-results+json' };
  const fullQuery = PREFIXES + sparqlQuery;

  try {
    const res = await fetch(endpoint + '?query=' + E(fullQuery), {
      headers: H,
      signal: ctl.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    return (data.results?.bindings || []).map((b: Record<string, { value: string }>) =>
      Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value]))
    );
  } finally {
    clearTimeout(t);
  }
}

export async function executeQLever(
  sparqlQuery: string,
  endpoint = DEFAULT_QLEVER_ENDPOINT
): Promise<Record<string, string>[]> {
  let lastError: any;
  for (let i = 0; i < 3; i++) {
    try {
      const rows = await executeQLeverOnce(sparqlQuery, endpoint);
      await sleep(350); // Respectful throttle
      return rows;
    } catch (e: any) {
      lastError = e;
      if (e.message && /HTTP 429/.test(e.message)) {
        // Rate limited by QLever nginx: exponential backoff
        await sleep(2500 * (i + 1));
        continue;
      }
      if (!(e instanceof TypeError) && e.name !== 'AbortError') {
        if (e.message && /HTTP 4\d\d/.test(e.message)) break;
      }
      await sleep(1500 * (i + 1));
    }
  }

  const isTimeout = lastError?.name === 'AbortError';
  throw new Error(
    `Wikidata QLever: ${
      isTimeout ? 'Query timed out after 90 s.' : lastError?.message || 'Request failed'
    }`
  );
}

const getQid = (uri: string): string => {
  const m = uri.match(/Q\d+$/);
  return m ? m[0] : uri;
};

export async function searchWikidataWorks(
  conceptId: string,
  relatedConceptIds: string[],
  queryText: string,
  maxResults: number,
  endpoint = DEFAULT_QLEVER_ENDPOINT,
  log: (msg: string) => void
): Promise<Publication[]> {
  log(`Querying Wikidata QLever for concept ${conceptId} and related ontology items…`);

  const groups = parseQueryGroups(queryText);
  const titleFilter = groups.length ? `FILTER(${filterOf(groups)})` : '';

  // Include target concept + top related ontology concept IDs (subclasses, instances, parts)
  const allConceptIds = [conceptId, ...relatedConceptIds.slice(0, 15)];
  const conceptValues = allConceptIds.map((id) => `wd:${id}`).join(' ');

  const sparql = `
SELECT ?work ?title ?year ?venueLabel ?doi (COUNT(?citing) AS ?cites) WHERE {
  VALUES ?concept { ${conceptValues} }
  ?work wdt:P921 ?concept .
  OPTIONAL { ?work wdt:P1476 ?title }
  OPTIONAL { ?work wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
  OPTIONAL { ?work wdt:P1433 ?venue . ?venue rdfs:label ?venueLabel . FILTER(LANG(?venueLabel) = 'en') }
  OPTIONAL { ?work wdt:P356 ?doi }
  OPTIONAL { ?citing wdt:P2860 ?work }
  ${titleFilter}
}
GROUP BY ?work ?title ?year ?venueLabel ?doi
ORDER BY DESC(?cites)
LIMIT ${maxResults}
`;

  let rows: Record<string, string>[] = [];
  try {
    rows = await executeQLever(sparql, endpoint);
    log(`Wikidata QLever: found ${rows.length} relevant publications by concept topic`);
  } catch (err: any) {
    log(`Concept query notice: ${err.message}. Trying direct topic search…`);
    const directSparql = `
SELECT ?work ?title ?year ?venueLabel ?doi (COUNT(?citing) AS ?cites) WHERE {
  ?work wdt:P921 wd:${conceptId} .
  OPTIONAL { ?work wdt:P1476 ?title }
  OPTIONAL { ?work wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
  OPTIONAL { ?work wdt:P1433 ?venue . ?venue rdfs:label ?venueLabel . FILTER(LANG(?venueLabel) = 'en') }
  OPTIONAL { ?work wdt:P356 ?doi }
  OPTIONAL { ?citing wdt:P2860 ?work }
}
GROUP BY ?work ?title ?year ?venueLabel ?doi
ORDER BY DESC(?cites)
LIMIT ${maxResults}
`;
    rows = await executeQLever(directSparql, endpoint);
    log(`Direct concept search retrieved ${rows.length} publications`);
  }

  // Fallback if main subject returns fewer than 5 items: try title text search across scholarly articles
  let candidateRows = rows;
  if (rows.length < 5 && groups.length > 0) {
    log('Broadening search to title text matches in scholarly literature on QLever…');
    const fallbackSparql = `
SELECT ?work ?title ?year ?venueLabel ?doi (COUNT(?citing) AS ?cites) WHERE {
  ?work wdt:P31 wd:Q13442814 ;
        wdt:P1476 ?title .
  OPTIONAL { ?work wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
  OPTIONAL { ?work wdt:P1433 ?venue . ?venue rdfs:label ?venueLabel . FILTER(LANG(?venueLabel) = 'en') }
  OPTIONAL { ?work wdt:P356 ?doi }
  OPTIONAL { ?citing wdt:P2860 ?work }
  FILTER(${filterOf(groups)})
}
GROUP BY ?work ?title ?year ?venueLabel ?doi
ORDER BY DESC(?cites)
LIMIT ${maxResults}
`;
    try {
      const fbRows = await executeQLever(fallbackSparql, endpoint);
      if (fbRows.length > rows.length) {
        candidateRows = fbRows;
        log(`Title text scan yielded ${fbRows.length} publications`);
      }
    } catch (e: any) {
      log(`Text search fallback note: ${e.message}`);
    }
  }

  // Deduplicate by work ID
  const map = new Map<string, Publication>();
  candidateRows.forEach((r) => {
    if (!r.work) return;
    const workUri = r.work;
    const qid = getQid(workUri);
    if (!map.has(workUri)) {
      map.set(workUri, {
        id: workUri,
        title: (r.title || qid).replace(/\.$/, ''),
        year: parseInt(r.year, 10) || 0,
        venue: r.venueLabel || '',
        doi: (r.doi || '').replace('https://doi.org/', ''),
        omid: qid,
        cites: parseInt(r.cites, 10) || 0,
        nrefs: 0,
        authors: [],
        keywords: [],
        origin: 'search',
      });
    }
  });

  const publications = [...map.values()];
  await enrichMetadata(publications, endpoint, log);
  return publications;
}

export async function enrichMetadata(
  recs: Publication[],
  endpoint = DEFAULT_QLEVER_ENDPOINT,
  log: (msg: string) => void
): Promise<void> {
  if (!recs.length) return;
  const byWork = new Map(recs.map((r) => [r.id, r]));

  log(`Enriching authors and affiliations for ${recs.length} works from Wikidata…`);

  // Enrich in lightweight batches of 20 works to completely avoid QLever 429 timeouts
  for (const batch of chunk(recs, 20)) {
    const workValues = batch.map((r) => `<${r.id}>`).join(' ');

    // 1. Authors & Institutional affiliation query (flat, indexed, sub-second execution)
    const authorsSparql = `
SELECT ?work ?author ?authorName ?instLabel ?countryLabel WHERE {
  VALUES ?work { ${workValues} }
  ?work wdt:P50 ?author .
  ?author rdfs:label ?authorName .
  FILTER(LANG(?authorName) = 'en')
  OPTIONAL {
    ?author wdt:P108 ?inst .
    ?inst rdfs:label ?instLabel .
    FILTER(LANG(?instLabel) = 'en')
    OPTIONAL {
      ?inst wdt:P17 ?ctry .
      ?ctry rdfs:label ?countryLabel .
      FILTER(LANG(?countryLabel) = 'en')
    }
  }
}
LIMIT 400
`;

    try {
      const rows = await executeQLever(authorsSparql, endpoint);
      rows.forEach((row) => {
        const pub = byWork.get(row.work);
        if (!pub || !row.author) return;
        const authorUri = row.author;
        const aff = row.instLabel || '';
        const country = row.countryLabel || countryOf(aff);

        let author = pub.authors.find((a) => a.k === authorUri);
        if (!author) {
          author = {
            k: authorUri,
            name: row.authorName || getQid(authorUri),
            aff,
            country,
          };
          pub.authors.push(author);
        } else {
          if (!author.aff && aff) author.aff = aff;
          if (!author.country && country) author.country = country;
        }
      });
    } catch (e: any) {
      log(`Author enrichment notice: ${e.message.slice(0, 100)}`);
    }

    // Small delay between batches to respect rate limits
    await sleep(250);

    // 2. Subject Keywords (P921)
    const topicsSparql = `
SELECT ?work ?topicLabel WHERE {
  VALUES ?work { ${workValues} }
  ?work wdt:P921 ?topic .
  ?topic rdfs:label ?topicLabel .
  FILTER(LANG(?topicLabel) = 'en')
}
LIMIT 300
`;

    try {
      const topicRows = await executeQLever(topicsSparql, endpoint);
      topicRows.forEach((row) => {
        const pub = byWork.get(row.work);
        if (pub && row.topicLabel && !pub.keywords.includes(row.topicLabel)) {
          pub.keywords.push(row.topicLabel);
        }
      });
    } catch (e: any) {
      // Non-fatal
    }

    await sleep(200);
  }

  log(`Enrichment complete for ${recs.length} works.`);
}

export async function snowballWikidataWorks(
  recs: Publication[],
  endpoint = DEFAULT_QLEVER_ENDPOINT,
  log: (msg: string) => void
): Promise<Publication[]> {
  const seeds = recs.slice().sort((a, b) => b.cites - a.cites).slice(0, 20);
  if (!seeds.length) return [];

  log(`Snowballing citation network across ${seeds.length} seminal seed works…`);
  const known = new Set(recs.map((r) => r.id));
  const seedValues = seeds.map((s) => `<${s.id}>`).join(' ');

  const snowballSparql = `
SELECT ?work ?title ?year ?venueLabel ?doi (COUNT(?citing) AS ?cites) WHERE {
  {
    VALUES ?seed { ${seedValues} }
    ?work wdt:P2860 ?seed .
  }
  UNION
  {
    VALUES ?seed { ${seedValues} }
    ?seed wdt:P2860 ?work .
  }
  ?work wdt:P1476 ?title .
  OPTIONAL { ?work wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
  OPTIONAL { ?work wdt:P1433 ?venue . ?venue rdfs:label ?venueLabel . FILTER(LANG(?venueLabel) = 'en') }
  OPTIONAL { ?work wdt:P356 ?doi }
  OPTIONAL { ?citing wdt:P2860 ?work }
}
GROUP BY ?work ?title ?year ?venueLabel ?doi
ORDER BY DESC(?cites)
LIMIT 50
`;

  const newWorks: Publication[] = [];
  try {
    const rows = await executeQLever(snowballSparql, endpoint);
    rows.forEach((r) => {
      if (!r.work || known.has(r.work)) return;
      known.add(r.work);
      newWorks.push({
        id: r.work,
        title: (r.title || getQid(r.work)).replace(/\.$/, ''),
        year: parseInt(r.year, 10) || 0,
        venue: r.venueLabel || '',
        doi: (r.doi || '').replace('https://doi.org/', ''),
        omid: getQid(r.work),
        cites: parseInt(r.cites, 10) || 0,
        authors: [],
        keywords: [],
        origin: 'citing',
      });
    });

    log(`Snowballing added ${newWorks.length} high-impact citations and references.`);
    if (newWorks.length > 0) {
      await enrichMetadata(newWorks, endpoint, log);
    }
  } catch (e: any) {
    log(`Snowballing notice: ${e.message}`);
  }

  return newWorks;
}

export async function findPriorStudiesWikidata(
  conceptId: string,
  conceptLabel: string,
  relatedConceptIds: string[] = [],
  endpoint = DEFAULT_QLEVER_ENDPOINT,
  log: (msg: string) => void
): Promise<Publication[]> {
  log(`Conducting deep literature review & prior survey search for "${conceptLabel}" on Wikidata QLever…`);

  // Target concept + related ontology concepts (subclasses, instances, parts)
  const allConceptIds = [conceptId, ...relatedConceptIds.slice(0, 18)];
  const conceptValues = allConceptIds.map((id) => `wd:${id}`).join(' ');

  // Multi-class review article SPARQL (review article, systematic review, meta-analysis)
  const sparql = `
SELECT ?work ?title ?year ?venueLabel ?doi (COUNT(?citing) AS ?cites) WHERE {
  {
    VALUES ?concept { ${conceptValues} }
    ?work wdt:P921 ?concept ;
          wdt:P1476 ?title .
    FILTER(
      CONTAINS(LCASE(STR(?title)), "review") ||
      CONTAINS(LCASE(STR(?title)), "survey") ||
      CONTAINS(LCASE(STR(?title)), "overview") ||
      CONTAINS(LCASE(STR(?title)), "bibliometric") ||
      CONTAINS(LCASE(STR(?title)), "scientometric") ||
      CONTAINS(LCASE(STR(?title)), "citation") ||
      CONTAINS(LCASE(STR(?title)), "trends") ||
      CONTAINS(LCASE(STR(?title)), "mapping") ||
      CONTAINS(LCASE(STR(?title)), "meta-analysis") ||
      CONTAINS(LCASE(STR(?title)), "systematic") ||
      CONTAINS(LCASE(STR(?title)), "scoping") ||
      CONTAINS(LCASE(STR(?title)), "state of the art") ||
      CONTAINS(LCASE(STR(?title)), "taxonomy") ||
      CONTAINS(LCASE(STR(?title)), "synthesis") ||
      CONTAINS(LCASE(STR(?title)), "analysis")
    )
  }
  UNION
  {
    VALUES ?concept { ${conceptValues} }
    VALUES ?reviewClass { wd:Q732577 wd:Q107412702 wd:Q11761 wd:Q15706434 wd:Q3010827 }
    ?work wdt:P921 ?concept ;
          wdt:P31 ?reviewClass ;
          wdt:P1476 ?title .
  }
  OPTIONAL { ?work wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
  OPTIONAL { ?work wdt:P1433 ?venue . ?venue rdfs:label ?venueLabel . FILTER(LANG(?venueLabel) = 'en') }
  OPTIONAL { ?work wdt:P356 ?doi }
  OPTIONAL { ?citing wdt:P2860 ?work }
}
GROUP BY ?work ?title ?year ?venueLabel ?doi
ORDER BY DESC(?cites)
LIMIT 30
`;

  let rows: Record<string, string>[] = [];
  try {
    rows = await executeQLever(sparql, endpoint);
  } catch (e: any) {
    log(`Prior studies query notice: ${e.message}`);
  }

  // Fallback 1: Broad title scan across scholarly articles
  if (rows.length < 6) {
    const cleanLabel = conceptLabel.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (cleanLabel.length >= 3) {
      log(`Broadening search across title keywords for "${cleanLabel}"…`);
      const fallbackSparql = `
SELECT ?work ?title ?year ?venueLabel ?doi (COUNT(?citing) AS ?cites) WHERE {
  ?work wdt:P31 wd:Q13442814 ;
        wdt:P1476 ?title .
  OPTIONAL { ?work wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
  OPTIONAL { ?work wdt:P1433 ?venue . ?venue rdfs:label ?venueLabel . FILTER(LANG(?venueLabel) = 'en') }
  OPTIONAL { ?work wdt:P356 ?doi }
  OPTIONAL { ?citing wdt:P2860 ?work }
  FILTER(
    CONTAINS(LCASE(STR(?title)), "${cleanLabel}") &&
    (
      CONTAINS(LCASE(STR(?title)), "review") ||
      CONTAINS(LCASE(STR(?title)), "survey") ||
      CONTAINS(LCASE(STR(?title)), "bibliometric") ||
      CONTAINS(LCASE(STR(?title)), "scientometric") ||
      CONTAINS(LCASE(STR(?title)), "trends") ||
      CONTAINS(LCASE(STR(?title)), "systematic") ||
      CONTAINS(LCASE(STR(?title)), "analysis")
    )
  )
}
GROUP BY ?work ?title ?year ?venueLabel ?doi
ORDER BY DESC(?cites)
LIMIT 20
`;
      try {
        const fbRows = await executeQLever(fallbackSparql, endpoint);
        rows = [...rows, ...fbRows];
      } catch (err: any) {
        log(`Title review fallback note: ${err.message}`);
      }
    }
  }

  // Deduplicate by work ID and title
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const uniquePrior: Publication[] = [];

  // Title-keyword classification ONLY. The tool never reads these papers, so it makes no
  // claim about their scope, methods, findings or gaps (those fields stay undefined).
  const classifyReview = (
    title: string
  ): { reviewType: 'bibliometric' | 'systematic_review' | 'conceptual_survey' } => {
    const t = title.toLowerCase();
    if (/bibliometric|scientometric|informetric|co-citation|citation analysis|mapping/.test(t)) {
      return { reviewType: 'bibliometric' };
    }
    if (/systematic review|meta-analysis|scoping review|prisma/.test(t)) {
      return { reviewType: 'systematic_review' };
    }
    return { reviewType: 'conceptual_survey' };
  };

  rows.forEach((r) => {
    if (!r.work || seenIds.has(r.work)) return;
    const rawTitle = (r.title || getQid(r.work)).replace(/\.$/, '').trim();
    const titleKey = rawTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seenTitles.has(titleKey)) return;

    seenIds.add(r.work);
    seenTitles.add(titleKey);

    const classification = classifyReview(rawTitle);

    uniquePrior.push({
      id: r.work,
      title: rawTitle,
      year: parseInt(r.year, 10) || 0,
      venue: r.venueLabel || '',
      doi: (r.doi || '').replace('https://doi.org/', ''),
      omid: getQid(r.work),
      cites: parseInt(r.cites, 10) || 0,
      authors: [],
      keywords: [],
      origin: 'prior',
      ...classification,
    });
  });

  const selectedPrior = uniquePrior.slice(0, 16);
  if (selectedPrior.length > 0) {
    await enrichMetadata(selectedPrior, endpoint, log);
  }

  log(`Successfully synthesized ${selectedPrior.length} prior review studies (Bibliometric, Systematic Reviews, & Surveys) for benchmark references.`);
  return selectedPrior;
}
