import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { parseBlocks, parseInline, extractMath } from '../src/services/markdown';

test('a heading directly followed by its paragraph is NOT merged into the title', () => {
  const b = parseBlocks('### 2.1 Growth of the literature\nScientific output has grown.\nIt continues.\n\n**H1.** Next.');
  assert.deepEqual(b[0], { type: 'heading', level: 3, text: '2.1 Growth of the literature' });
  assert.deepEqual(b[1], { type: 'paragraph', text: 'Scientific output has grown. It continues.' });
  assert.equal(b[2].type, 'paragraph');
});

test('all heading levels, rules and abstract', () => {
  const b = parseBlocks('# T\n\n### Abstract\n\nText of abstract.\n\n## 1. Intro\n\n#### 4.4.1 Sub\n\n---\n');
  assert.equal(b[0].type, 'heading');
  assert.deepEqual(b[1], { type: 'abstract', text: 'Text of abstract.' });
  assert.deepEqual(b.map((x) => x.type), ['heading', 'abstract', 'heading', 'heading', 'rule']);
  assert.equal((b[3] as any).level, 4);
});

test('lists keep their items; wrapped lines are joined', () => {
  const b = parseBlocks('Intro line.\n\n1. **Growth:** first\n   continued\n2. **Citation:** second\n\n- a\n- b\n');
  const lists = b.filter((x) => x.type === 'list') as any[];
  assert.equal(lists.length, 2);
  assert.deepEqual(lists[0].items, ['**Growth:** first continued', '**Citation:** second']);
  assert.equal(lists[0].ordered, true);
  assert.deepEqual(lists[1].items, ['a', 'b']);
});

test('tables: caption attached, alignment and escaped pipes', () => {
  const b = parseBlocks('**Table 3.** Caption here\n\n| A | B |\n|:--|--:|\n| x \\| y | 2 |\n| z | 3 |\n\n*Note.*');
  const t = b[0] as any;
  assert.equal(t.type, 'table');
  assert.equal(t.caption, '**Table 3.** Caption here');
  assert.deepEqual(t.align, ['l', 'r']);
  assert.deepEqual(t.rows[0], ['x | y', '2']);
  assert.equal(b[1].type, 'paragraph');
});

test('display math, single and multi-line, with tags', () => {
  const b = parseBlocks('$$ a = b \\tag{1} $$\n\nText.\n\n$$\nr = e^{\\beta} - 1\n\\tag{2}\n$$\n');
  assert.deepEqual(b[0], { type: 'math', tex: 'a = b \\tag{1}' });
  assert.equal(b[2].type, 'math');
  assert.match((b[2] as any).tex, /^r = e\^\{\\beta\} - 1\n\\tag\{2\}$/);
});

test('figure caption is bundled with the Mermaid diagram even across a blank line inside the fence', () => {
  const b = parseBlocks('**Figure 3.** *Caption:*\n\n```mermaid\ngraph LR\n\n  A --> B\n```\n\nNext paragraph.');
  const f = b[0] as any;
  assert.equal(f.type, 'figure');
  assert.equal(f.n, 3);
  assert.ok(f.mermaid.includes('A --> B') && f.mermaid.startsWith('graph LR'));
  assert.equal(b[1].type, 'paragraph');
  assert.equal(b.length, 2);
});

test('block quote', () => {
  const b = parseBlocks('> **Warning — truncated.** Text\n> continues.');
  assert.deepEqual(b[0], { type: 'quote', text: '**Warning — truncated.** Text continues.' });
});

test('inline: bold, italic, code, math, links, placeholders, escapes', () => {
  const i = parseInline('**Bold** and *ital* with `wdt:P921`, $r = e^{\\beta}$ see https://doi.org/10.1/x. [Authors: fill in] \\* star');
  const kinds = i.map((x) => x.t);
  assert.ok(['bold', 'italic', 'code', 'math', 'link', 'placeholder'].every((k) => kinds.includes(k as any)));
  const link = i.find((x) => x.t === 'link') as any;
  assert.equal(link.href, 'https://doi.org/10.1/x'); // trailing period is not part of the URL
  assert.ok(i.some((x) => x.t === 'text' && x.v.includes('* star')));
});

test('inline: italic spanning a placeholder and containing math with an asterisk-free body', () => {
  const i = parseInline('*[Authors: read the works in Table 1.]* and *draft with $x_{ij}$ inside*');
  assert.equal(i[0].t, 'italic');
  assert.equal((i[0] as any).c[0].t, 'placeholder');
  assert.ok((i[2] as any).c.some((x: any) => x.t === 'math'));
});

test('inline: currency-like single dollar is not math', () => {
  const i = parseInline('costs $5 and then $10 more');
  assert.ok(!i.some((x) => x.t === 'math'));
});

test('Table cells and abstract keep inline structure available', () => {
  const b = parseBlocks('| a |\n|---|\n| **x** |\n');
  assert.equal(parseInline((b[0] as any).rows[0][0])[0].t, 'bold');
});

test('every TeX expression the generator can produce is valid for KaTeX', async () => {
  // generate a manuscript and validate all math in it (throwOnError: true)
  const { computeStudyStats } = await import('../src/services/stats');
  const { generatePaperWithLlm } = await import('../src/services/llm');
  let seed = 9; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const recs: any[] = Array.from({ length: 200 }, (_, i) => ({
    id: 'w' + i, title: 'Paper ' + i, year: 2000 + (i % 20), venue: 'J' + (i % 12), doi: '10.1/' + i, omid: 'Q' + i, cites: Math.floor(r() * 30),
    authors: Array.from({ length: 1 + (i % 3) }, () => ({ k: 'a' + Math.floor(r() * 60), name: 'A', aff: 'I', country: 'France' })), keywords: ['alpha topic', 'beta topic'], origin: 'search',
  }));
  const stats = computeStudyStats(recs, { currentYear: 2026 });
  const md = await generatePaperWithLlm('X', 'Q1', 'x', stats, [], { db: 'W', qleverUrl: 'u', mx: 99999, llmProvider: 'synthesizer', md: 'm', rp: '', pt: '' } as any, () => {}, {});
  const math = extractMath(md);
  assert.ok(math.length >= 10, `only ${math.length} formulas found`);
  for (const m of math) {
    assert.doesNotThrow(() => katex.renderToString(m.tex, { displayMode: m.display, throwOnError: true, strict: 'error' }), `invalid TeX: ${m.tex}`);
  }
  assert.ok(math.some((m) => m.display), 'no displayed equations');
  // every tag is sequential and every "Eq. (n)" refers to an existing tag
  const tags = math.filter((m) => m.display).map((m) => (m.tex.match(/\\tag\{(\d+)\}/) || [])[1]).filter(Boolean).map(Number);
  assert.deepEqual(tags, tags.map((_, i) => i + 1));
  for (const m of md.matchAll(/Eqs?\. \((\d+)\)/g)) assert.ok(tags.includes(+m[1]), `dangling equation reference ${m[0]}`);
});
