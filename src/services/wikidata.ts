import { WikidataHit, TermPack } from '../types';
import { executeQLeverOnce } from './qlever';
import { extractEntityTerms, classifyOntologyRows, norm } from './terms';

const WD_API = 'https://www.wikidata.org/w/api.php';
const E = encodeURIComponent;

const chunk = <T>(a: T[], n: number): T[][] => {
  const r: T[][] = [];
  for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n));
  return r;
};

const jsonFetch = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`${r.status} ${url.slice(0, 90)}`);
  }
  return r.json();
};

export async function searchWikidata(query: string, lang = 'en'): Promise<WikidataHit[]> {
  const q = query.trim();
  if (!q) return [];

  // Q-id direct lookup
  if (/^Q\d+$/i.test(q)) {
    const id = q.toUpperCase();
    const data = await jsonFetch(
      `${WD_API}?action=wbgetentities&ids=${id}&props=labels|descriptions&languages=${lang}&format=json&origin=*`
    );
    const entity = data.entities?.[id];
    const label = entity?.labels?.[lang]?.value || entity?.labels?.en?.value;
    const description = entity?.descriptions?.[lang]?.value || entity?.descriptions?.en?.value;
    if (!label) return [];
    return [{ id, label, description }];
  }

  // Text search
  const data = await jsonFetch(
    `${WD_API}?action=wbsearchentities&search=${E(q)}&language=${lang}&uselang=${lang}&type=item&limit=12&format=json&origin=*`
  );
  if (!data.search || !data.search.length) {
    return [];
  }
  return data.search.map((h: any) => ({
    id: h.id,
    label: h.label || h.id,
    description: h.description || '',
  }));
}

// Well-known core instances and projects for top concepts (e.g. Q171 Wiki)
const WIKI_SPECIAL_RELATIONS: Record<string, { id: string; rel: string }[]> = {
  Q171: [
    { id: 'Q52', rel: 'instance' },       // Wikipedia
    { id: 'Q2013', rel: 'instance' },     // Wikidata
    { id: 'Q565', rel: 'instance' },      // Wikimedia Commons
    { id: 'Q1018', rel: 'instance' },     // Wiktionary
    { id: 'Q83', rel: 'narrower' },       // MediaWiki
    { id: 'Q2634358', rel: 'narrower' },  // Semantic MediaWiki
    { id: 'Q369', rel: 'instance' },      // Wikiquote
    { id: 'Q367', rel: 'instance' },      // Wikibooks
    { id: 'Q263', rel: 'instance' },      // Wikisource
    { id: 'Q373', rel: 'instance' },      // Wikivoyage
    { id: 'Q370', rel: 'instance' },      // Wikiversity
    { id: 'Q1322494', rel: 'narrower' },  // wiki project
    { id: 'Q638153', rel: 'narrower' },   // semantic wiki
  ],
};

/**
 * Ontology of the topic, ranked by the number of Wikipedia sitelinks. Relations:
 *  narrower = subclasses (two levels), instance = instances, part = parts, facet = facets,
 *  same as = equivalent items, broader = more general items (displayed, never searched).
 */
const ontologySparql = (id: string) => `
SELECT DISTINCT ?item ?rel ?sl WHERE {
  {
    { ?item wdt:P279 wd:${id} . BIND('narrower' AS ?rel) }
    UNION { ?item wdt:P279/wdt:P279 wd:${id} . BIND('narrower' AS ?rel) }
    UNION { ?item wdt:P31 wd:${id} . BIND('instance' AS ?rel) }
    UNION { ?item wdt:P361 wd:${id} . BIND('part' AS ?rel) }
    UNION { wd:${id} wdt:P527 ?item . BIND('part' AS ?rel) }
    UNION { ?item wdt:P1269 wd:${id} . BIND('facet' AS ?rel) }
    UNION { wd:${id} wdt:P460 ?item . BIND('same as' AS ?rel) }
    UNION { ?item wdt:P460 wd:${id} . BIND('same as' AS ?rel) }
    UNION { wd:${id} wdt:P279 ?item . BIND('broader' AS ?rel) }
    UNION { wd:${id} wdt:P31 ?item . BIND('broader' AS ?rel) }
    UNION { wd:${id} wdt:P361 ?item . BIND('broader' AS ?rel) }
    UNION { wd:${id} wdt:P1269 ?item . BIND('broader' AS ?rel) }
  }
  OPTIONAL { ?item wikibase:sitelinks ?sl }
}
ORDER BY DESC(?sl)
LIMIT 1500
`;

