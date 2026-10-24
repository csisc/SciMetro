/**
 * Pre-submission checks. A generator cannot make a manuscript acceptable; it can report, honestly
 * and specifically, what still stands in the way. "blocker" = do not submit before resolving.
 */
import type { AppSettings, StudyStats } from '../types';
import type { Citer } from './references';
import { PLACEHOLDER_RE, wordCount } from './paper';

export interface Check {
  level: 'blocker' | 'warning' | 'info';
  id: string;
  message: string;
}

export function assessReadiness(a: {
  stats: StudyStats;
  settings: AppSettings;
  markdown: string;
  cite: Citer;
  priorTotal: number;
  priorResolved: number;
  hypothesesAssessed: number;
}): Check[] {
  const { stats: s, settings } = a;
  const out: Check[] = [];
  const add = (level: Check['level'], id: string, message: string) => out.push({ level, id, message });

  if (s.screening?.citationSelectionFlag)
    add('blocker', 'selection', 'The sample looks selected on citation counts (almost no uncited works); citation, growth and concentration results are not population estimates. Retrieve the full result set.');
  if ((s.origins['search'] || 0) >= settings.mx)
    add('blocker', 'truncated', `The topic search hit its limit of ${settings.mx} records. Raise the limit or paginate before drawing conclusions.`);
  if (s.docs < 30) add('blocker', 'size', `Only ${s.docs} works: distribution tests have too little power.`);
  else if (s.docs < 100) add('warning', 'size', `Only ${s.docs} works: interpret distribution tests cautiously.`);

  const c = s.coverage;
  if (c) {
    if (c.withAuthorsPct < 20) add('blocker', 'authors', `Only ${c.withAuthorsPct}% of works have resolved authors; author-level and collaboration indicators are not defensible.`);
    else if (c.withAuthorsPct < 50) add('warning', 'authors', `Only ${c.withAuthorsPct}% of works have resolved authors; state this prominently and avoid generalising.`);
    if (c.withCountryPct < 30) add('warning', 'country', `Only ${c.withCountryPct}% of works have an identifiable country; international collaboration results are weak.`);
    if (c.withKeywordsPct < 30) add('warning', 'keywords', `Only ${c.withKeywordsPct}% of works have subject keywords; the thematic analysis rests mostly on title words.`);
  }
  if ((s.growthYearsUsed ?? 0) < 8) add('warning', 'years', `Growth model rests on ${s.growthYearsUsed ?? 0} years; the confidence interval will be wide.`);
  if (s.docs && (s.excludedMissingYear || 0) / s.docs > 0.05) add('warning', 'missing-year', `${s.excludedMissingYear} works lack a publication year and were excluded.`);
  if (a.hypothesesAssessed < 3) add('warning', 'hypotheses', `Only ${a.hypothesesAssessed} of 5 hypotheses could be assessed.`);

  const ph = (a.markdown.match(PLACEHOLDER_RE) || []).length;
  if (ph) add('blocker', 'placeholders', `${ph} author placeholder(s) remain ([Authors: …]): declarations, critical appraisal of prior reviews and domain interpretation must be written by the authors.`);

  const unv = a.cite.unverified();
  if (unv.length) add('info', 'references', `${unv.length} classic references were entered from knowledge and not re-checked; confirm each against the publisher record: ${unv.join(', ')}.`);
  if (a.priorTotal > 0 && a.priorResolved < a.priorTotal)
    add('warning', 'prior', `${a.priorTotal - a.priorResolved} of ${a.priorTotal} prior review-type works could not be resolved to complete references and are not cited.`);

  const abs = a.markdown.match(/## Abstract\s+([\s\S]*?)\n\n\*\*Keywords/);
  if (abs && wordCount(abs[1]) > 250) add('warning', 'abstract', `Abstract has ${wordCount(abs[1])} words (limit about 250).`);
  return out.sort((x, y) => ({ blocker: 0, warning: 1, info: 2 }[x.level] - { blocker: 0, warning: 1, info: 2 }[y.level]));
}
