/**
 * Term handling for the topic and its related Wikidata items: normalisation, selection,
 * query-group construction and title matching. Pure functions (unit-tested).
 *
 * Why this exists: the retrieval only finds what the query terms and related items allow it to
 * find. Earlier versions kept ASCII terms only, at most 5 labels / 8 instance terms / 4 subclass
 * terms, and 15 related items (the first ones were *broader* classes such as "country").
 */
import type { TermPack } from '../types';

/** Relations whose items are searched for (narrower or equivalent meaning). */
export const SEARCHED_RELATIONS = ['same as', 'narrower', 'instance', 'part', 'facet'] as const;
/** Per-relation caps on how many related items are kept, in priority order. */
export const RELATION_CAPS: Record<string, number> = {
  'same as': 10,
  narrower: 80,
  instance: 40,
  part: 30,
  facet: 20,
  broader: 15, // kept for display and context only, never searched
};
const PRIORITY = ['same as', 'narrower', 'instance', 'part', 'facet', 'broader'];
const WEIGHT: Record<string, number> = { main: 100, 'same as': 80, narrower: 60, instance: 50, part: 40, facet: 40 };

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

/** Case-, accent- and punctuation-insensitive form used for comparison. */
export function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '') // Latin and Arabic diacritics
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const GENERIC = new Set(['the', 'and', 'of', 'in', 'on', 'for', 'a', 'an', 'to', 'or', 'with', 'research', 'study', 'science']);

/** A term is usable in a title query if it is specific enough not to flood the results. */
export function isUsableTerm(t: string, minLen = 4): boolean {
  const n = norm(t);
  if (!n || n.length > 80 || n.split(' ').length > 8) return false;
  if (/^[\d\s.,-]+$/.test(n)) return false;
  if (GENERIC.has(n)) return false;
  if (/\.$/.test(n)) return false; // abbreviations such as "tun."
  return CJK.test(n) ? n.length >= 2 : n.length >= minLen;
}

const flatPack = (p: TermPack): string[] => [...Object.values(p.labels), ...Object.values(p.aliases).flat()];

/** Distinct surface forms of a pack, by normalised form, keeping the first spelling met. */
export function packTerms(p: TermPack): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of flatPack(p)) {
    const n = norm(t);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(t.trim());
    }
  }
  return out;
}

/** Related items to search for: searched relations only, ranked, capped per relation and overall. */
export function selectRelatedIds(terms: TermPack[], max = 200): string[] {
  const rel = terms.slice(1).filter((t) => (SEARCHED_RELATIONS as readonly string[]).includes(t.rel));
  const by = new Map<string, TermPack[]>();
  rel.forEach((t) => by.set(t.rel, [...(by.get(t.rel) || []), t]));
  const out: string[] = [];
  for (const r of PRIORITY) {
    (by.get(r) || [])
      .sort((a, b) => (b.rank || 0) - (a.rank || 0))
      .slice(0, RELATION_CAPS[r])
      .forEach((t) => out.push(t.id));
  }
  return [...new Set(out)].slice(0, max);
}

export interface TermSelection {
  main: string[];
  related: string[];
  all: string[];
}

/**
 * Removes terms that a shorter term of the list already matches. In an OR-group a title that
 * matches "history of tunisia" also matches "tunisia", so the longer term adds nothing but cost.
 * "Matches" is the same word-boundary rule used to check titles, so no title is lost.
 */
export function pruneSubsumed(terms: string[]): string[] {
  const items = terms.map((t, i) => ({ t, i, n: norm(t) }));
  const kept: typeof items = [];
  [...items].sort((a, b) => a.n.length - b.n.length || a.i - b.i).forEach((it) => {
    if (!kept.some((k) => k.n !== it.n && matchesTerm(it.t, k.t))) kept.push(it);
  });
  const keep = new Set(kept.map((k) => k.i));
  return items.filter((it) => keep.has(it.i)).map((it) => it.t);
}

