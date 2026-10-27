import { Publication, Author, RetrievalReport } from '../types';
import { countryOf } from './stats';
import { isUsableTerm, matchesQuery, norm } from './terms';

export const DEFAULT_QLEVER_ENDPOINT = 'https://qlever.cs.uni-freiburg.de/api/wikidata';

const PREFIXES = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX wikibase: <http://wikiba.se/ontology#>
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

/** A query that exceeded the server's time limit: retrying the same query cannot succeed. */
export class QLeverTimeoutError extends Error {
  timeout = true;
}

export const isTimeoutError = (e: any): boolean =>
  !!e && (e.timeout === true || e.name === 'AbortError' || /timed out|time limit|timeout/i.test(String(e.message || '')));

// QLever reports a timeout as HTTP 429 ("Operation timed out"), the same status as rate limiting.
const LONG_QUERY = 6000; // longer encoded queries are sent by POST (proxies reject very long URLs)

export async function executeQLeverOnce(
  sparqlQuery: string,
  endpoint = DEFAULT_QLEVER_ENDPOINT
): Promise<Record<string, string>[]> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 90000);
  const fullQuery = PREFIXES + sparqlQuery;
  const encoded = E(fullQuery);

  try {
    const res =
      encoded.length > LONG_QUERY
        ? await fetch(endpoint, {
            method: 'POST',
            headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'query=' + encoded, // a "simple" request: no CORS preflight
            signal: ctl.signal,
          })
        : await fetch(endpoint + '?query=' + encoded, { headers: { Accept: 'application/sparql-results+json' }, signal: ctl.signal });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const msg = `HTTP ${res.status}: ${errText.slice(0, 200)}`;
      if (/timed out|time limit/i.test(errText)) throw new QLeverTimeoutError(`Query exceeded the server time limit (${msg.slice(0, 80)})`);
      throw new Error(msg);
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
      if (isTimeoutError(e)) break; // the same query would time out again
      if (e.message && /HTTP 429/.test(e.message)) {
        // genuine rate limiting by the server proxy: exponential backoff
        await sleep(2500 * (i + 1));
        continue;
      }
      if (!(e instanceof TypeError)) {
        if (e.message && /HTTP 4\d\d/.test(e.message)) break;
      }
      await sleep(1500 * (i + 1));
    }
  }

  if (isTimeoutError(lastError)) {
    throw new QLeverTimeoutError('Wikidata QLever: the query exceeded the server time limit.');
  }
  throw new Error(`Wikidata QLever: ${lastError?.message || 'Request failed'}`);
}

const getQid = (uri: string): string => {
  const m = uri.match(/Q\d+$/);
  return m ? m[0] : uri;
};

export interface SearchOptions {
  exec?: (sparql: string, endpoint: string) => Promise<Record<string, string>[]>;
  /** Filled with what was retrieved by each channel. */
  report?: RetrievalReport;
  skipEnrich?: boolean;
}

/** Scholarly work types searched by title: articles, reviews, preprints, conference papers, theses, chapters. */
const WORK_TYPES = 'wd:Q13442814 wd:Q18918145 wd:Q7318358 wd:Q580922 wd:Q23927052 wd:Q1266946 wd:Q187685 wd:Q1980247';
const EXCLUDED_TYPES = 'wd:Q5633421 wd:Q737498 wd:Q1002697 wd:Q41298';

const TAIL = `
  OPTIONAL { ?work wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
  OPTIONAL { ?work wdt:P1433 ?venue . ?venue rdfs:label ?venueLabel . FILTER(LANG(?venueLabel) = 'en') }
  OPTIONAL { ?work wdt:P356 ?doi }
  OPTIONAL { ?citing wdt:P2860 ?work }`;

/**
 * Splits the largest OR-group into at most `maxChunks` chunks so each title query stays small;
 * the union of the chunk results equals the result of the full query (OR distributes over AND).
 */
