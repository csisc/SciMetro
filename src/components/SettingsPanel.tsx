import React, { useState } from 'react';
import { AppSettings } from '../types';
import { executeQLeverOnce, DEFAULT_QLEVER_ENDPOINT } from '../services/qlever';
import { Settings, Play, CheckCircle2, XCircle } from 'lucide-react';

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (key: keyof AppSettings, value: any) => void;
  onLog: (msg: string) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onChange, onLog }) => {
  const [testing, setTesting] = useState(false);
  const [diagResults, setDiagResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const runDiagnostics = async () => {
    setTesting(true);
    setDiagResults({});
    onLog(`--- connection test from ${window.location.origin} ---`);

    const testItem = async (
      name: string,
      fn: () => Promise<string | void>
    ) => {
      const t0 = performance.now();
      try {
        const extra = await fn();
        const duration = Math.round(performance.now() - t0);
        const info = `✓ ${name} (${duration} ms)${extra ? ' — ' + extra : ''}`;
        onLog(info);
        setDiagResults((prev) => ({
          ...prev,
          [name]: { ok: true, msg: `${duration} ms${extra ? ` (${extra})` : ''}` },
        }));
      } catch (err: any) {
        const info = `✗ ${name}: ${err.message}`;
        onLog(info);
        setDiagResults((prev) => ({
          ...prev,
          [name]: { ok: false, msg: err.message },
        }));
      }
    };

    // 1. Wikidata API
    await testItem('Wikidata API', async () => {
      const res = await fetch(
        'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q42&props=labels&format=json&origin=*'
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.entities?.Q42) throw new Error('Invalid response structure');
    });

    // 2. Wikidata QLever SPARQL endpoint
    await testItem('Wikidata QLever SPARQL', async () => {
      const endpoint = settings.qleverUrl || DEFAULT_QLEVER_ENDPOINT;
      await executeQLeverOnce('SELECT ?s WHERE { ?s ?p ?o } LIMIT 1', endpoint);
    });

    // 3. Wikidata Scholarly Articles Corpus
    await testItem('Wikidata Scholarly Corpus', async () => {
      const endpoint = settings.qleverUrl || DEFAULT_QLEVER_ENDPOINT;
      const rows = await executeQLeverOnce(
        'SELECT (COUNT(?s) AS ?count) WHERE { ?s wdt:P31 wd:Q13442814 }',
        endpoint
      );
      const count = rows[0]?.count;
      return count ? `${parseInt(count, 10).toLocaleString()} scholarly articles indexed` : 'reachable';
    });

    // 4. Ollama server
    await testItem('Ollama server', async () => {
      const base = settings.ol.replace(/\/$/, '');
      const res = await fetch(`${base}/api/tags`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const names = (data.models || []).map((m: any) => m.name);
      return names.includes(settings.md)
        ? `model ${settings.md} installed`
        : `reachable, but model "${settings.md}" not found; installed: ${names.join(', ') || 'none'}`;
    });

    setTesting(false);
  };

  return (
    <details className="scimetro-card mb-4 group" open={false}>
      <summary className="font-semibold cursor-pointer text-sm flex items-center justify-between text-[var(--fg)] select-none">
        <span className="flex items-center gap-1.5">
          <Settings className="w-4 h-4 text-[var(--mut)] group-open:text-[var(--ac)]" />
          Settings
        </span>
        <span className="text-xs text-[var(--mut)] font-normal font-mono">
          Wikidata QLever • {settings.llmProvider === 'synthesizer' ? 'Built-in Synthesizer' : settings.llmProvider === 'ollama' ? settings.md : 'Gemini'}
        </span>
      </summary>

      <div className="mt-4 pt-3 border-t border-[var(--bd)] space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs text-[var(--mut)] mb-1">Wikidata QLever SPARQL Endpoint</label>
            <input
              className="scimetro-input font-mono text-xs"
              value={settings.qleverUrl}
              onChange={(e) => onChange('qleverUrl', e.target.value)}
              placeholder="https://qlever.cs.uni-freiburg.de/api/wikidata"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs text-[var(--mut)] mb-1 font-semibold text-[var(--fg)]">
              LLM Engine & Paper Synthesizer
            </label>
            <select
              className="scimetro-input text-xs font-medium"
              value={settings.llmProvider || 'synthesizer'}
              onChange={(e) => onChange('llmProvider', e.target.value)}
            >
              <option value="synthesizer">Built-in Scholarly Synthesizer (Instant & Offline - Recommended)</option>
              <option value="ollama">Local Ollama (localhost:11434)</option>
              <option value="gemini">Gemini API</option>
            </select>
          </div>

          {settings.llmProvider === 'ollama' && (
            <>
              <div>
                <label className="block text-xs text-[var(--mut)] mb-1">Ollama URL</label>
                <input
                  className="scimetro-input"
                  value={settings.ol}
                  onChange={(e) => onChange('ol', e.target.value)}
                  placeholder="http://localhost:11434"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--mut)] mb-1">Ollama model</label>
                <input
                  className="scimetro-input"
                  value={settings.md}
                  onChange={(e) => onChange('md', e.target.value)}
                  placeholder="llama3.1:8b"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs text-[var(--mut)] mb-1">Max search results from QLever</label>
            <input
              type="number"
              className="scimetro-input"
              value={settings.mx}
              onChange={(e) => onChange('mx', parseInt(e.target.value, 10) || 100)}
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--mut)] mb-1">LLM relevance threshold (0–10)</label>
            <input
              type="number"
              min="0"
              max="10"
              className="scimetro-input"
              value={settings.th}
              onChange={(e) => onChange('th', parseInt(e.target.value, 10) || 5)}
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--mut)] mb-1">Wikidata languages</label>
            <input
              className="scimetro-input"
              value={settings.lg}
              onChange={(e) => onChange('lg', e.target.value)}
              placeholder="en,fr,ar,es,de"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--mut)] mb-1">GitHub repo (owner/name)</label>
            <input
              className="scimetro-input"
              value={settings.rp}
              onChange={(e) => onChange('rp', e.target.value)}
              placeholder="user/studies"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--mut)] mb-1">Folder in repo</label>
            <input
              className="scimetro-input"
              value={settings.pt}
              onChange={(e) => onChange('pt', e.target.value)}
              placeholder="studies"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--mut)] mb-1">GitHub token (session only)</label>
            <input
              type="password"
              className="scimetro-input"
              value={settings.tk}
              onChange={(e) => onChange('tk', e.target.value)}
              placeholder="fine-grained, contents:write"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={runDiagnostics}
            disabled={testing}
            className="scimetro-btn-ghost text-xs flex items-center gap-1.5"
          >
            <Play className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
            {testing ? 'Testing connections…' : 'Test connections'}
          </button>
        </div>

        {Object.keys(diagResults).length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 bg-[var(--bg)] p-3 rounded-lg border border-[var(--bd)] text-xs">
            {Object.entries(diagResults).map(([key, res]) => (
              <div key={key} className="flex items-start gap-1.5 overflow-hidden">
                {res.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--ok)] shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-[var(--er)] shrink-0 mt-0.5" />
                )}
                <div className="truncate">
                  <span className="font-medium text-[var(--fg)]">{key}: </span>
                  <span className={res.ok ? 'text-[var(--ok)]' : 'text-[var(--er)]'}>
                    {res.msg}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-[var(--mut)] leading-relaxed">
          Wikidata QLever provides high-speed SPARQL access across 46M+ scholarly articles. If using local Ollama, ensure it allows this origin:{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--bg)] border border-[var(--bd)] font-mono text-[11px]">
            OLLAMA_ORIGINS="{window.location.origin}" ollama serve
          </code>
        </p>
      </div>
    </details>
  );
};
