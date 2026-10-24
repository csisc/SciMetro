/**
 * Reference bank and author–year citation engine.
 *
 * Rules that keep generated manuscripts honest:
 *  - A citation key must exist in the bank (or be registered for this manuscript); unknown keys
 *    throw, so a citation can never silently point to nothing.
 *  - The reference list contains exactly the works cited in the text.
 *  - `status: 'verified'` means the bibliographic record was checked against an independent
 *    source (publisher, DBLP, RePEc, arXiv, Crossref) when the bank was compiled;
 *    `status: 'standard'` means a classic reference entered from knowledge and NOT re-checked:
 *    the authors must confirm it against the publisher record before submission.
 */

export interface Ref {
  key: string;
  type: 'article' | 'book' | 'chapter';
  authors: string[]; // "Surname, I. J."
  etAl?: boolean; // author list truncated on purpose
  year: number;
  title: string;
  container?: string; // journal or book title
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  editors?: string;
  doi?: string;
  status: 'verified' | 'standard' | 'resolved'; // resolved = fetched from Crossref at run time
}

const A = (r: Omit<Ref, 'type'> & { type?: Ref['type'] }): Ref => ({ type: 'article', ...r } as Ref);

export const REFS: Record<string, Ref> = Object.fromEntries(
  (
    [
      // ---- verified against independent records -------------------------------------------
      A({ key: 'bornmann2015', authors: ['Bornmann, L.', 'Mutz, R.'], year: 2015, title: 'Growth rates of modern science: A bibliometric analysis based on the number of publications and cited references', container: 'Journal of the Association for Information Science and Technology', volume: '66', issue: '11', pages: '2215–2222', doi: '10.1002/asi.23329', status: 'verified' }),
      A({ key: 'bornmann2021', authors: ['Bornmann, L.', 'Haunschild, R.', 'Mutz, R.'], year: 2021, title: 'Growth rates of modern science: A latent piecewise growth curve approach to model publication numbers from established and new literature databases', container: 'Humanities and Social Sciences Communications', volume: '8', pages: '224', doi: '10.1057/s41599-021-00903-w', status: 'verified' }),
      A({ key: 'wuchty2007', authors: ['Wuchty, S.', 'Jones, B. F.', 'Uzzi, B.'], year: 2007, title: 'The increasing dominance of teams in production of knowledge', container: 'Science', volume: '316', issue: '5827', pages: '1036–1039', status: 'verified' }),
      A({ key: 'seglen1992', authors: ['Seglen, P. O.'], year: 1992, title: 'The skewness of science', container: 'Journal of the American Society for Information Science', volume: '43', issue: '9', pages: '628–638', status: 'verified' }),
      A({ key: 'visser2021', authors: ['Visser, M.', 'van Eck, N. J.', 'Waltman, L.'], year: 2021, title: 'Large-scale comparison of bibliographic data sources: Scopus, Web of Science, Dimensions, Crossref, and Microsoft Academic', container: 'Quantitative Science Studies', volume: '2', issue: '1', pages: '20–41', doi: '10.1162/qss_a_00112', status: 'verified' }),
      { key: 'nielsen2017', type: 'chapter', authors: ['Nielsen, F. Å.', 'Mietchen, D.', 'Willighagen, E.'], year: 2017, title: 'Scholia, scientometrics and Wikidata', container: 'The Semantic Web: ESWC 2017 satellite events (Lecture Notes in Computer Science, vol. 10577)', editors: 'Blomqvist, E., Hose, K., & Paulheim, H.', pages: '237–259', publisher: 'Springer', doi: '10.1007/978-3-319-70407-4_36', status: 'verified' },

      // ---- classic references (not re-checked in the compilation session) --------------------
      A({ key: 'lotka1926', authors: ['Lotka, A. J.'], year: 1926, title: 'The frequency distribution of scientific productivity', container: 'Journal of the Washington Academy of Sciences', volume: '16', issue: '12', pages: '317–323', status: 'standard' }),
      A({ key: 'bradford1934', authors: ['Bradford, S. C.'], year: 1934, title: 'Sources of information on specific subjects', container: 'Engineering', volume: '137', pages: '85–86', status: 'standard' }),
      { key: 'price1963', type: 'book', authors: ['Price, D. J. de S.'], year: 1963, title: 'Little science, big science', publisher: 'Columbia University Press', status: 'standard' },
      A({ key: 'price1976', authors: ['Price, D. J. de S.'], year: 1976, title: 'A general theory of bibliometric and other cumulative advantage processes', container: 'Journal of the American Society for Information Science', volume: '27', issue: '5', pages: '292–306', status: 'standard' }),
      A({ key: 'merton1968', authors: ['Merton, R. K.'], year: 1968, title: 'The Matthew effect in science', container: 'Science', volume: '159', issue: '3810', pages: '56–63', status: 'standard' }),
      A({ key: 'subramanyam1983', authors: ['Subramanyam, K.'], year: 1983, title: 'Bibliometric studies of research collaboration: A review', container: 'Journal of Information Science', volume: '6', issue: '1', pages: '33–38', status: 'standard' }),
      A({ key: 'ajiferuke1988', authors: ['Ajiferuke, I.', 'Burrell, Q.', 'Tague, J.'], year: 1988, title: 'Collaborative coefficient: A single measure of the degree of collaboration in research', container: 'Scientometrics', volume: '14', issue: '5–6', pages: '421–433', status: 'standard' }),
      A({ key: 'hirsch2005', authors: ['Hirsch, J. E.'], year: 2005, title: 'An index to quantify an individual’s scientific research output', container: 'Proceedings of the National Academy of Sciences', volume: '102', issue: '46', pages: '16569–16572', status: 'standard' }),
      A({ key: 'egghe2006', authors: ['Egghe, L.'], year: 2006, title: 'Theory and practise of the g-index', container: 'Scientometrics', volume: '69', issue: '1', pages: '131–152', status: 'standard' }),
      A({ key: 'jin2007', authors: ['Jin, B.', 'Liang, L.', 'Rousseau, R.', 'Egghe, L.'], year: 2007, title: 'The R- and AR-indices: Complementing the h-index', container: 'Chinese Science Bulletin', volume: '52', issue: '6', pages: '855–863', status: 'standard' }),
      A({ key: 'glanzel2001', authors: ['Glänzel, W.'], year: 2001, title: 'National characteristics in international scientific co-authorship relations', container: 'Scientometrics', volume: '51', issue: '1', pages: '69–115', status: 'standard' }),
      A({ key: 'glanzelschubert1988', authors: ['Glänzel, W.', 'Schubert, A.'], year: 1988, title: 'Characteristic scores and scales in assessing citation impact', container: 'Journal of Information Science', volume: '14', issue: '2', pages: '123–127', status: 'standard' }),
      A({ key: 'schubertbraun1986', authors: ['Schubert, A.', 'Braun, T.'], year: 1986, title: 'Relative indicators and relational charts for comparative assessment of publication output and citation impact', container: 'Scientometrics', volume: '9', issue: '5–6', pages: '281–291', status: 'standard' }),
      { key: 'eggherousseau1990', type: 'book', authors: ['Egghe, L.', 'Rousseau, R.'], year: 1990, title: 'Introduction to informetrics: Quantitative methods in library, documentation and information science', publisher: 'Elsevier', status: 'standard' },
      { key: 'egghe2005', type: 'book', authors: ['Egghe, L.'], year: 2005, title: 'Power laws in the information production process: Lotkaian informetrics', publisher: 'Elsevier Academic Press', status: 'standard' },
      A({ key: 'clauset2004', authors: ['Clauset, A.', 'Newman, M. E. J.', 'Moore, C.'], year: 2004, title: 'Finding community structure in very large networks', container: 'Physical Review E', volume: '70', issue: '6', pages: '066111', status: 'standard' }),
      A({ key: 'clauset2009', authors: ['Clauset, A.', 'Shalizi, C. R.', 'Newman, M. E. J.'], year: 2009, title: 'Power-law distributions in empirical data', container: 'SIAM Review', volume: '51', issue: '4', pages: '661–703', status: 'standard' }),
      A({ key: 'newman2004', authors: ['Newman, M. E. J.', 'Girvan, M.'], year: 2004, title: 'Finding and evaluating community structure in networks', container: 'Physical Review E', volume: '69', issue: '2', pages: '026113', status: 'standard' }),
      A({ key: 'newman2001', authors: ['Newman, M. E. J.'], year: 2001, title: 'The structure of scientific collaboration networks', container: 'Proceedings of the National Academy of Sciences', volume: '98', issue: '2', pages: '404–409', status: 'standard' }),
      A({ key: 'leydesdorffrafols2011', authors: ['Leydesdorff, L.', 'Rafols, I.'], year: 2011, title: 'Indicators of the interdisciplinarity of journals: Diversity, centrality, and citations', container: 'Journal of Informetrics', volume: '5', issue: '1', pages: '87–100', status: 'standard' }),
      A({ key: 'zitt2000', authors: ['Zitt, M.', 'Bassecoulard, E.', 'Okubo, Y.'], year: 2000, title: 'Shadows of the past in international cooperation: Collaboration profiles of the top five producers of science', container: 'Scientometrics', volume: '47', issue: '3', pages: '627–657', status: 'standard' }),
      A({ key: 'wagner2005', authors: ['Wagner, C. S.', 'Leydesdorff, L.'], year: 2005, title: 'Network structure, self-organization, and the growth of international collaboration in science', container: 'Research Policy', volume: '34', issue: '10', pages: '1608–1618', status: 'standard' }),
      A({ key: 'page2021', authors: ['Page, M. J.', 'McKenzie, J. E.', 'Bossuyt, P. M.'], etAl: true, year: 2021, title: 'The PRISMA 2020 statement: An updated guideline for reporting systematic reviews', container: 'BMJ', volume: '372', pages: 'n71', doi: '10.1136/bmj.n71', status: 'standard' }),
      A({ key: 'donthu2021', authors: ['Donthu, N.', 'Kumar, S.', 'Mukherjee, D.', 'Pandey, N.', 'Lim, W. M.'], year: 2021, title: 'How to conduct a bibliometric analysis: An overview and guidelines', container: 'Journal of Business Research', volume: '133', pages: '285–296', status: 'standard' }),
      A({ key: 'waltman2016', authors: ['Waltman, L.'], year: 2016, title: 'A review of the literature on citation impact indicators', container: 'Journal of Informetrics', volume: '10', issue: '2', pages: '365–391', status: 'standard' }),
      A({ key: 'vrandecic2014', authors: ['Vrandečić, D.', 'Krötzsch, M.'], year: 2014, title: 'Wikidata: A free collaborative knowledgebase', container: 'Communications of the ACM', volume: '57', issue: '10', pages: '78–85', status: 'standard' }),
      A({ key: 'waagmeester2020', authors: ['Waagmeester, A.', 'Stupp, G.', 'Burgstaller-Muehlbacher, S.'], etAl: true, year: 2020, title: 'Wikidata as a knowledge graph for the life sciences', container: 'eLife', volume: '9', pages: 'e52614', doi: '10.7554/eLife.52614', status: 'standard' }),
      A({ key: 'martinmartin2021', authors: ['Martín-Martín, A.', 'Thelwall, M.', 'Orduna-Malea, E.', 'Delgado López-Cózar, E.'], year: 2021, title: 'Google Scholar, Microsoft Academic, Scopus, Dimensions, Web of Science, and OpenCitations’ COCI: A multidisciplinary comparison of coverage via citations', container: 'Scientometrics', volume: '126', issue: '1', pages: '871–906', status: 'standard' }),
      A({ key: 'peroni2020', authors: ['Peroni, S.', 'Shotton, D.'], year: 2020, title: 'OpenCitations, an infrastructure organization for open scholarship', container: 'Quantitative Science Studies', volume: '1', issue: '1', pages: '428–444', status: 'standard' }),
    ] as Ref[]
  ).map((r) => [r.key, r])
);