/** Same relations without ranking, in case the sitelink predicate is unavailable. */
const ontologySparqlPlain = (id: string) => ontologySparql(id).replace('  OPTIONAL { ?item wikibase:sitelinks ?sl }\n', '').replace('ORDER BY DESC(?sl)\n', '').replace('?item ?rel ?sl', '?item ?rel');

const sitelinkTitles = (entity: any, langs: string[]): Record<string, string> => {
  const out: Record<string, string> = {};
  langs.forEach((l) => {
    const t = entity?.sitelinks?.[`${l.replace(/-/g, '_')}wiki`]?.title;
    if (t) out[l] = t;
  });
  return out;
};

export interface TermDeps {
  exec?: (sparql: string) => Promise<Record<string, string>[]>;
  getJson?: (url: string) => Promise<any>;
}

/** Redirect titles of Wikipedia articles: real alternative names, spellings and abbreviations. */
export async function fetchWikipediaRedirects(
  titlesByLang: Record<string, string[]>,
  getJson: (url: string) => Promise<any>,
  log: (msg: string) => void
): Promise<Record<string, Record<string, string[]>>> {
  const out: Record<string, Record<string, string[]>> = {}; // lang -> page title -> redirects
  for (const [lang, titles] of Object.entries(titlesByLang)) {
    for (const b of chunk([...new Set(titles)], 40)) {
      let cont = '';
      for (let page = 0; page < 3; page++) {
        try {
          const j = await getJson(
            `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${E(b.join('|'))}&prop=redirects&rdlimit=max&rdnamespace=0&format=json&origin=*${cont}`
          );
          Object.values(j.query?.pages || {}).forEach((pg: any) => {
            const list = (pg.redirects || []).map((r: any) => String(r.title));
            if (pg.title && list.length) {
              out[lang] = out[lang] || {};
              out[lang][pg.title] = [...(out[lang][pg.title] || []), ...list];
            }
          });
          const rc = j.continue?.rdcontinue;
          if (!rc) break;
          cont = `&rdcontinue=${E(rc)}`;
        } catch (err: any) {
          log(`Wikipedia redirects (${lang}) note: ${err.message}`);
          break;
        }
      }
    }
  }
  return out;
}

const goodRedirect = (t: string) => !t.includes(':') && !t.includes('(') && t.length <= 60;

