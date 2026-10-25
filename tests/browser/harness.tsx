// Test-only page, built with the production configuration, to exercise real browser behaviour.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { ManuscriptMarkdown } from '../../src/components/ManuscriptMarkdown';
import { CiteTool } from '../../src/components/CiteTool';
import { OllamaHelp } from '../../src/components/OllamaHelp';
import { probeOllama } from '../../src/services/ollama';
import { callOllama } from '../../src/services/llm';

const w = window as any;
const root = createRoot(document.getElementById('root')!);

w.__probe = (ctx: any) => probeOllama(ctx, undefined, 4000);
w.__call = async (settings: any) => {
  try {
    return { ok: true, text: await callOllama('hello', false, settings, { timeoutMs: 8000 }) };
  } catch (e: any) {
    return { ok: false, text: String(e.message) };
  }
};
w.__mount = (view: string, arg: any) => {
  if (view === 'manuscript') root.render(<div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }} className="font-serif text-sm space-y-3"><ManuscriptMarkdown markdown={arg.md} stats={arg.stats} topic="Topic" /></div>);
  if (view === 'cite') root.render(<div style={{ maxWidth: 980, margin: '0 auto', padding: 16 }}><CiteTool /></div>);
  if (view === 'help') root.render(<div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}><OllamaHelp origin={arg.origin} diag={arg.diag} /></div>);
  return new Promise((r) => setTimeout(r, 600));
};
w.__ready = true;
