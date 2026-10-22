import { WikidataHit, TermPack } from '../types';
import { DEFAULT_QLEVER_ENDPOINT, executeQLeverOnce } from './qlever';

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
    { id: 'Q52', rel: 'instance of' },       // Wikipedia
    { id: 'Q2013', rel: 'instance of' },     // Wikidata
    { id: 'Q565', rel: 'instance of' },      // Wikimedia Commons
    { id: 'Q1018', rel: 'instance of' },     // Wiktionary
    { id: 'Q83', rel: 'subclass of' },       // MediaWiki
    { id: 'Q2634358', rel: 'subclass of' },  // Semantic MediaWiki
    { id: 'Q369', rel: 'instance of' },      // Wikiquote
    { id: 'Q367', rel: 'instance of' },      // Wikibooks
    { id: 'Q263', rel: 'instance of' },      // Wikisource
    { id: 'Q373', rel: 'instance of' },      // Wikivoyage
    { id: 'Q370', rel: 'instance of' },      // Wikiversity
    { id: 'Q1322494', rel: 'subclass of' },  // wiki project
    { id: 'Q638153', rel: 'subclass of' },   // semantic wiki
  ],
};

export async function fetchWikidataTerms(
  selectedId: string,
  languages: string[],
  log: (msg: string) => void
): Promise<TermPack[]> {
  const L = languages.join('|') || 'en';
  const url = `${WD_API}?action=wbgetentities&ids=${selectedId}&props=labels|aliases|claims&languages=${L}&format=json&origin=*`;
  const r = await jsonFetch(url);
  const e = r.entities?.[selectedId];
  if (!e) {
    throw new Error(`Wikidata entity ${selectedId} not found`);
  }

  const rel = new Map<string, string>();

  // 1. Check direct claims on the entity: P31 (instance of), P279 (subclass of), P361 (part of), P1269 (facet of), P527 (has part)
  const directPredicates: [string, string][] = [
    ['P31', 'instance of'],
    ['P279', 'subclass of'],
    ['P361', 'part of'],
    ['P1269', 'facet of'],
    ['P527', 'has part'],
  ];

  directPredicates.forEach(([prop, name]) => {
    (e.claims?.[prop] || []).forEach((x: any) => {
      const v = x.mainsnak?.datavalue?.value?.id;
      if (v && v !== selectedId && !rel.has(v)) {
        rel.set(v, name);
      }
    });
  });

  // 2. Special ontology links for iconic concepts like Q171 Wiki (Wikipedia, Wikidata, Wikimedia...)
  if (WIKI_SPECIAL_RELATIONS[selectedId]) {
    WIKI_SPECIAL_RELATIONS[selectedId].forEach((item) => {
      if (!rel.has(item.id)) {
        rel.set(item.id, item.rel);
      }
    });
  }

  // 3. Inverse SPARQL traversal via Wikidata QLever for P31, P279, P361, P1269, and P527
  log(`Querying ontology relations (instance of, subclass of, facet of, part of) for ${selectedId}…`);
  const ontologySparql = `
SELECT DISTINCT ?item ?rel WHERE {
  { ?item wdt:P31 wd:${selectedId} . BIND('instance of' AS ?rel) }
  UNION
  { ?item wdt:P279 wd:${selectedId} . BIND('subclass of' AS ?rel) }
  UNION
  { ?item wdt:P1269 wd:${selectedId} . BIND('facet of' AS ?rel) }
  UNION
  { ?item wdt:P361 wd:${selectedId} . BIND('part of' AS ?rel) }
  UNION
  { wd:${selectedId} wdt:P527 ?item . BIND('has part' AS ?rel) }
  UNION
  { wd:${selectedId} wdt:P361 ?item . BIND('part of' AS ?rel) }
  UNION
  { wd:${selectedId} wdt:P1269 ?item . BIND('facet of' AS ?rel) }
  UNION
  { wd:${selectedId} wdt:P279 ?item . BIND('subclass of' AS ?rel) }
}
LIMIT 100
`;

  try {
    const qleverRows = await executeQLeverOnce(ontologySparql);
    qleverRows.forEach((row) => {
      const itemId = (row.item || '').split('/').pop();
      if (itemId && itemId !== selectedId && /^Q\d+$/.test(itemId) && !rel.has(itemId)) {
        rel.set(itemId, row.rel || 'related');
      }
    });
  } catch (err: any) {
    log(`SPARQL ontology query note: ${err.message}. Using Wikidata search API fallback…`);
    // Fallback to MediaWiki haswbstatement search
    for (const [p, name] of [
      ['P31', 'instance of'],
      ['P279', 'subclass of'],
      ['P1269', 'facet of'],
      ['P361', 'part of'],
    ]) {
      try {
        const q = await jsonFetch(
          `${WD_API}?action=query&list=search&srsearch=${E('haswbstatement:' + p + '=' + selectedId)}&srnamespace=0&srlimit=25&format=json&origin=*`
        );
        (q.query?.search || []).forEach((x: any) => {
          if (x.title !== selectedId && !rel.has(x.title)) {
            rel.set(x.title, name);
          }
        });
      } catch (e) {}
    }
  }

  const pack = (id: string, x: any, relationship: string): TermPack => ({
    id,
    rel: relationship,
    labels: Object.fromEntries(
      Object.entries(x.labels || {}).map(([k, v]: [string, any]) => [k, v.value])
    ),
    aliases: Object.fromEntries(
      Object.entries(x.aliases || {}).map(([k, v]: [string, any]) => [k, v.map((a: any) => a.value)])
    ),
  });

  const termsList: TermPack[] = [pack(selectedId, e, 'main')];
  const ids = [...rel.keys()].slice(0, 80);

  for (const b of chunk(ids, 40)) {
    try {
      const r2 = await jsonFetch(
        `${WD_API}?action=wbgetentities&ids=${b.join('|')}&props=labels|aliases&languages=${L}&format=json&origin=*`
      );
      b.forEach((i) => {
        if (r2.entities?.[i]) {
          termsList.push(pack(i, r2.entities[i], rel.get(i) || 'related'));
        }
      });
    } catch (err: any) {
      log(`Labels batch notice: ${err.message}`);
    }
  }

  const counts: Record<string, number> = {};
  termsList.slice(1).forEach((t) => {
    counts[t.rel] = (counts[t.rel] || 0) + 1;
  });
  log(`Terms: main concept + related ontology items ${JSON.stringify(counts)}`);

  return termsList;
}