export async function fetchWikidataTerms(
  selectedId: string,
  languages: string[],
  log: (msg: string) => void,
  deps: TermDeps = {}
): Promise<TermPack[]> {
  const exec = deps.exec ?? ((q: string) => executeQLeverOnce(q));
  const getJson = deps.getJson ?? jsonFetch;
  const langs = [...new Set([...languages.map((l) => l.trim()).filter(Boolean), 'en'])];
  const L = [...langs, 'mul'].join('|');
  const sitefilter = langs.map((l) => `${l.replace(/-/g, '_')}wiki`).join('|');
  const props = (extra = '') => `labels|aliases|sitelinks${extra}&languages=${L}&sitefilter=${sitefilter}`;

  const r = await getJson(`${WD_API}?action=wbgetentities&ids=${selectedId}&props=${props('|claims')}&format=json&origin=*`);
  const e = r.entities?.[selectedId];
  if (!e) throw new Error(`Wikidata entity ${selectedId} not found`);

  // 1. direct statements of the item: seeds when the ontology query is unavailable
  const rows: { item?: string; rel?: string; sl?: string }[] = [];
  const seed = (prop: string, rel: string) =>
    (e.claims?.[prop] || []).forEach((x: any) => {
      const v = x.mainsnak?.datavalue?.value?.id;
      if (v) rows.push({ item: v, rel });
    });
  ['P31', 'P279', 'P361', 'P1269'].forEach((p) => seed(p, 'broader'));
  seed('P527', 'part');
  seed('P460', 'same as');
  (WIKI_SPECIAL_RELATIONS[selectedId] || []).forEach((x) => rows.push({ item: x.id, rel: x.rel }));

  // 2. ranked ontology (narrower, instances, parts, facets, equivalents, broader)
  log(`Querying ontology of ${selectedId}: narrower terms, instances, parts, facets, equivalents…`);
  try {
    (await exec(ontologySparql(selectedId))).forEach((x) => rows.push(x));
  } catch (err: any) {
    log(`Ranked ontology query note: ${err.message}. Trying the unranked query…`);
    try {
      (await exec(ontologySparqlPlain(selectedId))).forEach((x) => rows.push(x));
    } catch (err2: any) {
      log(`Ontology query note: ${err2.message}. Using the Wikidata search API…`);
      for (const [p, rel] of [['P279', 'narrower'], ['P31', 'instance'], ['P361', 'part'], ['P1269', 'facet']]) {
        try {
          const q = await getJson(`${WD_API}?action=query&list=search&srsearch=${E('haswbstatement:' + p + '=' + selectedId)}&srnamespace=0&srlimit=40&format=json&origin=*`);
          (q.query?.search || []).forEach((x: any) => rows.push({ item: x.title, rel }));
        } catch {
          /* keep going with what we have */
        }
      }
    }
  }
  const chosen = classifyOntologyRows(rows, selectedId);

  // 3. names of the related items
  const titles: Record<string, Record<string, string>> = { [selectedId]: sitelinkTitles(e, langs) };
  const packFor = (id: string, ent: any, rel: string, rank: number): TermPack => {
    const t = extractEntityTerms(ent, langs);
    titles[id] = sitelinkTitles(ent, langs);
    return { id, rel, rank, labels: t.labels, aliases: t.aliases };
  };
  const termsList: TermPack[] = [packFor(selectedId, e, 'main', 0)];
  for (const b of chunk(chosen.map((c) => c.id), 50)) {
    try {
      const r2 = await getJson(`${WD_API}?action=wbgetentities&ids=${b.join('|')}&props=${props()}&format=json&origin=*`);
      b.forEach((id) => {
        const c = chosen.find((x) => x.id === id)!;
        if (r2.entities?.[id]) termsList.push(packFor(id, r2.entities[id], c.rel, c.rank));
      });
    } catch (err: any) {
      log(`Labels batch notice: ${err.message}`);
    }
  }

  // 4. Wikipedia redirects of the main item and of the best-known searched related items
  const focus = termsList.filter((t, i) => i === 0 || ['same as', 'narrower'].includes(t.rel)).slice(0, 9);
  const byLang: Record<string, string[]> = {};
  focus.forEach((t) => Object.entries(titles[t.id] || {}).forEach(([l, ti]) => (byLang[l] = [...(byLang[l] || []), ti])));
  const redirects = await fetchWikipediaRedirects(byLang, getJson, log);
  let added = 0;
  focus.forEach((t) => {
    const seen = new Set([...Object.values(t.labels), ...Object.values(t.aliases).flat()].map(norm));
    Object.entries(titles[t.id] || {}).forEach(([lang, title]) => {
      (redirects[lang]?.[title] || []).filter(goodRedirect).slice(0, 40).forEach((rd) => {
        const n = norm(rd);
        if (seen.has(n)) return;
        seen.add(n);
        (t.aliases[lang] = t.aliases[lang] || []).push(rd);
        added++;
      });
    });
  });

  const counts: Record<string, number> = {};
  termsList.slice(1).forEach((t) => (counts[t.rel] = (counts[t.rel] || 0) + 1));
  const nMain = new Set([...Object.values(termsList[0].labels), ...Object.values(termsList[0].aliases).flat()].map(norm)).size;
  log(`Terms: ${nMain} distinct names for the main item (${added} from Wikipedia redirects); related items ${JSON.stringify(counts)}`);
  return termsList;
}