export function chunkTitleGroups(groups: string[][], size = 50, maxChunks = 3): string[][][] {
  // Titles often lack the accents a term carries (and vice versa): query both spellings.
  const variants = (t: string) => {
    const l = t.toLowerCase();
    const n = norm(t);
    return n !== l ? [l, n] : [l];
  };
  const usable = groups
    .map((g) => [...new Set(g.filter((t) => isUsableTerm(t)).flatMap(variants))])
    .filter((g) => g.length);
  if (!usable.length) return [];
  const big = usable.reduce((bi, g, i) => (g.length > usable[bi].length ? i : bi), 0);
  const pieces = chunk(usable[big], size).slice(0, maxChunks);
  return pieces.map((piece) => usable.map((g, i) => (i === big ? piece : g.slice(0, size))));
}

/** Splits the largest group of terms in two, or returns null if it is already small. */
export function splitGroups(groups: string[][], minSize = 8): string[][][] | null {
  const big = groups.reduce((bi, g, i) => (g.length > groups[bi].length ? i : bi), 0);
  if (!groups.length || groups[big].length <= minSize) return null;
  const half = Math.ceil(groups[big].length / 2);
  const make = (part: string[]) => groups.map((g, i) => (i === big ? part : g));
  return [make(groups[big].slice(0, half)), make(groups[big].slice(half))];
}