const surname = (a: string) => a.split(',')[0].trim();

/** In-text label: "Lotka", "Glänzel and Schubert", "Wuchty et al." */
export function authorLabel(r: Ref): string {
  if (r.etAl || r.authors.length >= 3) return `${surname(r.authors[0])} et al.`;
  if (r.authors.length === 2) return `${surname(r.authors[0])} and ${surname(r.authors[1])}`;
  return surname(r.authors[0]);
}

export function formatAuthors(r: Ref): string {
  const a = r.authors;
  if (r.etAl) return `${a.join(', ')}, et al.`;
  if (a.length > 8) return `${a.slice(0, 6).join(', ')}, et al.`;
  if (a.length === 1) return a[0];
  return `${a.slice(0, -1).join(', ')}, & ${a[a.length - 1]}`;
}

export function formatReference(r: Ref, suffix = ''): string {
  const au = formatAuthors(r);
  const yr = `(${r.year}${suffix})`;
  const doi = r.doi ? ` https://doi.org/${r.doi}` : '';
  if (r.type === 'book') return `${au} ${yr}. *${r.title}*. ${r.publisher}.${doi}`;
  if (r.type === 'chapter')
    return `${au} ${yr}. ${r.title}. In ${r.editors} (Eds.), *${r.container}* (pp. ${r.pages}). ${r.publisher}.${doi}`;
  const vol = r.volume ? `, ${r.volume}` : '';
  const iss = r.issue ? `(${r.issue})` : '';
  const pg = r.pages ? `, ${r.pages}` : '';
  return `${au} ${yr}. ${r.title}. *${r.container || ''}*${vol}${iss}${pg}.${doi}`;
}

