import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import {
  diagnose, probeOllama, isLoopbackUrl, originOf, ollamaSetupSteps, loopbackInit, clearOllamaCache,
} from '../src/services/ollama';
import { callOllama } from '../src/services/llm';

const PAGE = 'https://someuser.github.io';
const ctx = { pageOrigin: PAGE, ollamaUrl: 'http://localhost:11434', model: 'qwen2.5:7b' };
const tags = (...m: string[]) => ({ tags: { kind: 'ok' as const, models: m } });

test('the page origin never carries a path (what OLLAMA_ORIGINS needs)', () => {
  assert.equal(originOf('https://someuser.github.io/SciMetro/?x=1#cite'), 'https://someuser.github.io');
  assert.ok(ollamaSetupSteps(PAGE).every((s) => s.commands.join(' ').includes(PAGE) || /then /.test(s.commands.join(' '))));
  assert.ok(!ollamaSetupSteps(PAGE).flatMap((s) => s.commands).some((c) => c.includes('/SciMetro')));
});

test('loopback detection and the Local Network Access hint', () => {
  ['http://localhost:11434', 'http://127.0.0.1:11434', 'http://[::1]:11434', 'http://0.0.0.0:11434'].forEach((u) => assert.ok(isLoopbackUrl(u), u));
  ['http://192.168.1.5:11434', 'https://ollama.example.org'].forEach((u) => assert.ok(!isLoopbackUrl(u), u));
  assert.deepEqual(loopbackInit('http://localhost:11434'), { targetAddressSpace: 'loopback' });
  assert.deepEqual(loopbackInit('https://ollama.example.org'), {});
});

test('diagnosis table: each cause gets its own title and fix', () => {
  assert.equal(diagnose(ctx, tags('qwen2.5:7b')).code, 'ok');
  // an untagged name means ":latest", exactly as Ollama resolves it
  assert.equal(diagnose({ ...ctx, model: 'qwen2.5' }, tags('qwen2.5:latest')).code, 'ok');
  assert.equal(diagnose({ ...ctx, model: 'qwen2.5' }, tags('qwen2.5')).code, 'ok');
  assert.equal(diagnose({ ...ctx, model: 'qwen2.5' }, tags('qwen2.5:7b')).code, 'model-missing');
  assert.equal(diagnose(ctx, tags('qwen2.5')).code, 'model-missing'); // :latest is not :7b
  const missing = diagnose(ctx, tags('llama3:8b'));
  assert.equal(missing.code, 'model-missing');
  assert.ok(missing.steps[0].includes('ollama pull qwen2.5:7b') && missing.steps[1].includes('llama3:8b'));

  const forbidden = diagnose(ctx, { tags: { kind: 'http', status: 403 } });
  assert.equal(forbidden.code, 'cors');
  assert.ok(forbidden.steps[0].includes(`OLLAMA_ORIGINS="${PAGE}" ollama serve`));

  assert.equal(diagnose(ctx, { tags: { kind: 'http', status: 500, body: 'boom' } }).code, 'http-error');
  assert.equal(diagnose(ctx, { tags: { kind: 'timeout' } }).code, 'timeout');

  // network error: the no-cors probe separates "running but refusing this origin" from "nothing there"
  const cors = diagnose(ctx, { tags: { kind: 'network' }, reachable: true });
  assert.equal(cors.code, 'cors');
  assert.ok(cors.title.includes(PAGE));
  const down = diagnose(ctx, { tags: { kind: 'network' }, reachable: false });
  assert.equal(down.code, 'unreachable');
  assert.ok(down.steps.some((s) => /Local network access|Loopback network/.test(s)), 'Chrome permission hint for an https page');
  assert.ok(down.steps.some((s) => /Safari/.test(s)));
  // from a plain-http page the browser permission hint does not apply
  const local = diagnose({ ...ctx, pageOrigin: 'http://localhost:3000' }, { tags: { kind: 'network' }, reachable: false });
  assert.ok(!local.steps.some((s) => /Local network access/.test(s)));
});

test('an https page cannot reach plain-http Ollama on another machine (mixed content), whatever else is observed', () => {
  const remote = { ...ctx, ollamaUrl: 'http://192.168.1.20:11434' };
  const d = diagnose(remote, { tags: { kind: 'network' }, reachable: true });
  assert.equal(d.code, 'mixed-content');
  assert.ok(d.steps.some((s) => /npm run dev/.test(s)));
  assert.equal(diagnose({ ...remote, pageOrigin: 'http://localhost:3000' }, tags('qwen2.5:7b')).code, 'ok'); // fine from a local page
  assert.equal(diagnose({ ...remote, ollamaUrl: 'https://ollama.example.org' }, tags('qwen2.5:7b')).code, 'ok');
});

