import type { StudyStats } from '../types';

// ---- Data-driven interpretation helpers: every verdict below comes from a computed test ----
export const fmt = (x: number | null | undefined, d = 1) => (x == null ? 'n/a' : String(+x.toFixed(d)));

export function lotkaSentence(s: StudyStats): string {
  const f = s.lotkaFit;
  if (!f) {
    return `Lotka's law could not be fitted: the corpus has too few distinct productivity levels or authors with resolved identities (author-level indicators here rest on only ${s.authors} resolved authors).`;
  }
  const base = `A maximum-likelihood fit of Lotka's law over ${f.nAuthors} authors (1 to ${f.maxWorks} works) gives α = ${f.alpha} (C = ${f.C}); the Kolmogorov–Smirnov statistic is D = ${f.ks} against a 1% critical value of ${f.ksCritical}`;
  return f.conforms
    ? `${base}, so the hypothesis that author productivity follows Lotka's law is not rejected.`
    : `${base}, so the hypothesis that author productivity follows Lotka's law is rejected at the 1% level${f.alpha < 1 ? ' (the fitted exponent is below 1, i.e. the distribution is flatter than any Lotka-type law)' : ''}.`;
}

export function priceSentence(s: StudyStats): string {
  const p = s.priceShare;
  if (!p || !p.totalAuthorships) return '';
  const verdict =
    p.sharePct >= 45
      ? 'consistent with'
      : 'well below';
  return `The √N = ${p.eliteAuthors} most productive authors account for ${p.sharePct}% of all authorships, ${verdict} the 50% that Price's law predicts.`;
}

export function collabSentence(s: StudyStats): string {
  const dc = s.degreeOfCollaboration;
  const level = dc >= 0.8 ? 'high' : dc >= 0.5 ? 'moderate' : 'low';
  return `Single-authored works make up ${s.singleAuthorPct}% of works with resolved authors (DC = ${dc}, a ${level} degree of collaboration; CC = ${s.collaborationCoefficient}).`;
}

export function growthSentence(s: StudyStats): string {
  const g = s.growthModels;
  if (!g) return '';
  const e = g.exponential;
  const wide = e.ciHighPct - e.ciLowPct > 2 * Math.max(5, Math.abs(e.ratePct));
  return `Comparing models on the ${g.n} years with output, the ${g.preferred} model fits better (R² on counts: exponential ${e.r2Count}, linear ${g.linear.r2Count}). The exponential rate is ${e.ratePct}% per year (95% CI ${e.ciLowPct}% to ${e.ciHighPct}%)${wide ? ', an interval too wide to support a precise growth rate' : ''}.`;
}

export function citationStructureText(s: StudyStats): string {
  const parts: string[] = [];
  const c = s.citationConcentration;
  if (s.css) {
    const [p, f, r, o] = s.css.classes;
    parts.push(
      `Characteristic scores and scales {{p:glanzelschubert1988}} give thresholds β₁ = ${s.css.beta1}, β₂ = ${s.css.beta2} and β₃ = ${s.css.beta3}. ${p.docsPct}% of works are poorly cited (${p.citationsPct}% of citations), ${f.docsPct}% fairly cited, ${r.docsPct}% remarkably cited and ${o.docsPct}% outstandingly cited; the outstandingly cited class alone receives ${o.citationsPct}% of all citations (Table 17).`
    );
  }
  if (c) {
    parts.push(
      `Citations are highly concentrated: the Gini coefficient is ${c.gini} and the 10% most cited works receive ${c.top10PctShare}% of all citations.`
    );
  }
  if (s.hFamily) {
    parts.push(
      `The h-core of ${s.hFamily.h} works holds ${s.hFamily.hCoreSharePct}% of citations (A = ${s.hFamily.a}, R = ${s.hFamily.r}).`
    );
  }
  if (s.screening?.uncitedPct != null) {
    parts.push(`${s.screening.uncitedPct}% of works are uncited within Wikidata.`);
  }
  return parts.join(' ');
}

export function periodText(s: StudyStats): string {
  const p = s.periods || [];
  if (p.length < 2) return '';
  const a = p[0];
  const b = p[p.length - 1];
  const peak = [...p].sort((x, y) => y.docs - x.docs)[0];
  return `Output by ${s.periodWidth}-year period (Table 19) rises from ${a.docs} works in ${a.label} to ${b.docs} in ${b.label}${b.partial ? ' (a partly covered period)' : ''}, peaking at ${peak.docs} in ${peak.label}. Citations per work are ${a.cpp} in the first and ${b.cpp} in the last period; adjusting for exposure time, they are ${a.cpy} and ${b.cpy} citations per work per year. Older works have had longer to be cited, so unadjusted citation counts favour early periods.`;
}