/** Collects the citations of one manuscript and renders the matching reference list. */
export class Citer {
  private used = new Set<string>();
  private extra = new Map<string, Ref>();
  private suffixes = new Map<string, string>();

  /** Registers works resolved at run time (e.g. via Crossref). */
  register(ref: Ref) {
    this.extra.set(ref.key, ref);
    this.assignSuffixes();
  }

  private all(): Ref[] {
    return [...Object.values(REFS), ...this.extra.values()];
  }

  private assignSuffixes() {
    const groups = new Map<string, Ref[]>();
    this.all().forEach((r) => {
      const k = `${authorLabel(r)}|${r.year}`;
      groups.set(k, [...(groups.get(k) || []), r]);
    });
    this.suffixes.clear();
    groups.forEach((rs) => {
      if (rs.length < 2) return;
      [...rs]
        .sort((a, b) => a.title.localeCompare(b.title))
        .forEach((r, i) => this.suffixes.set(r.key, String.fromCharCode(97 + i)));
    });
  }

  /** A citer with the same registered references but nothing marked as cited. */
  fresh(): Citer {
    const c = new Citer();
    this.extra.forEach((r) => c.register(r));
    return c;
  }

  has(key: string): boolean {
    return !!(this.extra.get(key) || REFS[key]);
  }

