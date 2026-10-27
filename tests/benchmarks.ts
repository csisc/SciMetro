/**
 * Programmatic comparison of computed indicators with specific, checkable findings from the
 * scientometric literature. Each row carries a pre-stated decision rule; the discussion text is
 * generated from the outcome, never asserted in advance.
 *
 * Benchmark values used here and where they come from:
 *  - Growth of science: 4.10% per year overall (doubling time 17.3 years) in Bornmann, Haunschild &
 *    Mutz (2021); 8–9% per year in the post-war phase in Bornmann & Mutz (2015).
 *  - Team size: mean authors per paper rose from 1.9 to 3.5 over 45 years in science and
 *    engineering (Wuchty, Jones & Uzzi, 2007).
 *  - Citation skewness: 15% of a journal's articles collect 50% of its citations and the most cited
 *    half about 90% (Seglen, 1992).
 *  - Lotka's law: exponent close to 2 (Lotka, 1926).
 *  - Bradford's law: zones in the proportion 1 : k : k² (Bradford, 1934).
 *  - Modularity: values of about 0.3 to 0.7 are typical of networks with clear community structure
 *    (Newman & Girvan, 2004).
 */
import type { StudyStats } from '../types';
import type { Citer } from './references';
import { spearman } from './scientometrics';

export type Outcome = 'supported' | 'not supported' | 'not assessable' | 'consistent' | 'not consistent';

export interface BenchRow {
  id: string;
  expectation: string; // what the literature leads us to expect (with citations)
  observed: string;
  outcome: Outcome;
  discussion: string; // sentence(s) for the Discussion, with citations
  isHypothesis: boolean;
}

const f = (x: number | null | undefined, d = 2) => (x == null ? 'n/a' : String(+x.toFixed(d)));