/** All usable terms: the main item first, then the related items in priority and rank order. */
export function collectQueryTerms(terms: TermPack[], opts: { minLen?: number; maxTerms?: number } = {}): TermSelection {
  const { minLen = 4, maxTerms = 150 } = opts;
  if (!terms.length) return { main: [], related: [], all: [] };
  const seen = new Set<string>();
  const take = (list: string[]) => {
    const out: string[] = [];
    for (const t of list) {
      const n = norm(t);
      if (!isUsableTerm(t, minLen) || seen.has(n)) continue;
      seen.add(n);
      out.push(t.trim());
    }
    return out;
  };
  const mainAll = take(packTerms(terms[0]));
  const ranked = terms
    .slice(1)
    .filter((t) => (SEARCHED_RELATIONS as readonly string[]).includes(t.rel))
    .sort((a, b) => (WEIGHT[b.rel] || 0) - (WEIGHT[a.rel] || 0) || (b.rank || 0) - (a.rank || 0));
  const relAll: string[] = [];
  ranked.forEach((p) => relAll.push(...take(packTerms(p))));

  // prune first, cap afterwards: the cap then keeps distinct terms instead of redundant phrases
  const keep = new Set(pruneSubsumed([...mainAll, ...relAll]).map(norm));
  const main = mainAll.filter((t) => keep.has(norm(t))).slice(0, 80);
  const related = relAll.filter((t) => keep.has(norm(t))).slice(0, Math.max(0, maxTerms - main.length));
  return { main, related, all: [...main, ...related] };
}

/** Default query: a single OR-group holding every usable term (the user may refine it). */
export function buildQueryGroups(terms: TermPack[], opts: { minLen?: number; maxTerms?: number } = {}): string[][] {
  const { all } = collectQueryTerms(terms, opts);
  return all.length ? [all.map((t) => t.toLowerCase())] : [];
}

/** Makes sure that every main-item term is present in the first group (OR semantics are unaffected). */
export function ensureMainTerms(groups: string[][], main: string[]): string[][] {
  if (!groups.length) return main.length ? [main.map((t) => t.toLowerCase())] : [];
  const have = new Set(groups[0].map(norm));
  const extra = main.map((t) => t.toLowerCase()).filter((t) => !have.has(norm(t)));
  return [[...groups[0], ...extra], ...groups.slice(1)];
}

const isLetterOrDigit = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/**
 * Title matching with word boundaries, accent-insensitive. A term must start at a word boundary
 * and end at one, except that terms of six or more letters may carry up to three trailing letters
 * (plural, demonym: "bibliometric" matches "bibliometrics", "tunisia" matches "Tunisian").
 * Groups are ANDed, terms inside a group ORed.
 */
export function matchesTerm(title: string, term: string): boolean {
  const t = norm(title);
  const q = norm(term);
  if (!q) return false;
  const cjk = CJK.test(q);
  let from = 0;
  for (;;) {
    const i = t.indexOf(q, from);
    if (i < 0) return false;
    if (cjk) return true;
    const before = t[i - 1];
    const after = t.slice(i + q.length);
    const startOk = !isLetterOrDigit(before);
    // a short run of letters (plural, demonym) may follow, but it must end at a word boundary:
    // "tunisia" matches "tunisian", "gadget 1" does not match "gadget 10" or "gadget1a"
    const suffix = after.match(/^\p{L}*/u)![0];
    const endOk =
      !isLetterOrDigit(after[0]) || (q.length >= 6 && suffix.length > 0 && suffix.length <= 3 && !isLetterOrDigit(after[suffix.length]));
    if (startOk && endOk) return true;
    from = i + 1;
  }
}

export function matchesQuery(title: string, groups: string[][]): boolean {
  if (!groups.length) return true;
  return groups.every((g) => g.some((term) => matchesTerm(title, term)));
}

// ------------------------------------------------------------------------------------------------
// Parsing Wikidata entities
// ------------------------------------------------------------------------------------------------

/** Properties that hold alternative names of the item itself. */
export const NAME_PROPS: Record<string, string> = {
  P1448: 'official name',
  P1813: 'short name',
  P2561: 'name',
  P1449: 'nickname',
  P1705: 'native label',
  P1549: 'demonym', // "Tunisian" for Tunisia
  P1843: 'taxon common name',
  P225: 'taxon name',
};

