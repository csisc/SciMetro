/**
 * Scientometric indicators beyond the basics. All functions are pure and deterministic so they
 * can be unit-tested (see tests/scientometrics.test.ts).
 *
 * Sources of the definitions:
 *  - Characteristic scores and scales: Glänzel & Schubert (1988), J. Information Science 14.
 *  - Relative citation rate with year-stratified expectation: Schubert & Braun (1986),
 *    Scientometrics 9; Braun, Glänzel & Schubert (1990).
 *  - h-index: Hirsch (2005); g-index: Egghe (2006); A-, R-indices: Jin (2007), Jin et al. (2007).
 *  - Gini / concentration: Egghe & Rousseau (1990); Bradford multiplier: Egghe (1990).
 *  - Salton cosine normalisation: Glänzel (2001); Leydesdorff & Vaughan (2006); van Eck & Waltman (2009).
 *  - Probabilistic affinity index: Zitt, Bassecoulard & Okubo (2000).
 *  - Modularity clustering (greedy agglomeration): Clauset, Newman & Moore (2004).
 *  - Rao-Stirling diversity: Stirling (2007); Leydesdorff & Rafols (2011).
 */
import type {
  Publication,
  CharacteristicScores,
  HIndexFamily,
  Concentration,
  GrowthModels,
  PeriodRow,
  RelativeImpactRow,
  NetworkAnalysis,
  DiversityIndices,
  ScientometricNetwork,
  ScreeningReport,
} from '../types';

const round = (x: number, d = 2) => +x.toFixed(d);

// ---------------------------------------------------------------------------------------------
// Concentration
// ---------------------------------------------------------------------------------------------

/** Gini coefficient (0 = perfectly even, (n-1)/n = all mass on one unit). */
export function gini(values: number[]): number {
  const x = values.filter((v) => v >= 0).sort((a, b) => a - b);
  const n = x.length;
  const sum = x.reduce((a, b) => a + b, 0);
  if (n === 0 || sum === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * x[i];
  return (2 * cum) / (n * sum) - (n + 1) / n;
}

export function concentration(values: number[]): Concentration {
  const x = values.filter((v) => v >= 0).sort((a, b) => b - a);
  const n = x.length;
  const total = x.reduce((a, b) => a + b, 0);
  const share = (frac: number) => {
    if (!n || !total) return 0;
    const k = Math.max(1, Math.ceil(n * frac));
    return round((100 * x.slice(0, k).reduce((a, b) => a + b, 0)) / total, 1);
  };
  return {
    n,
    gini: round(gini(x), 3),
    top10PctShare: share(0.1),
    top15PctShare: share(0.15),
    top20PctShare: share(0.2),
    top50PctShare: share(0.5),
  };
}

/** Spearman rank correlation with mid-ranks for ties. Returns null for fewer than 3 pairs. */
export function spearman(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const ranks = (v: number[]) => {
    const idx = v.map((val, i) => [val, i] as [number, number]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length).fill(0);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const mid = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = mid;
      i = j + 1;
    }
    return r;
  };
  const rx = ranks(xs.slice(0, n));
  const ry = ranks(ys.slice(0, n));
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  return sxx && syy ? round(sxy / Math.sqrt(sxx * syy), 3) : null;
}

// ---------------------------------------------------------------------------------------------
// h-index family
// ---------------------------------------------------------------------------------------------

/**
 * h, g, A and R. The g-index follows Egghe's definition: the corpus is conceptually padded with
 * zero-citation papers, so g can exceed the number of papers (g <= sqrt(total citations)).
 */
