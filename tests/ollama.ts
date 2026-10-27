/**
 * Calling a local Ollama server from a web page, and explaining precisely why it fails.
 *
 * From a page served over HTTPS (for example GitHub Pages) several things can go wrong, and the
 * browser reports almost all of them as the same opaque "Failed to fetch":
 *
 *  - Ollama only accepts the origins localhost, 127.0.0.1 and 0.0.0.0 by default, so the page's
 *    origin (https://<user>.github.io) must be added with OLLAMA_ORIGINS. Ollama then answers
 *    403 without CORS headers, which the browser turns into "Failed to fetch".
 *  - Chrome and Edge show a Local Network Access permission prompt when an HTTPS site calls
 *    http://localhost (Chrome 142+; a separate "loopback" permission since Chrome 145). If it is
 *    denied or dismissed, the request fails like a CORS error.
 *  - An Ollama server on another machine over plain http:// is blocked as mixed content.
 *  - Ollama is not running, or the URL or port is wrong.
 *
 * The probe below tells these apart: a no-cors request resolves (opaque) when a server answers,
 * even if CORS then blocks reading it, and rejects when nothing can be reached.
 */
import type { AppSettings } from '../types';

export type OllamaCode =
  | 'ok'
  | 'mixed-content'
  | 'unreachable'
  | 'cors'
  | 'model-missing'
  | 'http-error'
  | 'timeout';

export interface OllamaDiagnosis {
  code: OllamaCode;
  ok: boolean;
  title: string;
  steps: string[];
  detail?: string;
}

export interface OllamaContext {
  pageOrigin: string; // https://user.github.io
  ollamaUrl: string; // http://localhost:11434
  model: string;
}

const hostOf = (u: string): { protocol: string; hostname: string } => {
  try {
    const x = new URL(u);
    return { protocol: x.protocol, hostname: x.hostname.replace(/^\[|\]$/g, '') };
  } catch {
    return { protocol: '', hostname: '' };
  }
};

export const isLoopbackUrl = (u: string): boolean => {
  const h = hostOf(u).hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' || h.endsWith('.localhost');
};

/** Origin of a page, without any path (what OLLAMA_ORIGINS expects). */
export const originOf = (href: string): string => {
  try {
    return new URL(href).origin;
  } catch {
    return href;
  }
};

/** Commands that allow the page's origin, per way of running Ollama. */
export function ollamaSetupSteps(origin: string): { label: string; commands: string[] }[] {
  return [
    { label: 'Terminal (any system)', commands: [`OLLAMA_ORIGINS="${origin}" ollama serve`] },
    { label: 'macOS app', commands: [`launchctl setenv OLLAMA_ORIGINS "${origin}"`, 'then quit Ollama and open it again'] },
    {
      label: 'Linux (systemd)',
      commands: ['sudo systemctl edit ollama.service', `[Service]\nEnvironment="OLLAMA_ORIGINS=${origin}"`, 'sudo systemctl daemon-reload && sudo systemctl restart ollama'],
    },
    { label: 'Windows', commands: [`setx OLLAMA_ORIGINS "${origin}"`, 'then quit Ollama from the tray icon and start it again'] },
    { label: 'Docker', commands: [`docker run -d -p 11434:11434 -e OLLAMA_ORIGINS="${origin}" ollama/ollama`] },
  ];
}

export interface OllamaObservation {
  /** result of GET {url}/api/tags with CORS */
  tags: { kind: 'ok'; models: string[] } | { kind: 'http'; status: number; body?: string } | { kind: 'network' } | { kind: 'timeout' };
  /** only when tags failed with a network error: does anything answer at all? */
  reachable?: boolean;
}