const SITELINK_SKIP = new Set(['commonswiki', 'wikidatawiki', 'specieswiki', 'metawiki', 'mediawikiwiki', 'sourceswiki']);

export interface EntityTerms {
  labels: Record<string, string>;
  aliases: Record<string, string[]>;
}

/**
 * Collects every textual name of an entity in the requested languages: labels, aliases, titles of
 * its Wikipedia articles (sitelinks), and name-type statements (official name, short name,
 * demonym, taxon name...). The language "mul" (names valid in all languages) is always included.
 */
export function extractEntityTerms(entity: any, languages: string[]): EntityTerms {
  const langs = new Set([...languages.map((l) => l.trim()).filter(Boolean), 'mul']);
  const labels: Record<string, string> = {};
  const aliases: Record<string, string[]> = {};
  const seen = new Set<string>();

  Object.entries(entity?.labels || {}).forEach(([lang, v]: [string, any]) => {
    if (!langs.has(lang) || !v?.value) return;
    labels[lang] = v.value;
    seen.add(norm(v.value));
  });

  const add = (lang: string, text: string) => {
    const t = (text || '').trim();
    const n = norm(t);
    if (!t || !n || seen.has(n)) return;
    seen.add(n);
    (aliases[lang] = aliases[lang] || []).push(t);
  };

  Object.entries(entity?.aliases || {}).forEach(([lang, arr]: [string, any]) => {
    if (!langs.has(lang)) return;
    (arr || []).forEach((a: any) => add(lang, a.value));
  });

  Object.entries(entity?.sitelinks || {}).forEach(([site, v]: [string, any]) => {
    if (!site.endsWith('wiki') || SITELINK_SKIP.has(site)) return;
    const lang = site.slice(0, -4).replace(/_/g, '-');
    const title: string = v?.title || '';
    if (langs.has(lang) && title && !title.includes(':')) add(lang, title);
  });

  Object.keys(NAME_PROPS).forEach((prop) => {
    (entity?.claims?.[prop] || []).forEach((c: any) => {
      const dv = c?.mainsnak?.datavalue?.value;
      if (!dv) return;
      if (typeof dv === 'string') add('mul', dv); // e.g. taxon name
      else if (dv.text && dv.language && langs.has(dv.language)) add(dv.language, dv.text);
    });
  });

  return { labels, aliases };
}

export interface OntologyItem {
  id: string;
  rel: string;
  rank: number;
}

/**
 * Classifies rows of the ontology query. An item found under several relations keeps the one with
 * the highest priority; each relation is capped and ordered by sitelink count.
 */
export function classifyOntologyRows(
  rows: { item?: string; rel?: string; sl?: string }[],
  selectedId: string
): OntologyItem[] {
  const best = new Map<string, OntologyItem>();
  for (const r of rows) {
    const id = (r.item || '').split('/').pop() || '';
    if (!/^Q\d+$/.test(id) || id === selectedId) continue;
    const rel = r.rel || 'broader';
    const rank = parseInt(r.sl || '0', 10) || 0;
    const cur = best.get(id);
    if (!cur || PRIORITY.indexOf(rel) < PRIORITY.indexOf(cur.rel) || (rel === cur.rel && rank > cur.rank)) {
      best.set(id, { id, rel, rank });
    }
  }
  const out: OntologyItem[] = [];
  for (const rel of PRIORITY) {
    [...best.values()]
      .filter((x) => x.rel === rel)
      .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id, 'en', { numeric: true }))
      .slice(0, RELATION_CAPS[rel] ?? 20)
      .forEach((x) => out.push(x));
  }
  return out;
}

/** Counts per relation, for the methods section. */
export function relationCounts(terms: TermPack[]): Record<string, number> {
  const c: Record<string, number> = {};
  terms.slice(1).forEach((t) => (c[t.rel] = (c[t.rel] || 0) + 1));
  return c;
}
