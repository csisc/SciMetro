import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { ollamaSetupSteps } from '../services/ollama';
import type { OllamaDiagnosis } from '../services/ollama';

const Cmd: React.FC<{ text: string }> = ({ text }) => {
  const [done, setDone] = useState(false);
  const isCommand = !/^then |^\[Service\]/.test(text);
  return (
    <div className="flex items-start gap-1.5">
      <code className="flex-1 px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--bd)] font-mono text-[11px] whitespace-pre-wrap break-all">{text}</code>
      {isCommand && (
        <button
          type="button"
          className="scimetro-btn-ghost p-1 shrink-0"
          aria-label="Copy command"
          onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
        >
          {done ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
};

/** Explains how to let this page talk to a local Ollama, and what the last test found. */
export const OllamaHelp: React.FC<{ origin: string; diag?: OllamaDiagnosis | null; defaultOpen?: boolean }> = ({ origin, diag, defaultOpen }) => {
  const secure = origin.startsWith('https:');
  return (
    <div className="rounded-lg border border-[var(--bd)] p-3 text-xs text-[var(--fg)] space-y-2" data-testid="ollama-help">
      {diag && !diag.ok && (
        <div className="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-300/60 p-2 space-y-1">
          <div className="font-semibold text-[var(--er)]">{diag.title}</div>
          <ol className="list-decimal pl-5 space-y-0.5">
            {diag.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      <details open={defaultOpen || (!!diag && !diag.ok && (diag.code === 'cors' || diag.code === 'unreachable'))}>
        <summary className="cursor-pointer font-semibold select-none">Using a local Ollama from this page ({origin})</summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>
            Ollama only accepts requests from <code>localhost</code>, <code>127.0.0.1</code> and <code>0.0.0.0</code> by default. This page is served from{' '}
            <code>{origin}</code>, so that origin has to be allowed (the origin has no path and no trailing slash), then Ollama restarted:
          </p>
          {ollamaSetupSteps(origin).map((o) => (
            <div key={o.label}>
              <div className="font-medium text-[var(--mut)] mb-0.5">{o.label}</div>
              <div className="space-y-1">
                {o.commands.map((c, i) => (
                  <Cmd key={i} text={c} />
                ))}
              </div>
            </div>
          ))}
          {secure && (
            <ul className="list-disc pl-5 space-y-0.5 text-[var(--mut)]">
              <li>Keep the Ollama URL at <code>http://localhost:11434</code>: an Ollama on another machine over plain http is blocked from an HTTPS page.</li>
              <li>Chrome and Edge ask to allow access to local network devices the first time; if that was denied, re-allow it in the site settings.</li>
              <li>If your browser still blocks it, run SciMetro Studio locally (<code>npm run dev</code>), where the page is served over http.</li>
              <li>The built-in synthesizer needs no setup, and is used automatically when Ollama is unavailable.</li>
            </ul>
          )}
        </div>
      </details>
    </div>
  );
};