export function bradfordMultText(s: StudyStats): string {
  const b = s.bradfordMultiplier;
  if (!b || b.k1 == null || b.k2 == null) return '';
  const rel = Math.abs(b.k1 - b.k2) / ((b.k1 + b.k2) / 2);
  const verdict =
    rel <= 0.25
      ? 'the two multipliers agree within 25%, as a Bradford distribution (1 : k : k²) predicts'
      : 'the two multipliers differ by more than 25%, so the distribution departs from the pure geometric Bradford form';
  return `The zones contain ${b.sourcesZone.join(' : ')} sources; the Bradford multipliers are k₁ = ${b.k1} (zone 2/1) and k₂ = ${b.k2} (zone 3/2), and ${verdict}. The Gini coefficient of works per source is ${s.sourceConcentration?.gini ?? 'n/a'}. Works without a recorded venue (${s.docs - (s.worksWithVenue ?? s.docs)}) are excluded from this analysis.`;
}

export function clusterText(s: StudyStats): string {
  const k = s.networkAnalysis?.keyword;
  if (!k) return '';
  const nCl = k.communities.length;
  const strength = k.modularity == null ? 'not defined' : k.modularity >= 0.3 ? 'a clear community structure' : 'weak community structure';
  const excluded = (s.excludedTerms || []).filter(Boolean);
  return `Greedy modularity optimisation {{p:clauset2004}} splits the ${k.nodes} most frequent terms into ${nCl} clusters of two or more terms (Q = ${k.modularity ?? 'n/a'}, ${strength}; Table 25). Associations are ranked by Salton cosine to avoid frequency effects (Table 26).${excluded.length ? ` The search terms themselves (${excluded.slice(0, 5).join(', ')}) and generic words were removed so they do not dominate the map.` : ''}`;
}

export function screeningText(s: StudyStats): string {
  const sc = s.screening;
  if (!sc) return '';
  const u = sc.upstream;
  const steps: string[] = [];
  if (u) {
    steps.push(`${u.identified} records identified`);
    steps.push(`${u.duplicatesById} removed as duplicate Wikidata items`);
    steps.push(`${u.missingYearOrTitle} removed for missing year or title`);
  }
  sc.removed.forEach((r) => steps.push(`${r.count} removed as: ${r.reason.charAt(0).toLowerCase()}${r.reason.slice(1)}`));
  steps.push(`${sc.included} works analysed`);
  const flag = sc.citationSelectionFlag
    ? `\n\n> **Warning — citation-selected sample.** Only ${sc.uncitedPct}% of works are uncited, far below what is expected when citations are counted from Wikidata alone. This indicates that the retrieval was ranked and truncated by citation count. Citation, growth and concentration indicators are then not estimates for the whole literature.`
    : '';
  return `Screening flow: ${steps.join(' → ')}.${flag}\n\n`;
}


export function coverageTable(s: StudyStats): string {
  const c = s.coverage;
  if (!c) return '';
  const rows: [string, number][] = [
    ['Publication year', c.withYearPct],
    ['≥1 author resolved to a Wikidata item', c.withAuthorsPct],
    ['≥1 author with an institutional affiliation', c.withAffiliationPct],
    ['≥1 author with an identifiable country', c.withCountryPct],
    ['Publication venue', c.withVenuePct],
    ['DOI', c.withDoiPct],
    ['Subject keywords (P921)', c.withKeywordsPct],
    ['Cited at least once within Wikidata', c.citedPct],
  ];
  return (
    `**Table F2.** Metadata coverage of the analysed corpus (N = ${c.docs})\n\n| Field | Share of works (%) |\n|---|---|\n` +
    rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n') +
    `\n\n`
  );
}



/** Short form for summaries: verdict plus the two numbers behind it. */
export function lotkaShort(s: StudyStats): string {
  const f = s.lotkaFit;
  if (!f) return "Lotka's law could not be tested.";
  return `Lotka's law is ${f.conforms ? 'not rejected' : 'rejected'} (α = ${f.alpha}; Kolmogorov–Smirnov D = ${f.ks}, critical value ${f.ksCritical}).`;
}
