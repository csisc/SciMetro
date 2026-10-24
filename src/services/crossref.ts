/**
 * Crossref lookup for full bibliographic metadata. Wikidata often records only some authors of a
 * work (the rest are plain strings), so references built from Wikidata alone would misattribute
 * authorship. Crossref returns the complete author list, container, volume, pages and, for some
 * works, the abstract.
 */
import type { Ref } from './references';

export interface CrossrefWork {
  doi: string;
  title: string;
  authors: string[]; // "Family, G. H."
  year: number | null;
  container: string;
  volume: string;
  issue: string;
  pages: string;
  type: string;
  abstract: string;
}

const initials = (given: string): string =>
  given
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split('-')
        .filter(Boolean)
        .map((x) => `${x[0].toUpperCase()}.`)
        .join('-')
    )
    .join(' ');

/** Crossref abstracts are JATS XML fragments. */
export function stripJats(x: string): string {
  return (x || '')
    .replace(/<jats:title>[^<]*<\/jats:title>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/^abstract\s*/i, '')
    .trim();
}

export function parseCrossref(json: any): CrossrefWork | null {
  const m = json?.message;
  if (!m || !m.DOI) return null;
  const title = Array.isArray(m.title) ? m.title[0] : m.title;
  if (!title) return null;
  const authors: string[] = (m.author || [])
    .map((a: any) => {
      if (a.family) return `${a.family}, ${a.given ? initials(a.given) : ''}`.replace(/, $/, '');
      return a.name || '';
    })
    .filter(Boolean);
  const dp = m.issued?.['date-parts']?.[0]?.[0] ?? m.published?.['date-parts']?.[0]?.[0] ?? null;
  const container = Array.isArray(m['container-title']) ? m['container-title'][0] || '' : m['container-title'] || '';
  return {
    doi: String(m.DOI).toLowerCase(),
    title: String(title).replace(/\s+/g, ' ').trim(),
    authors,
    year: typeof dp === 'number' ? dp : null,
    container,
    volume: m.volume ? String(m.volume) : '',
    issue: m.issue ? String(m.issue) : '',
    pages: m.page ? String(m.page).replace('-', '–') : m['article-number'] ? String(m['article-number']) : '',
    type: m.type || '',
    abstract: m.abstract ? stripJats(m.abstract) : '',
  };
}

export async function fetchCrossref(doi: string, timeoutMs = 8000): Promise<CrossrefWork | null> {
  const clean = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim();
  if (!clean) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`, {
      signal: ctl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return parseCrossref(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** A work is citable only if it has authors, a year and a container; otherwise it is not cited. */
export function toRef(w: CrossrefWork, key: string): Ref | null {
  if (!w.authors.length || !w.year || !w.title) return null;
  const type: Ref['type'] = /book$|monograph/.test(w.type) ? 'book' : 'article';
  if (type === 'article' && !w.container) return null;
  return {
    key,
    type,
    authors: w.authors.length > 8 ? w.authors.slice(0, 6) : w.authors,
    etAl: w.authors.length > 8,
    year: w.year,
    title: w.title,
    container: w.container || undefined,
    volume: w.volume || undefined,
    issue: w.issue || undefined,
    pages: w.pages || undefined,
    doi: w.doi,
    status: 'resolved',
  };
}

/**
 * Conservative extraction of corpus facts that an abstract states explicitly. Nothing is inferred:
 * a figure is returned only if a number sits directly next to a document noun, a period only if
 * two years are joined by a dash or "to".
 */
export function extractCorpusFacts(abstract: string): {
  docs: number | null;
  docsText: string | null;
  period: [number, number] | null;
} {
  const t = (abstract || '').replace(/\s+/g, ' ');
  const dm = t.match(
    /\b(\d{1,3}(?:[,\u202f ]\d{3})+|\d{2,6})\s+(?:(?:peer-reviewed|scientific|scholarly|research|indexed|relevant|unique|original)\s+)?(publications|documents|papers|articles|records|studies|items)\b/i
  );
  const pm = t.match(/\b((?:19|20)\d{2})\s*(?:–|—|-|to|and)\s*((?:19|20)\d{2})\b/);
  const docs = dm ? parseInt(dm[1].replace(/[,\u202f ]/g, ''), 10) : null;
  const y0 = pm ? parseInt(pm[1], 10) : 0;
  const y1 = pm ? parseInt(pm[2], 10) : 0;
  return {
    docs,
    docsText: dm ? `${dm[1]} ${dm[2].toLowerCase()}` : null,
    period: pm && y1 >= y0 ? [y0, y1] : null,
  };
}