export function compareWithLiterature(s: StudyStats, c: Citer): BenchRow[] {
  const rows: BenchRow[] = [];

  // ---- H1: growth ------------------------------------------------------------------------
  {
    const g = s.growthModels?.exponential;
    const exp = `The annual growth rate of the literature is compatible with published growth rates of science, 4.1% per year overall ${c.p('bornmann2021')} to 8–9% in the post-war phase ${c.p('bornmann2015')}, i.e. its 95% confidence interval intersects 4.1–9%.`;
    if (!g) {
      rows.push({ id: 'H1', expectation: exp, observed: 'Too few years with output to fit a growth model.', outcome: 'not assessable', discussion: `Growth could not be compared with the 4.1% and 8–9% rates reported for science as a whole ${c.p('bornmann2021', 'bornmann2015')} because too few years had output.`, isHypothesis: true });
    } else {
      const overlap = g.ciLowPct <= 9 && g.ciHighPct >= 4.1;
      const above = g.ciLowPct > 9;
      const below = g.ciHighPct < 4.1;
      const rel = overlap
        ? 'its interval overlaps the range of published rates'
        : above
        ? 'the whole interval lies above the post-war rate'
        : below
        ? 'the whole interval lies below the long-run overall rate'
        : 'it falls between the two published rates';
      rows.push({
        id: 'H1',
        expectation: exp,
        observed: `${g.ratePct}% per year (95% CI ${g.ciLowPct}% to ${g.ciHighPct}%, ${s.growthModels!.n} years)`,
        outcome: overlap ? 'supported' : 'not supported',
        discussion: `The fitted exponential growth rate is ${g.ratePct}% per year (95% CI ${g.ciLowPct}% to ${g.ciHighPct}%); ${rel}. ${c.n('bornmann2021')} estimate 4.10% for science as a whole (doubling time 17.3 years) and ${c.n('bornmann2015')} report 8–9% for the post-war phase. The comparison is indicative only: those rates describe all publications in large multidisciplinary databases, whereas the present series covers one topic and reflects the growth of Wikidata's own coverage as well as of research output.`,
        isHypothesis: true,
      });
    }
  }

  // ---- H2: Lotka ---------------------------------------------------------------------------
  {
    const l = s.lotkaFit;
    const exp = `Author productivity follows Lotka's law ${c.p('lotka1926')} with an exponent between 1.5 and 2.5, tested by maximum likelihood and a Kolmogorov–Smirnov test ${c.p('clauset2009')}.`;
    if (!l) {
      rows.push({ id: 'H2', expectation: exp, observed: 'Too few distinct productivity levels among resolved authors to fit.', outcome: 'not assessable', discussion: `Lotka's law ${c.p('lotka1926')} could not be tested because the corpus has too few authors with resolved identities and distinct productivity levels.`, isHypothesis: true });
    } else {
      const inRange = l.alpha >= 1.5 && l.alpha <= 2.5;
      const ok = l.conforms && inRange;
      rows.push({
        id: 'H2',
        expectation: exp,
        observed: `α = ${l.alpha}, KS D = ${l.ks} (critical ${l.ksCritical}), n = ${l.nAuthors} authors`,
        outcome: ok ? 'supported' : 'not supported',
        discussion: l.conforms
          ? `The productivity distribution is compatible with a Lotka-type law (KS D = ${l.ks} below the critical value ${l.ksCritical}), with a fitted exponent of ${l.alpha}${inRange ? `, close to the classical value of 2 ${c.p('lotka1926')}` : `, outside the 1.5–2.5 band around the classical value of 2 ${c.p('lotka1926')}; exponents vary across fields and data sets ${c.p('egghe2005')}`}.`
          : `The productivity distribution departs from a Lotka-type law (KS D = ${l.ks} exceeds the critical value ${l.ksCritical}); the classical exponent of 2 ${c.p('lotka1926')} is therefore not a good description of authors resolved in Wikidata, where incomplete author lists and the absence of name disambiguation distort the counts.`,
        isHypothesis: true,
      });
    }
  }

  // ---- H3: Bradford ------------------------------------------------------------------------
  {
    const b = s.bradfordMultiplier;
    const exp = `Sources scatter into three zones of equal yield whose sizes grow geometrically (1 : k : k²) ${c.p('bradford1934')}, so the two multipliers agree to within 25%.`;
    if (!b || b.k1 == null || b.k2 == null) {
      rows.push({ id: 'H3', expectation: exp, observed: 'Multipliers not computable.', outcome: 'not assessable', discussion: `Bradford's law ${c.p('bradford1934')} could not be assessed because the corpus has too few sources with a recorded venue.`, isHypothesis: true });
    } else {
      const rel = Math.abs(b.k1 - b.k2) / ((b.k1 + b.k2) / 2);
      const ok = rel <= 0.25;
      rows.push({
        id: 'H3',
        expectation: exp,
        observed: `k₁ = ${b.k1}, k₂ = ${b.k2} (${b.sourcesZone.join(' : ')} sources; relative difference ${f(100 * rel, 0)}%)`,
        outcome: ok ? 'supported' : 'not supported',
        discussion: ok
          ? `The zone multipliers (k₁ = ${b.k1}, k₂ = ${b.k2}) agree within ${f(100 * rel, 0)}%, as Bradford's geometric scattering ${c.p('bradford1934')} predicts.`
          : `The zone multipliers (k₁ = ${b.k1}, k₂ = ${b.k2}) differ by ${f(100 * rel, 0)}%, so the distribution departs from the pure geometric form of Bradford's law ${c.p('bradford1934')}; such departures are common when the core is small or the tail is truncated ${c.p('eggherousseau1990')}.`,
        isHypothesis: true,
      });
    }
  }

  // ---- H4: teams ---------------------------------------------------------------------------
  {
    const rowsP = (s.periods || []).filter((p) => p.authorsPerDoc > 0 && !p.partial);
    const exp = `Team size increases over time ${c.p('wuchty2007')}: authors per work are positively rank-correlated with period (Spearman ρ ≥ 0.5, at least 4 periods) and higher in the last than in the first period.`;
    // A constant series has no defined rank correlation; with enough periods that is evidence of no trend.
    const rho = rowsP.length >= 4 ? spearman(rowsP.map((_, i) => i), rowsP.map((p) => p.authorsPerDoc)) ?? 0 : null;
    if (rho == null) {
      rows.push({ id: 'H4', expectation: exp, observed: 'Fewer than four complete periods with resolved authors.', outcome: 'not assessable', discussion: `The rise in team size reported by Wuchty et al. ${c.p('wuchty2007')} could not be tested: fewer than four complete periods have works with resolved authors.`, isHypothesis: true });
    } else {
      const first = rowsP[0].authorsPerDoc;
      const last = rowsP[rowsP.length - 1].authorsPerDoc;
      const ok = rho >= 0.5 && last > first;
      rows.push({
        id: 'H4',
        expectation: exp,
        observed: `Authors per work ${first} → ${last} across ${rowsP.length} periods (ρ = ${rho})`,
        outcome: ok ? 'supported' : 'not supported',
        discussion: ok
          ? `Authors per work rise from ${first} to ${last} across ${rowsP.length} periods (Spearman ρ = ${rho}), in line with the growth of team size documented by ${c.n('wuchty2007')}, who report an increase from 1.9 to 3.5 authors per paper over 45 years in science and engineering. Because only authors resolved in Wikidata are counted, the values here are lower bounds.`
          : `Authors per work move from ${first} to ${last} across ${rowsP.length} periods (Spearman ρ = ${rho}), which does not reproduce the sustained rise in team size reported by ${c.n('wuchty2007')}. Incomplete author lists in Wikidata, which cap the observable team size, are a likely contributor.`,
        isHypothesis: true,
      });
    }
  }

  // ---- H5: citation skewness -----------------------------------------------------------------
  {
    const cc = s.citationConcentration;
    const exp = `Citations are highly skewed ${c.p('seglen1992', 'price1976')}: the 15% most cited works receive at least 50% of all citations.`;
    if (!cc || cc.n < 30) {
      rows.push({ id: 'H5', expectation: exp, observed: 'Fewer than 30 works.', outcome: 'not assessable', discussion: `Citation skewness ${c.p('seglen1992')} could not be assessed on fewer than 30 works.`, isHypothesis: true });
    } else {
      const ok = cc.top15PctShare >= 50;
      rows.push({
        id: 'H5',
        expectation: exp,
        observed: `Top 15% hold ${cc.top15PctShare}% and top 50% hold ${cc.top50PctShare}% of citations (Gini ${cc.gini})`,
        outcome: ok ? 'supported' : 'not supported',
        discussion: `The 15% most cited works receive ${cc.top15PctShare}% of citations and the most cited half ${cc.top50PctShare}% (Gini = ${cc.gini}). ${c.n('seglen1992')} found that 15% of a journal's articles collect 50% of its citations and the most cited half about 90%; ${ok ? 'the present distribution is at least as concentrated' : 'the present distribution is less concentrated'}${s.screening?.citationSelectionFlag ? ', although the sample appears to be selected on citation counts, which makes this comparison unreliable' : ''}. Cumulative advantage ${c.p('merton1968', 'price1976')} is the usual explanation for such skewness.`,
        isHypothesis: true,
      });
    }
  }

  // ---- N1: community structure (descriptive) ----------------------------------------------
  {
    const k = s.networkAnalysis?.keyword;
    if (k && k.modularity != null) {
      const typical = k.modularity >= 0.3;
      rows.push({
        id: 'N1',
        expectation: `Networks with clear community structure typically have modularity between about 0.3 and 0.7 ${c.p('newman2004')}.`,
        observed: `Q = ${k.modularity} (${k.communities.length} clusters of ≥ 2 terms)`,
        outcome: typical ? 'consistent' : 'not consistent',
        discussion: typical
          ? `The subject-term network has modularity Q = ${k.modularity}, within the range typical of networks with community structure ${c.p('newman2004')}, so the thematic clusters reported in Table 25 are not an artefact of random co-occurrence.`
          : `The subject-term network has modularity Q = ${k.modularity}, below the range typical of networks with clear community structure ${c.p('newman2004')}; the clusters in Table 25 should be read as tentative.`,
        isHypothesis: false,
      });
    }
  }

  return rows;
}

export function benchmarkTable(rows: BenchRow[]): string {
  const clean = (x: string) => x.replace(/\|/g, '/');
  return (
    `| ID | Expectation from the literature | Observed | Outcome |\n|---|---|---|---|\n` +
    rows.map((r) => `| ${r.id} | ${clean(r.expectation)} | ${clean(r.observed)} | ${r.outcome} |`).join('\n') +
    '\n\n'
  );
}
