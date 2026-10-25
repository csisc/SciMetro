import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { build } from 'vite';

// Builds the real application and serves it the way GitHub Pages does for a project site
// (https://user.github.io/<repo>/), for a user site (root) and for a nested path.
// An absolute asset base ("/") passes at the root but returns 404 for every asset under /<repo>/.
test('the production build loads from the site root, a project site and a nested path', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'scimetro-dist-'));
  await build({ configFile: 'vite.config.ts', logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });

  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf-8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((r) => !r.startsWith('data:') && !/^https?:\/\//.test(r));
  assert.ok(refs.length >= 2, 'no script or stylesheet in index.html');
  assert.ok(refs.every((r) => r.startsWith('./')), `absolute asset URL in index.html: ${refs.filter((r) => !r.startsWith('./'))}`);

  // every url() in the stylesheets (KaTeX fonts, images) must be relative as well
  const assets = fs.readdirSync(path.join(out, 'assets'));
  for (const css of assets.filter((f) => f.endsWith('.css'))) {
    const text = fs.readFileSync(path.join(out, 'assets', css), 'utf-8');
    const urls = [...text.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/["']/g, '')).filter((u) => !u.startsWith('data:'));
    assert.ok(urls.length > 10, 'KaTeX font references expected in the stylesheet');
    assert.ok(urls.every((u) => !u.startsWith('/')), `absolute url() in ${css}: ${urls.find((u) => u.startsWith('/'))}`);
    urls.forEach((u) => assert.ok(fs.existsSync(path.join(out, 'assets', u.replace(/^\.\//, ''))), `missing file for ${u}`));
  }

  // serve under three prefixes and request what the page references
  for (const prefix of ['/', '/SciMetro/', '/a/b/']) {
    const server = http.createServer((req, res) => {
      const p = (req.url || '').split('?')[0];
      if (!p.startsWith(prefix)) return void ((res.statusCode = 404), res.end());
      const file = path.join(out, p.slice(prefix.length) || 'index.html');
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return void ((res.statusCode = 404), res.end());
      res.end(fs.readFileSync(file));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(server.address() as any).port}${prefix}`;
    try {
      const page = await fetch(base + 'index.html');
      assert.equal(page.status, 200, prefix);
      for (const r of refs) {
        const res = await fetch(new URL(r, base + 'index.html'));
        assert.equal(res.status, 200, `${prefix}: ${r} -> ${res.status}`);
      }
    } finally {
      server.close();
    }
  }
  fs.rmSync(out, { recursive: true, force: true });
});