export function hIndexFamily(cites: number[]): HIndexFamily {
  const c = [...cites].sort((a, b) => b - a);
  const total = c.reduce((a, b) => a + b, 0);
  let h = 0;
  while (h < c.length && c[h] >= h + 1) h++;

  let g = 0;
  let cum = 0;
  const maxG = Math.floor(Math.sqrt(total));
  for (let k = 1; k <= maxG; k++) {
    cum += k <= c.length ? c[k - 1] : 0;
    if (cum >= k * k) g = k;
  }

  const core = c.slice(0, h).reduce((a, b) => a + b, 0);
  return {
    h,
    g,
    a: h ? round(core / h, 2) : 0,
    r: round(Math.sqrt(core), 2),
    hCoreSharePct: total ? round((100 * core) / total, 1) : 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Characteristic scores and scales (Glänzel & Schubert 1988)
// ---------------------------------------------------------------------------------------------

export function characteristicScores(cites: number[]): CharacteristicScores | null {
  const all = cites.filter((c) => Number.isFinite(c) && c >= 0);
  if (all.length < 10) return null;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

  const b1 = mean(all);
  const s1 = all.filter((c) => c >= b1);
  if (!s1.length) return null;
  const b2 = mean(s1);
  const s2 = all.filter((c) => c >= b2);
  if (!s2.length) return null;
  const b3 = mean(s2);

  const total = all.reduce((a, b) => a + b, 0) || 1;
  const bucket = (lo: number, hi: number) => all.filter((c) => c >= lo && c < hi);
  const defs: [string, string, number[]][] = [
    ['Poorly cited', `< ${round(b1, 2)}`, bucket(-Infinity, b1)],
    ['Fairly cited', `${round(b1, 2)} – ${round(b2, 2)}`, bucket(b1, b2)],
    ['Remarkably cited', `${round(b2, 2)} – ${round(b3, 2)}`, bucket(b2, b3)],
    ['Outstandingly cited', `≥ ${round(b3, 2)}`, bucket(b3, Infinity)],
  ];
  return {
    beta1: round(b1, 2),
    beta2: round(b2, 2),
    beta3: round(b3, 2),
    classes: defs.map(([label, rule, arr]) => ({
      label,
      rule,
      docs: arr.length,
      docsPct: round((100 * arr.length) / all.length, 1),
      citationsPct: round((100 * arr.reduce((a, b) => a + b, 0)) / total, 1),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Year-cohort normalised impact (Schubert-Braun relative citation rate; top-10% share)
// ---------------------------------------------------------------------------------------------

/** Mean citations per publication year. Cohorts smaller than `minCohort` are not used. */
export function expectedCitationsByYear(ref: Publication[], minCohort = 5): Map<number, number> {
  const acc = new Map<number, { n: number; c: number }>();
  ref.forEach((r) => {
    if (!r.year) return;
    const e = acc.get(r.year) || { n: 0, c: 0 };
    e.n++;
    e.c += r.cites || 0;
    acc.set(r.year, e);
  });
  const out = new Map<number, number>();
  acc.forEach((e, y) => {
    if (e.n >= minCohort && e.c > 0) out.set(y, e.c / e.n);
  });
  return out;
}

/**
 * RCR = sum of observed citations / sum of expected citations over the unit's works whose year
 * cohort is large enough. 1.0 means "cited as the reference set is, for the same years".
 */
export function relativeCitationRate(
  unit: Publication[],
  expected: Map<number, number>
): { rcr: number | null; used: number } {
  let obs = 0;
  let exp = 0;
  let used = 0;
  unit.forEach((r) => {
    const e = expected.get(r.year);
    if (!e) return;
    obs += r.cites || 0;
    exp += e;
    used++;
  });
  return { rcr: exp > 0 ? round(obs / exp, 2) : null, used };
}

/** Mid-rank percentile (0..1) of each work among its year cohort. */
export function percentileByWork(ref: Publication[], minCohort = 10): Map<string, number> {
  const byYear = new Map<number, Publication[]>();
  ref.forEach((r) => {
    if (!r.year) return;
    const a = byYear.get(r.year) || [];
    a.push(r);
    byYear.set(r.year, a);
  });
  const out = new Map<string, number>();
  byYear.forEach((arr) => {
    if (arr.length < minCohort) return;
    arr.forEach((r) => {
      const c = r.cites || 0;
      const below = arr.filter((x) => (x.cites || 0) < c).length;
      const equal = arr.filter((x) => (x.cites || 0) === c).length;
      out.set(r.id, (below + 0.5 * equal) / arr.length);
    });
  });
  return out;
}

/** Share (%) of the unit's works in the top 10% of their year cohort (cited at least once). */
export function top10Share(unit: Publication[], pct: Map<string, number>): number | null {
  const eligible = unit.filter((r) => pct.has(r.id));
  if (!eligible.length) return null;
  const hit = eligible.filter((r) => (pct.get(r.id) || 0) >= 0.9 && (r.cites || 0) > 0).length;
  return round((100 * hit) / eligible.length, 1);
}

export function impactRows(
  groups: Map<string, Publication[]>,
  ref: Publication[],
  minWorks = 3,
  limit = 10
): RelativeImpactRow[] {
  const expected = expectedCitationsByYear(ref);
  const pct = percentileByWork(ref);
  return [...groups.entries()]
    .filter(([, arr]) => arr.length >= minWorks)
    .map(([name, arr]) => {
      const total = arr.reduce((a, r) => a + (r.cites || 0), 0);
      return {
        name,
        works: arr.length,
        cpp: round(total / arr.length, 1),
        rcr: relativeCitationRate(arr, expected).rcr,
        top10Pct: top10Share(arr, pct),
      };
    })
    .sort((a, b) => b.works - a.works)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------------------------
// Growth models
// ---------------------------------------------------------------------------------------------

/** Two-sided 95% Student-t critical value (Cornish-Fisher expansion; exact table for df <= 4). */
export function tCrit975(df: number): number {
  const table: Record<number, number> = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776 };
  if (df <= 4) return table[Math.max(1, Math.floor(df))];
  const z = 1.959964;
  const g1 = (z ** 3 + z) / 4;
  const g2 = (5 * z ** 5 + 16 * z ** 3 + 3 * z) / 96;
  const g3 = (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / 384;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3;
}

/**
 * Compares exponential (log-linear) and linear growth on the same years (years with output).
 * Both have two parameters, so the lower residual sum of squares on the count scale is also the
 * lower AIC. The exponential rate is reported with a 95% confidence interval.
 */
export function fitGrowthModels(points: [number, number][]): GrowthModels | null {
  const pts = points.filter(([, y]) => y > 0);
  const n = pts.length;
  if (n < 5) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const Sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (Sxx === 0) return null;

  // exponential via OLS on ln(y)
  const ly = ys.map(Math.log);
  const mly = ly.reduce((a, b) => a + b, 0) / n;
  const b = xs.reduce((a, x, i) => a + (x - mx) * (ly[i] - mly), 0) / Sxx;
  const a0 = mly - b * mx;
  const rssLog = ly.reduce((a, v, i) => a + (v - (a0 + b * xs[i])) ** 2, 0);
  const se = Math.sqrt(rssLog / (n - 2) / Sxx);
  const t = tCrit975(n - 2);
  const rssExp = ys.reduce((a, y, i) => a + (y - Math.exp(a0 + b * xs[i])) ** 2, 0);

  // linear on counts
  const my = ys.reduce((a, c) => a + c, 0) / n;
  const bl = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / Sxx;
  const al = my - bl * mx;
  const rssLin = ys.reduce((a, y, i) => a + (y - (al + bl * xs[i])) ** 2, 0);
  const sst = ys.reduce((a, y) => a + (y - my) ** 2, 0);

  return {
    n,
    exponential: {
      ratePct: round(100 * (Math.exp(b) - 1), 2),
      ciLowPct: round(100 * (Math.exp(b - t * se) - 1), 2),
      ciHighPct: round(100 * (Math.exp(b + t * se) - 1), 2),
      r2Count: sst ? round(1 - rssExp / sst, 3) : 0,
      rss: round(rssExp, 2),
    },
    linear: {
      slopePerYear: round(bl, 3),
      r2Count: sst ? round(1 - rssLin / sst, 3) : 0,
      rss: round(rssLin, 2),
    },
    preferred: rssExp <= rssLin ? 'exponential' : 'linear',
  };
}

// ---------------------------------------------------------------------------------------------
// Period table (Ho-style 5- or 10-year windows)
// ---------------------------------------------------------------------------------------------

export function chooseWidth(spanYears: number): number {
  return spanYears <= 10 ? 2 : spanYears <= 35 ? 5 : 10;
}

export function periodTable(
  recs: Publication[],
  currentYear: number
): { rows: PeriodRow[]; width: number; excludedCurrentYear: number } {
  const complete = recs.filter((r) => r.year && r.year < currentYear);
  const excludedCurrentYear = recs.filter((r) => r.year && r.year >= currentYear).length;
  if (!complete.length) return { rows: [], width: 5, excludedCurrentYear };
  const years = complete.map((r) => r.year);
  const minY = Math.min(...years);
  const maxY = Math.max(...years);
  const width = chooseWidth(maxY - minY + 1);
  const start0 = Math.floor(minY / width) * width;
  const rows: PeriodRow[] = [];
  for (let s = start0; s <= maxY; s += width) {
    const e = s + width - 1;
    const arr = complete.filter((r) => r.year >= s && r.year <= e);
    if (!arr.length) continue;
    const cites = arr.reduce((a, r) => a + (r.cites || 0), 0);
    const withAuth = arr.filter((r) => r.authors.length > 0);
    rows.push({
      label: `${Math.max(s, minY)}–${Math.min(e, maxY)}`,
      docs: arr.length,
      sharePct: round((100 * arr.length) / complete.length, 1),
      citations: cites,
      cpp: round(cites / arr.length, 1),
      // citations per year of exposure, counting the publication year as year 1
      cpy: round(
        arr.reduce((a, r) => a + (r.cites || 0) / Math.max(1, currentYear - r.year + 1), 0) / arr.length,
        2
      ),
      authorsPerDoc: withAuth.length
        ? round(withAuth.reduce((a, r) => a + r.authors.length, 0) / withAuth.length, 2)
        : 0,
      multiAuthorPct: withAuth.length
        ? round((100 * withAuth.filter((r) => r.authors.length > 1).length) / withAuth.length, 1)
        : 0,
      partial: e > maxY || s < minY,
    });
  }
  return { rows, width, excludedCurrentYear };
}

// ---------------------------------------------------------------------------------------------
// Bradford multiplier
// ---------------------------------------------------------------------------------------------

export function bradfordMultiplier(s1: number, s2: number, s3: number) {
  return {
    k1: s1 > 0 && s2 > 0 ? round(s2 / s1, 2) : null,
    k2: s2 > 0 && s3 > 0 ? round(s3 / s2, 2) : null,
    sourcesZone: [s1, s2, s3] as [number, number, number],
  };
}

// ---------------------------------------------------------------------------------------------
// Network analysis: normalisation, centrality, modularity communities
// ---------------------------------------------------------------------------------------------

/** Adds Salton cosine and probabilistic affinity to each edge. Node weight = number of works. */
export function enrichEdges(net: ScientometricNetwork, totalDocs: number): ScientometricNetwork {
  const occ = new Map(net.nodes.map((n) => [n.id, Math.max(1, n.weight)]));
  const edges = net.edges.map((e) => {
    const oi = occ.get(e.source) || 1;
    const oj = occ.get(e.target) || 1;
    return {
      ...e,
      cosine: round(Math.min(1, e.weight / Math.sqrt(oi * oj)), 3),
      affinity: totalDocs ? round((e.weight * totalDocs) / (oi * oj), 2) : undefined,
    };
  });
  return { nodes: net.nodes, edges };
}

function adjacency(net: ScientometricNetwork) {
  const ids = net.nodes.map((n) => n.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const adj: Map<number, number>[] = ids.map(() => new Map());
  net.edges.forEach((e) => {
    const u = idx.get(e.source);
    const v = idx.get(e.target);
    if (u === undefined || v === undefined || u === v) return;
    adj[u].set(v, (adj[u].get(v) || 0) + e.weight);
    adj[v].set(u, (adj[v].get(u) || 0) + e.weight);
  });
  return { ids, adj };
}

function betweenness(adj: Map<number, number>[]): number[] {
  const n = adj.length;
  const cb = new Array(n).fill(0);
  for (let s = 0; s < n; s++) {
    const stack: number[] = [];
    const pred: number[][] = Array.from({ length: n }, () => []);
    const sigma = new Array(n).fill(0);
    const dist = new Array(n).fill(-1);
    sigma[s] = 1;
    dist[s] = 0;
    const q = [s];
    while (q.length) {
      const v = q.shift()!;
      stack.push(v);
      adj[v].forEach((_, w) => {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          q.push(w);
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      });
    }
    const delta = new Array(n).fill(0);
    while (stack.length) {
      const w = stack.pop()!;
      pred[w].forEach((v) => {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      });
      if (w !== s) cb[w] += delta[w];
    }
  }
  // undirected: each pair counted twice; normalise to [0,1]
  const norm = n > 2 ? ((n - 1) * (n - 2)) : 1;
  return cb.map((v) => v / norm);
}

function components(adj: Map<number, number>[]): number {
  const seen = new Array(adj.length).fill(false);
  let c = 0;
  for (let i = 0; i < adj.length; i++) {
    if (seen[i]) continue;
    c++;
    const q = [i];
    seen[i] = true;
    while (q.length) {
      const v = q.pop()!;
      adj[v].forEach((_, w) => {
        if (!seen[w]) {
          seen[w] = true;
          q.push(w);
        }
      });
    }
  }
  return c;
}

function transitivity(adj: Map<number, number>[]): number {
  let triangles = 0;
  let triples = 0;
  for (let v = 0; v < adj.length; v++) {
    const nb = [...adj[v].keys()];
    const k = nb.length;
    triples += (k * (k - 1)) / 2;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (adj[nb[i]].has(nb[j])) triangles++;
  }
  return triples ? triangles / triples : 0; // each triangle is counted once per vertex => 3T / triples
}

/** Weighted modularity of a partition: Q = sum_c [ L_c/m - (d_c / 2m)^2 ]. */
export function modularity(adj: Map<number, number>[], comm: number[]): number | null {
  let twoM = 0;
  adj.forEach((m) => m.forEach((w) => (twoM += w)));
  if (twoM === 0) return null;
  const m = twoM / 2;
  const internal = new Map<number, number>();
  const degree = new Map<number, number>();
  adj.forEach((nbrs, i) => {
    let d = 0;
    nbrs.forEach((w, j) => {
      d += w;
      if (comm[i] === comm[j]) internal.set(comm[i], (internal.get(comm[i]) || 0) + w / 2);
    });
    degree.set(comm[i], (degree.get(comm[i]) || 0) + d);
  });
  let q = 0;
  new Set(comm).forEach((c) => {
    q += (internal.get(c) || 0) / m - ((degree.get(c) || 0) / twoM) ** 2;
  });
  return q;
}

/** Greedy modularity agglomeration (Clauset-Newman-Moore); deterministic tie-breaking. */
export function greedyCommunities(adj: Map<number, number>[]): number[] {
  const n = adj.length;
  let twoM = 0;
  adj.forEach((m) => m.forEach((w) => (twoM += w)));
  const comm = Array.from({ length: n }, (_, i) => i);
  if (twoM === 0) return comm;

  const e = new Map<string, number>(); // e_ij between communities (fraction of edge ends)
  const a = new Array(n).fill(0);
  const key = (i: number, j: number) => (i < j ? `${i}|${j}` : `${j}|${i}`);
  adj.forEach((nbrs, i) => {
    nbrs.forEach((w, j) => {
      a[i] += w / twoM;
      if (i < j) e.set(key(i, j), w / twoM);
    });
  });

  let bestQ = modularity(adj, comm) ?? 0;
  let bestComm = [...comm];
  const alive = new Set(comm);
  for (;;) {
    let bi = -1;
    let bj = -1;
    let bd = -Infinity;
    [...e.keys()].sort().forEach((k) => {
      const [i, j] = k.split('|').map(Number);
      if (!alive.has(i) || !alive.has(j)) return;
      const dq = 2 * (e.get(k)! - a[i] * a[j]);
      if (dq > bd + 1e-12) {
        bd = dq;
        bi = i;
        bj = j;
      }
    });
    if (bi < 0 || bd <= 1e-12) break;
    // merge bj into bi
    for (const [k, v] of [...e.entries()]) {
      const [i, j] = k.split('|').map(Number);
      if (i === bj || j === bj) {
        const other = i === bj ? j : i;
        e.delete(k);
        if (other !== bi) e.set(key(bi, other), (e.get(key(bi, other)) || 0) + v);
      }
    }
    e.delete(key(bi, bj));
    a[bi] += a[bj];
    alive.delete(bj);
    for (let v = 0; v < n; v++) if (comm[v] === bj) comm[v] = bi;
    const q = modularity(adj, comm) ?? 0;
    if (q > bestQ) {
      bestQ = q;
      bestComm = [...comm];
    }
  }
  return bestComm;
}

export function analyseNetwork(net: ScientometricNetwork): NetworkAnalysis {
  const { ids, adj } = adjacency(net);
  const n = ids.length;
  const edgeCount = adj.reduce((a, m) => a + m.size, 0) / 2;
  const comm = greedyCommunities(adj);
  const q = modularity(adj, comm);
  const bc = betweenness(adj);

  const groups = new Map<number, number[]>();
  comm.forEach((c, i) => groups.set(c, [...(groups.get(c) || []), i]));
  const nameOf = (i: number) => net.nodes[i].name;
  const communities = [...groups.values()]
    .filter((m) => m.length >= 2)
    .sort((x, y) => y.length - x.length)
    .map((m, k) => ({
      id: k + 1,
      size: m.length,
      members: [...m].sort((x, y) => net.nodes[y].weight - net.nodes[x].weight).map(nameOf),
    }));

  const centrality = ids
    .map((id, i) => ({
      id,
      name: nameOf(i),
      degree: adj[i].size,
      strength: [...adj[i].values()].reduce((a, b) => a + b, 0),
      betweenness: round(bc[i], 3),
    }))
    .sort((x, y) => y.betweenness - x.betweenness || y.strength - x.strength);

  return {
    nodes: n,
    edges: edgeCount,
    density: n > 1 ? round((2 * edgeCount) / (n * (n - 1)), 3) : 0,
    avgDegree: n ? round((2 * edgeCount) / n, 2) : 0,
    components: n ? components(adj) : 0,
    transitivity: round(transitivity(adj), 3),
    modularity: q == null ? null : round(q, 3),
    communities,
    centrality,
  };
}

// ---------------------------------------------------------------------------------------------
// Diversity of the topic profile (Shannon, Simpson, Rao-Stirling)
// ---------------------------------------------------------------------------------------------

export function diversity(docTerms: string[][], topM = 40): DiversityIndices | null {
  const freq = new Map<string, number>();
  docTerms.forEach((ts) => new Set(ts).forEach((t) => freq.set(t, (freq.get(t) || 0) + 1)));
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, topM);
  if (top.length < 3) return null;
  const total = top.reduce((a, [, f]) => a + f, 0);
  const p = top.map(([, f]) => f / total);
  const shannon = -p.reduce((a, v) => a + v * Math.log(v), 0);
  const simpson = 1 - p.reduce((a, v) => a + v * v, 0);

  const idx = new Map(top.map(([t], i) => [t, i]));
  const co: number[][] = top.map(() => top.map(() => 0));
  docTerms.forEach((ts) => {
    const u = [...new Set(ts)].map((t) => idx.get(t)).filter((v): v is number => v !== undefined);
    for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) {
      co[u[i]][u[j]]++;
      co[u[j]][u[i]]++;
    }
  });
  let rs = 0;
  for (let i = 0; i < top.length; i++) for (let j = 0; j < top.length; j++) {
    if (i === j) continue;
    const cos = co[i][j] / Math.sqrt(top[i][1] * top[j][1]);
    rs += p[i] * p[j] * (1 - Math.min(1, cos));
  }
  return {
    terms: top.length,
    shannon: round(shannon, 3),
    evenness: round(shannon / Math.log(top.length), 3),
    simpson: round(simpson, 3),
    raoStirling: round(rs, 3),
  };
}

// ---------------------------------------------------------------------------------------------
// Record screening
// ---------------------------------------------------------------------------------------------

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Removes non-article items and duplicates and diagnoses citation-ranked truncation.
 *  1. journal-like items: a "work" whose title equals the venue label of other records
 *     (e.g. the journal item "Cancer Research" itself);
 *  2. duplicates by DOI, then by identical long title (preprint vs. published version);
 *     the record with most citations is kept (citations are not summed).
 */
export function screenRecords(recs: Publication[]): { kept: Publication[]; report: ScreeningReport } {
  const removed: ScreeningReport['removed'] = [];
  const note = (reason: string, items: Publication[]) => {
    if (items.length)
      removed.push({ reason, count: items.length, examples: items.slice(0, 3).map((r) => r.title.slice(0, 80)) });
  };

  const venues = new Set(recs.map((r) => norm(r.venue)).filter((v) => v.length >= 4));
  const journalLike = recs.filter((r) => venues.has(norm(r.title)));
  let kept = recs.filter((r) => !venues.has(norm(r.title)));
  note('Journal/venue item rather than an article', journalLike);

  const better = (a: Publication, b: Publication) =>
    (a.cites || 0) > (b.cites || 0) || ((a.cites || 0) === (b.cites || 0) && a.authors.length > b.authors.length);

  const dropped: Publication[] = [];
  const dedupe = (keyOf: (r: Publication) => string | null) => {
    const best = new Map<string, Publication>();
    const out: Publication[] = [];
    kept.forEach((r) => {
      const k = keyOf(r);
      if (!k) return void out.push(r);
      const cur = best.get(k);
      if (!cur) return void best.set(k, r);
      if (better(r, cur)) {
        dropped.push(cur);
        best.set(k, r);
      } else dropped.push(r);
    });
    kept = [...out, ...best.values()];
  };
  const before = dropped.length;
  dedupe((r) => (r.doi ? `doi:${r.doi.toLowerCase().trim()}` : null));
  const byDoi = dropped.slice(before);
  note('Duplicate DOI', byDoi);
  const mid = dropped.length;
  dedupe((r) => {
    const t = norm(r.title);
    return t.length >= 30 ? `t:${t}` : null;
  });
  note('Duplicate title (preprint/published version)', dropped.slice(mid));

  const uncited = kept.filter((r) => !(r.cites > 0)).length;
  const uncitedPct = kept.length ? round((100 * uncited) / kept.length, 1) : null;
  return {
    kept,
    report: {
      received: recs.length,
      removed,
      included: kept.length,
      uncitedPct,
      // With Wikidata-internal citation counts most works are uncited. A near-zero uncited share in
      // a sizeable corpus is the signature of a sample selected on citation counts.
      citationSelectionFlag: kept.length >= 50 && uncitedPct !== null && uncitedPct < 5,
    },
  };
}