export async function searchWikidataWorks(
  conceptId: string,
  relatedConceptIds: string[],
  queryText: string,
  maxResults: number,
  endpoint = DEFAULT_QLEVER_ENDPOINT,
  log: (msg: string) => void,
  opts: SearchOptions = {}
): Promise<Publication[]> {
  const exec = opts.exec ?? executeQLever;
  const groups = parseQueryGroups(queryText);
  const titleChunks = chunkTitleGroups(groups);
  const usableGroups = titleChunks.length ? titleChunks[0].map((_, gi) => [...new Set(titleChunks.flatMap((c) => c[gi]))]) : [];
  const stage1Limit = Math.min(20000, Math.max(4 * maxResults, 3000));

  const toPub = (r: Record<string, string>, via: 'subject' | 'title'): Publication => {
    const qid = getQid(r.work);
    return {
      id: r.work,
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
      via,
    };
  };

  // Stage 2 of the fallback: metadata and citation counts for works already selected (cheap, indexed).
  const fetchCore = async (workUris: string[]): Promise<Record<string, string>[]> => {
    const ids = [...new Set(workUris.map(getQid))];
    const rows: Record<string, string>[] = [];
    for (const b of chunk(ids, 300)) {
      rows.push(
        ...(await exec(
          `# stage:core
SELECT ?work ?title ?year ?venueLabel ?doi (COUNT(?citing) AS ?cites) WHERE {
  VALUES ?work { ${b.map((id) => `wd:${id}`).join(' ')} }
  OPTIONAL { ?work wdt:P1476 ?title }${TAIL}
}
GROUP BY ?work ?title ?year ?venueLabel ?doi
`,
          endpoint
        ))
      );
    }
    const seen = new Set<string>();
    return rows
      .filter((r) => (seen.has(r.work) ? false : (seen.add(r.work), true)))
      .sort((a, b) => (parseInt(b.cites, 10) || 0) - (parseInt(a.cites, 10) || 0))
      .slice(0, maxResults);
  };

  // ---- Channel A: works whose main subject (P921) is the topic or one of its related items -------
  const ids = [...new Set([conceptId, ...relatedConceptIds])].slice(0, 201);
  const concepts = ids.map((id) => `wd:${id}`).join(' ');
  log(`Subject channel: works about ${ids.length} Wikidata items (the topic and ${ids.length - 1} related items)…`);
  const subjectExact = (vals: string) => `
SELECT ?work ?title ?year ?venueLabel ?doi (COUNT(?citing) AS ?cites) WHERE {
  VALUES ?concept { ${vals} }
  ?work wdt:P921 ?concept .
  OPTIONAL { ?work wdt:P1476 ?title }${TAIL}
  FILTER NOT EXISTS { VALUES ?excludedType { ${EXCLUDED_TYPES} } ?work wdt:P31 ?excludedType }
}
GROUP BY ?work ?title ?year ?venueLabel ?doi
ORDER BY DESC(?cites)
LIMIT ${maxResults}
`;
  let subjectRows: Record<string, string>[] = [];
  let subjectError = '';
  let subjectApprox = false;
  let subjectCapped = false;
  try {
    subjectRows = await exec(subjectExact(concepts), endpoint);
  } catch (err: any) {
    if (isTimeoutError(err)) {
      log('Subject channel: the ranked query exceeded the time limit; selecting works first, then ranking them by citations…');
      try {
        const sel = await exec(
          `# stage:select
SELECT DISTINCT ?work WHERE {
  VALUES ?concept { ${concepts} }
  ?work wdt:P921 ?concept .
  FILTER NOT EXISTS { VALUES ?excludedType { ${EXCLUDED_TYPES} } ?work wdt:P31 ?excludedType }
}
LIMIT ${stage1Limit}
`,
          endpoint
        );
        subjectCapped = sel.length >= stage1Limit;
        subjectRows = await fetchCore(sel.map((r) => r.work));
        subjectApprox = true;
      } catch (err2: any) {
        subjectError = err2.message;
        log(`Subject channel failed: ${err2.message}`);
      }
    } else {
      subjectError = err.message;
      log(`Subject channel note: ${err.message}. Retrying with the topic item alone…`);
      try {
        subjectRows = await exec(subjectExact(`wd:${conceptId}`), endpoint);
        subjectError = '';
      } catch (err2: any) {
        log(`Subject channel failed: ${err2.message}`);
      }
    }
  }
  log(`Subject channel: ${subjectRows.length} works${subjectApprox ? ' (ranked within the first matches)' : ''}`);

  // ---- Channel B: works whose title contains a term (most works have no subject statement) -------
  const titleExact = (ch: string[][]) => `
SELECT ?work ?title ?year ?venueLabel ?doi (COUNT(?citing) AS ?cites) WHERE {
  VALUES ?workType { ${WORK_TYPES} }
  ?work wdt:P31 ?workType ;
        wdt:P1476 ?title .
  FILTER(${filterOf(ch)})${TAIL}
}
GROUP BY ?work ?title ?year ?venueLabel ?doi
ORDER BY DESC(?cites)
LIMIT ${maxResults}
`;
  const titleSelect = (ch: string[][]) => `# stage:select
SELECT DISTINCT ?work ?title WHERE {
  VALUES ?workType { ${WORK_TYPES} }
  ?work wdt:P31 ?workType ;
        wdt:P1476 ?title .
  FILTER(${filterOf(ch)})
}
LIMIT ${stage1Limit}
`;

  let titleError = '';
  let titleTruncated = false;
  let titleApprox = false;
  const titleRows: Record<string, string>[] = [];

  /** exact ranked query; on a timeout the two-stage fallback; if that times out too, halve the terms */
  const titleChunkRows = async (ch: string[][]): Promise<Record<string, string>[]> => {
    try {
      const rows = await exec(titleExact(ch), endpoint);
      if (rows.length >= maxResults) titleTruncated = true;
      return rows;
    } catch (err: any) {
      if (!isTimeoutError(err)) throw err;
      log('Title channel: the ranked query exceeded the time limit; selecting works first, then ranking them by citations…');
      try {
        const sel = await exec(titleSelect(ch), endpoint);
        if (sel.length >= stage1Limit) titleTruncated = true;
        const titles = new Map(sel.map((r) => [getQid(r.work), r.title]));
        const core = await fetchCore(sel.map((r) => r.work));
        titleApprox = true;
        return core.map((r) => ({ ...r, title: r.title || titles.get(getQid(r.work)) || '' }));
      } catch (err2: any) {
        if (!isTimeoutError(err2)) throw err2;
        const halves = splitGroups(ch);
        if (!halves) throw err2;
        log(`Title channel: still too slow with ${ch.reduce((a, g) => Math.max(a, g.length), 0)} terms; splitting the term list in two…`);
        titleApprox = true;
        const out: Record<string, string>[] = [];
        for (const h of halves) out.push(...(await titleChunkRows(h)));
        return out;
      }
    }
  };

  if (titleChunks.length) {
    const nTerms = new Set(titleChunks.flatMap((c) => c.flat())).size;
    log(`Title channel: ${nTerms} terms in ${titleChunks.length} query${titleChunks.length > 1 ? ' chunks' : ''}…`);
    for (const [ci, ch] of titleChunks.entries()) {
      try {
        const rows = await titleChunkRows(ch);
        titleRows.push(...rows);
        log(`Title channel chunk ${ci + 1}/${titleChunks.length}: ${rows.length} works`);
      } catch (err: any) {
        titleError = err.message;
        log(`Title channel chunk ${ci + 1} note: ${err.message}`);
      }
    }
  }

  if (!subjectRows.length && !titleRows.length && subjectError && (titleError || !titleChunks.length)) {
    throw new Error(`Wikidata QLever: both retrieval channels failed (${subjectError.slice(0, 120)})`);
  }

  // ---- Merge; title-only hits must also pass a word-boundary check ------------------------------
  const map = new Map<string, Publication>();
  subjectRows.forEach((r) => {
    if (r.work && !map.has(r.work)) map.set(r.work, toPub(r, 'subject'));
  });
  let titleDropped = 0;
  titleRows.forEach((r) => {
    if (!r.work) return;
    const cur = map.get(r.work);
    if (cur) {
      cur.via = 'both';
      return;
    }
    if (!matchesQuery(r.title || '', usableGroups)) {
      titleDropped++;
      return;
    }
    map.set(r.work, toPub(r, 'title'));
  });

  const publications = [...map.values()];
  const both = publications.filter((p) => p.via === 'both').length;
  const subjectOnly = publications.filter((p) => p.via === 'subject').length;
  const titleOnly = publications.filter((p) => p.via === 'title').length;
  log(`Retrieval: ${publications.length} distinct works (${subjectOnly} by subject only, ${titleOnly} by title only, ${both} by both; ${titleDropped} title hits discarded by the word-boundary check).`);
  const subjectTruncated = subjectRows.length >= maxResults || subjectCapped;
  if (subjectTruncated || titleTruncated) {
    log(`Warning: a channel reached its limit and is ordered by citation count${subjectApprox || titleApprox ? ' (only within the first matches found)' : ''}; raise the limit or narrow the topic to avoid a citation-selected sample.`);
  }

  if (opts.report) {
    Object.assign(opts.report, {
      subject: { ids: ids.length, returned: subjectRows.length, truncated: subjectTruncated, approximate: subjectApprox || undefined },
      title: { ran: titleChunks.length > 0, returned: titleRows.length, truncated: titleTruncated, failed: titleError || undefined, approximate: titleApprox || undefined },
      merged: { total: publications.length, both, subjectOnly, titleOnly, titleDropped },
      titleTerms: new Set(titleChunks.flatMap((c) => c.flat())).size,
    });
  }

  if (!opts.skipEnrich) await enrichMetadata(publications, endpoint, log);
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

  // Enrich in lightweight batches of 10 works to completely avoid QLever 429 timeouts
  const enrichBatch = async (batch: Publication[]) => {
    const workValues = batch.map((r) => `<${r.id}>`).join(' ');

    // 1. Authors & Institutional affiliation query (flat, indexed, sub-second execution)
    const authorsSparql = `
SELECT ?work ?author ?authorName ?instLabel ?countryLabel WHERE {
  VALUES ?work { ${workValues} }
  ?work wdt:P50 ?author .
  OPTIONAL { ?author rdfs:label ?nEn . FILTER(LANG(?nEn) = 'en') }
  OPTIONAL { ?author rdfs:label ?nMul . FILTER(LANG(?nMul) = 'mul') }
  BIND(COALESCE(?nEn, ?nMul) AS ?authorName)
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
LIMIT 5000
`;

    try {
      const rows = await executeQLever(authorsSparql, endpoint);
      if (rows.length >= 5000) {
        log('Warning: author query hit its row limit for a batch; some authors may be missing (collaboration indicators would be biased downward).');
      }
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
  OPTIONAL { ?topic rdfs:label ?tEn . FILTER(LANG(?tEn) = 'en') }
  OPTIONAL { ?topic rdfs:label ?tMul . FILTER(LANG(?tMul) = 'mul') }
  BIND(COALESCE(?tEn, ?tMul) AS ?topicLabel)
  FILTER(BOUND(?topicLabel))
}
LIMIT 3000
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
  };

  // A few batches in parallel: large corpora would otherwise take many minutes
  const batches = chunk(recs, 10);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < batches.length) {
      const b = batches[next++];
      await enrichBatch(b);
      done++;
      if (done % 20 === 0) log(`Enriched ${Math.min(done * 10, recs.length)} of ${recs.length} works…`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, batches.length) }, worker));

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
