import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { computeStudyStats } from '../src/services/stats';
import { generatePaperWithLlm } from '../src/services/llm';

// Renders the real React component (through Vite, so CSS imports work) and inspects the DOM.
test('manuscript viewer: headings, paragraphs, lists, equations, tables, placeholders and figures render correctly', async () => {
  let seed = 4; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const recs: any[] = Array.from({ length: 260 }, (_, i) => ({
    id: 'w' + i, title: 'Paper ' + i, year: 1998 + (i % 24), venue: 'J' + (i % 15), doi: '10.1/' + i, omid: 'Q' + i, cites: Math.floor(r() * 40),
    authors: Array.from({ length: 1 + (i % 4) }, () => ({ k: 'a' + Math.floor(r() * 80), name: 'A', aff: 'I' + (i % 7), country: ['France', 'Italy', 'Spain'][i % 3] })),
    keywords: ['alpha', 'beta', 'gamma'][i % 3] ? [['alpha', 'beta', 'gamma'][i % 3], 'delta'] : [], origin: 'search',
  }));
  const stats = computeStudyStats(recs, { currentYear: 2026 });
  const md = await generatePaperWithLlm('Topic', 'Q1', 'topic', stats, [], { db: 'W', qleverUrl: 'u', mx: 99999, llmProvider: 'synthesizer', md: 'm', rp: '', pt: '' } as any, () => {}, {});

  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const mod: any = await vite.ssrLoadModule('/src/components/ManuscriptMarkdown.tsx');
    const html = renderToStaticMarkup(React.createElement(mod.ManuscriptMarkdown, { markdown: md, stats, topic: 'Topic' }));

    // 1. no heading element contains paragraph text (the original bug)
    const headings = [...html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
    assert.ok(headings.length > 20);
    assert.ok(headings.every((h) => h.length < 140), 'a heading swallowed a paragraph: ' + headings.find((h) => h.length >= 140)?.slice(0, 80));
    assert.ok(headings.some((h) => /Introduction/.test(h)) && headings.some((h) => /3\.2 Indicators/.test(h)));

    // 2. equations are typeset, none left as raw TeX, none failed
    assert.ok((html.match(/class="katex-display"/g) || []).length >= 12, 'displayed equations missing');
    assert.ok((html.match(/class="katex"/g) || []).length > 20, 'inline equations missing');
    assert.ok(!/\$\$|\\tag|\\frac|\\sum|katex-error/.test(html.replace(/<annotation[\s\S]*?<\/annotation>/g, '')), 'raw TeX or KaTeX error in output');

    // 3. no raw markdown markers in body text
    const text = html.replace(/<annotation[\s\S]*?<\/annotation>/g, '').replace(/<[^>]+>/g, ' ');
    assert.ok(!/\*\*[A-Za-z]/.test(text), 'unrendered bold markers');
    assert.ok(!/(^|\s)`[a-z]/.test(text), 'unrendered code markers');

    // 4. structure: lists, tables with captions, abstract card, placeholders, figure cards
    assert.ok(html.includes('<ol') && html.includes('<li'), 'no ordered list');
    assert.ok((html.match(/<table/g) || []).length >= 15, 'tables missing');
    assert.ok(html.includes('Abstract'));
    assert.ok(html.includes('<mark'), 'author placeholders are not highlighted');
    assert.ok(html.includes('<strong>Keywords:</strong>'));
    assert.ok(html.includes('<code'), 'inline code missing');
  } finally {
    await vite.close();
  }
});