  private get(key: string): Ref {
    const r = this.extra.get(key) || REFS[key];
    if (!r) throw new Error(`Unknown reference key: "${key}"`);
    this.used.add(key);
    return r;
  }

  private tag(r: Ref) {
    return `${r.year}${this.suffixes.get(r.key) || ''}`;
  }

  /** Parenthetical citation: (Lotka 1926; Price 1963) */
  p(...keys: string[]): string {
    const rs = keys.map((k) => this.get(k)).sort((a, b) => a.year - b.year || authorLabel(a).localeCompare(authorLabel(b)));
    return `(${rs.map((r) => `${authorLabel(r)} ${this.tag(r)}`).join('; ')})`;
  }

  /** Narrative citation: Wuchty et al. (2007) */
  n(key: string): string {
    const r = this.get(key);
    return `${authorLabel(r)} (${this.tag(r)})`;
  }

  citedKeys(): string[] {
    return [...this.used];
  }

  list(): string {
    const rs = [...this.used].map((k) => this.extra.get(k) || REFS[k]);
    return rs
      .sort(
        (a, b) =>
          surname(a.authors[0]).localeCompare(surname(b.authors[0])) ||
          Number(a.etAl || a.authors.length > 1) - Number(b.etAl || b.authors.length > 1) || // single author first
          (a.authors[1] ? surname(a.authors[1]) : '').localeCompare(b.authors[1] ? surname(b.authors[1]) : '') ||
          a.year - b.year ||
          a.title.localeCompare(b.title)
      )
      .map((r) => formatReference(r, this.suffixes.get(r.key) || ''))
      .join('\n\n');
  }

  /** Replaces double-brace citation tokens (p: with comma-separated keys, n: with one key) so text built without a Citer can still cite. */
  resolve(text: string): string {
    return text
      .replace(/\{\{p:([a-z0-9:.,_-]+)\}\}/gi, (_, k: string) => this.p(...k.split(',')))
      .replace(/\{\{n:([a-z0-9:._-]+)\}\}/gi, (_, k: string) => this.n(k));
  }

  /** Keys cited that the authors must still check against the publisher record. */
  unverified(): string[] {
    return [...this.used].filter((k) => (this.extra.get(k) || REFS[k]).status === 'standard');
  }
}