// ------------------------------------------------------------------ a mock that behaves like Ollama
function mockOllama(allowed: string[], models = ['qwen2.5:7b']) {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    hits.push(`${req.method} ${req.url} origin=${origin || '-'}`);
    if (origin && !/^(https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?)$/.test(origin) && !allowed.includes(origin)) {
      res.writeHead(403); // Ollama answers 403, without CORS headers, to origins it does not allow
      return void res.end();
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') { res.writeHead(204); return void res.end(); }
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') return void res.end(JSON.stringify({ models: models.map((name) => ({ name })) }));
    if (req.url === '/api/generate') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const m = JSON.parse(body).model;
        if (!models.includes(m)) { res.writeHead(404); return void res.end(JSON.stringify({ error: `model '${m}' not found` })); }
        res.end(JSON.stringify({ response: ' generated text ' }));
      });
      return;
    }
    res.end('Ollama is running');
  });
  return new Promise<{ url: string; close: () => void; hits: string[] }>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(server.address() as any).port}`, close: () => server.close(), hits }))
  );
}
const withOrigin = (origin: string) => (u: string, i?: RequestInit) => fetch(u, { ...i, headers: { ...(i?.headers as any), Origin: origin } });

test('probe against an Ollama-like server: allowed origin, refused origin, missing model', async () => {
  const ok = await mockOllama([PAGE]);
  const refused = await mockOllama([]);
  const noModel = await mockOllama([PAGE], ['llama3:8b']);
  try {
    assert.equal((await probeOllama({ ...ctx, ollamaUrl: ok.url }, withOrigin(PAGE))).code, 'ok');
    const r = await probeOllama({ ...ctx, ollamaUrl: refused.url }, withOrigin(PAGE));
    assert.equal(r.code, 'cors');
    assert.ok(r.steps[0].includes(`OLLAMA_ORIGINS="${PAGE}"`));
    assert.equal((await probeOllama({ ...ctx, ollamaUrl: noModel.url }, withOrigin(PAGE))).code, 'model-missing');
  } finally { ok.close(); refused.close(); noModel.close(); }
});

test('probe: nothing listening gives "unreachable"; a hung server gives "timeout"', async () => {
  const closed = await mockOllama([]);
  const url = closed.url; closed.close();
  assert.equal((await probeOllama({ ...ctx, ollamaUrl: url }, undefined, 2000)).code, 'unreachable');
  const hang = http.createServer(() => {});
  await new Promise<void>((r) => hang.listen(0, '127.0.0.1', () => r()));
  try {
    const d = await probeOllama({ ...ctx, ollamaUrl: `http://127.0.0.1:${(hang.address() as any).port}` }, undefined, 300);
    assert.equal(d.code, 'timeout');
  } finally { hang.closeAllConnections(); hang.close(); }
});

const settings: any = { ol: 'http://localhost:11434', md: 'qwen2.5:7b', llmProvider: 'ollama' };

test('callOllama: generation, missing model, refused origin and unreachable server each give an actionable message', async () => {
  clearOllamaCache();
  const ok = await mockOllama([PAGE]);
  const refused = await mockOllama([]);
  try {
    assert.equal(await callOllama('hi', false, { ...settings, ol: ok.url }, { fetchImpl: withOrigin(PAGE) }), 'generated text');
    await assert.rejects(callOllama('hi', false, { ...settings, ol: ok.url, md: 'nope:1b' }, { fetchImpl: withOrigin(PAGE) }), /ollama pull nope:1b/);
    await assert.rejects(callOllama('hi', false, { ...settings, ol: refused.url }, { fetchImpl: withOrigin(PAGE) }), /OLLAMA_ORIGINS=/);
  } finally { ok.close(); refused.close(); }
  clearOllamaCache();
  const down = await mockOllama([]); const url = down.url; down.close();
  await assert.rejects(callOllama('hi', false, { ...settings, ol: url }), /Nothing answered at/);
  // a browser-like TypeError with a reachable server is reported as an origin problem
  clearOllamaCache();
  const calls: string[] = [];
  const browserLike = async (u: string, i?: RequestInit) => {
    calls.push(`${i?.mode || 'cors'} ${u}`);
    if (i?.mode === 'no-cors') return new Response('', { status: 200 });
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(callOllama('hi', false, settings, { fetchImpl: browserLike }), /does not allow requests from/);
  assert.ok(calls.some((c) => c.startsWith('no-cors')), 'the no-cors probe was not used');
});

test('callOllama times out with a helpful message', async () => {
  const hang = http.createServer(() => {});
  await new Promise<void>((r) => hang.listen(0, '127.0.0.1', () => r()));
  try {
    await assert.rejects(callOllama('hi', false, { ...settings, ol: `http://127.0.0.1:${(hang.address() as any).port}` }, { timeoutMs: 300 }), /did not answer in time/);
  } finally { hang.closeAllConnections(); hang.close(); }
});

test('help panel shows the cause, the exact commands for the page origin and the browser hints', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const mod: any = await vite.ssrLoadModule('/src/components/OllamaHelp.tsx');
    const diag = diagnose(ctx, { tags: { kind: 'network' }, reachable: true });
    const html = renderToStaticMarkup(React.createElement(mod.OllamaHelp, { origin: PAGE, diag }));
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
    assert.ok(text.includes(`Ollama is running but does not allow requests from ${PAGE}`));
    assert.ok(text.includes(`launchctl setenv OLLAMA_ORIGINS "${PAGE}"`));
    assert.ok(text.includes(`Environment="OLLAMA_ORIGINS=${PAGE}"`));
    assert.ok(text.includes('setx OLLAMA_ORIGINS'));
    assert.ok(text.includes('allow access to local network devices'));
    assert.ok(html.includes('<details open'), 'the commands should be open when the cause is the origin');
  } finally { await vite.close(); }
});