/** Pure decision logic, unit-tested. */
export function diagnose(ctx: OllamaContext, obs: OllamaObservation): OllamaDiagnosis {
  const page = hostOf(ctx.pageOrigin);
  const target = hostOf(ctx.ollamaUrl);
  const originCmd = `OLLAMA_ORIGINS="${ctx.pageOrigin}" ollama serve`;

  if (page.protocol === 'https:' && target.protocol === 'http:' && !isLoopbackUrl(ctx.ollamaUrl)) {
    return {
      code: 'mixed-content',
      ok: false,
      title: 'The browser blocks plain-http requests to another machine from an HTTPS page',
      steps: [
        'Use an Ollama address that is http://localhost:11434 (Ollama on this computer), or',
        'put an HTTPS reverse proxy or tunnel in front of the remote Ollama and enter its https:// address, or',
        'run SciMetro Studio locally (npm run dev) so that the page itself is served over http.',
      ],
    };
  }

  if (obs.tags.kind === 'ok') {
    // Ollama resolves a name without a tag to ":latest"
    const full = (n: string) => (n.includes(':') ? n : `${n}:latest`);
    if (obs.tags.models.some((m) => full(m) === full(ctx.model))) {
      return { code: 'ok', ok: true, title: `Ollama is reachable and model "${ctx.model}" is installed`, steps: [] };
    }
    return {
      code: 'model-missing',
      ok: false,
      title: `Ollama is reachable, but model "${ctx.model}" is not installed`,
      steps: [`Run: ollama pull ${ctx.model}`, `Or choose one of the installed models: ${obs.tags.models.join(', ') || 'none installed'}`],
    };
  }

  if (obs.tags.kind === 'timeout') {
    return {
      code: 'timeout',
      ok: false,
      title: 'Ollama did not answer in time',
      steps: ['Check that it is not busy loading a large model (run: ollama ps)', 'Try a smaller model, or increase the available memory'],
    };
  }

  if (obs.tags.kind === 'http') {
    if (obs.tags.status === 403) {
      return {
        code: 'cors',
        ok: false,
        title: `Ollama refuses requests from ${ctx.pageOrigin}`,
        steps: [`Start Ollama allowing this origin: ${originCmd}`, 'Quit and restart Ollama after setting the variable (see the commands for your system)'],
        detail: 'HTTP 403',
      };
    }
    return {
      code: 'http-error',
      ok: false,
      title: `Ollama answered with HTTP ${obs.tags.status}`,
      steps: ['Check the Ollama URL and that the server is a recent Ollama version'],
      detail: obs.tags.body?.slice(0, 120),
    };
  }

  // network error: the browser gives no reason; the no-cors probe separates the two main causes
  if (obs.reachable) {
    return {
      code: 'cors',
      ok: false,
      title: `Ollama is running but does not allow requests from ${ctx.pageOrigin}`,
      steps: [`Start Ollama allowing this origin: ${originCmd}`, 'Quit and restart Ollama after setting the variable (see the commands for your system)'],
    };
  }
  const steps = [
    `Check that Ollama is running and that ${ctx.ollamaUrl} is the right address (in a terminal: curl ${ctx.ollamaUrl})`,
  ];
  if (page.protocol === 'https:' && isLoopbackUrl(ctx.ollamaUrl)) {
    steps.push(
      'In Chrome or Edge, allow this site to access local network devices (the permission prompt, or the padlock → Site settings → Local network access / Loopback network)',
      'Some browsers, such as Safari, may block http://localhost from an HTTPS page; try Chrome, Edge or Firefox'
    );
  }
  return { code: 'unreachable', ok: false, title: `Nothing answered at ${ctx.ollamaUrl}`, steps };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const withTimeout = async <T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T | 'timeout'> => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await run(ctl.signal);
  } catch (e: any) {
    if (e?.name === 'AbortError') return 'timeout';
    throw e;
  } finally {
    clearTimeout(t);
  }
};

/** Fetch options that declare a request to the loopback network (Chrome's Local Network Access). */
export const loopbackInit = (url: string): RequestInit =>
  (isLoopbackUrl(url) ? { targetAddressSpace: 'loopback' } : {}) as RequestInit;

export async function probeOllama(
  ctx: OllamaContext,
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
  timeoutMs = 8000
): Promise<OllamaDiagnosis> {
  const base = ctx.ollamaUrl.replace(/\/$/, '');
  let obs: OllamaObservation;
  try {
    const r = await withTimeout(timeoutMs, (signal) => fetchImpl(`${base}/api/tags`, { signal, ...loopbackInit(base) }));
    if (r === 'timeout') obs = { tags: { kind: 'timeout' } };
    else if (!r.ok) obs = { tags: { kind: 'http', status: r.status, body: await r.text().catch(() => '') } };
    else {
      const data = await r.json().catch(() => ({}));
      obs = { tags: { kind: 'ok', models: (data.models || []).map((m: any) => String(m.name)) } };
    }
  } catch {
    let reachable = false;
    try {
      const r2 = await withTimeout(timeoutMs, (signal) => fetchImpl(`${base}/`, { mode: 'no-cors', signal, ...loopbackInit(base) }));
      reachable = r2 !== 'timeout';
    } catch {
      reachable = false;
    }
    obs = { tags: { kind: 'network' }, reachable };
  }
  return diagnose(ctx, obs);
}

export const ollamaContext = (settings: AppSettings): OllamaContext => ({
  pageOrigin: typeof window !== 'undefined' ? originOf(window.location.href) : 'http://localhost:3000',
  ollamaUrl: settings.ol,
  model: settings.md,
});

/** One-line summary used in logs and error messages. */
export const summarize = (d: OllamaDiagnosis): string => `${d.title}${d.steps[0] ? `. ${d.steps[0]}` : ''}`;

// Diagnoses are cached briefly so a failing run does not probe the server for every request.
const cache = new Map<string, { at: number; d: OllamaDiagnosis }>();
export async function diagnoseCached(ctx: OllamaContext, fetchImpl?: FetchLike): Promise<OllamaDiagnosis> {
  const key = `${ctx.pageOrigin}|${ctx.ollamaUrl}|${ctx.model}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.d;
  const d = await probeOllama(ctx, fetchImpl);
  cache.set(key, { at: Date.now(), d });
  return d;
}
export const clearOllamaCache = () => cache.clear();
