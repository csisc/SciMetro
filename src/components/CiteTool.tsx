import React, { useMemo, useState } from 'react';
import { Quote, Copy, Check, ExternalLink } from 'lucide-react';
import {
  APP_VERSION,
  DATA_SOURCES,
  PIPELINE_PARTS,
  RELATED_WORKS,
  formatAuthors,
  kindTag,
  relatedApa,
  relatedBibtex,
  toolCitation,
} from '../config/citation';
import type { PipelinePart, RelatedWork } from '../config/citation';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

const CopyButton: React.FC<{ text: string; label: string }> = ({ text, label }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="scimetro-btn-ghost flex items-center gap-1 text-[11px] font-medium py-1 px-2"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        }
      }}
      aria-label={label}
    >
      {done ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
      <span>{done ? 'Copied' : label}</span>
    </button>
  );
};

/** Reference text with the venue in italics. */
const Reference: React.FC<{ w: RelatedWork }> = ({ w }) => {
  const link = w.doi ? `https://doi.org/${w.doi}` : w.url || '';
  const i = w.italic ? w.venue.indexOf(w.italic) : -1;
  return (
    <span>
      {formatAuthors(w.authors)} ({w.year}). {w.title}
      {kindTag(w)}.{' '}
      {i >= 0 ? (
        <>
          <em>{w.italic}</em>
          {w.venue.slice(i + w.italic.length)}
        </>
      ) : (
        w.venue
      )}{' '}
      {link && (
        <a href={link} target="_blank" rel="noreferrer noopener" className="text-blue-600 dark:text-blue-400 underline break-all inline-flex items-center gap-0.5">
          {link.replace(/^https?:\/\//, '')}
          <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
        </a>
      )}
    </span>
  );
};

export const CiteTool: React.FC = () => {
  const cite = useMemo(
    () => toolCitation(typeof window !== 'undefined' ? window.location.origin + window.location.pathname : 'https://example.org/scimetro'),
    []
  );
  const parts = (Object.keys(PIPELINE_PARTS) as PipelinePart[]).filter((p) => RELATED_WORKS.some((w) => w.part === p));
  const allApa = RELATED_WORKS.map(relatedApa).join('\n\n');
  const allBib = RELATED_WORKS.map(relatedBibtex).join('\n\n');

  return (
    <section id="cite-tool" className="scimetro-card mt-6" aria-labelledby="cite-tool-title">
      <h2 id="cite-tool-title" className="text-base font-bold text-[var(--fg)] mb-1 flex items-center gap-2">
        <Quote className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden />
        To Cite the Tool
      </h2>
      <p className="text-xs text-[var(--mut)] leading-relaxed mb-3">
        If SciMetro Studio contributed to a publication, please cite the tool (version {APP_VERSION}) and the data it relies on.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-[var(--bd)] p-3">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-xs font-semibold text-[var(--fg)]">APA</h3>
            <CopyButton text={cite.apa} label="Copy APA" />
          </div>
          <p className="text-xs text-[var(--fg)] leading-relaxed break-words">{cite.apa}</p>
        </div>
        <div className="rounded-lg border border-[var(--bd)] p-3">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-xs font-semibold text-[var(--fg)]">BibTeX</h3>
            <CopyButton text={cite.bibtex} label="Copy BibTeX" />
          </div>
          <pre className="text-[11px] leading-snug font-mono whitespace-pre-wrap break-words text-[var(--fg)]">{cite.bibtex}</pre>
        </div>
      </div>
      <p className="text-[11px] text-[var(--mut)] leading-relaxed mt-2">
        The address above is the page you are using. For a persistent identifier, archive a release of the software (for example on Zenodo) and cite its DOI.
      </p>

      <div className="mt-4">
        <h3 className="text-xs font-semibold text-[var(--fg)] mb-1">Please also acknowledge the data and services used</h3>
        <ul className="text-xs text-[var(--fg)] list-disc pl-5 space-y-0.5">
          {DATA_SOURCES.map((d) => (
            <li key={d.name}>
              <a href={d.url} target="_blank" rel="noreferrer noopener" className="text-blue-600 dark:text-blue-400 underline">
                {d.name}
              </a>
              : {d.use}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 pt-4 border-t border-[var(--bd)]">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h3 className="text-sm font-bold text-[var(--fg)]">Related work by Houcemeddine Turki</h3>
          <div className="flex gap-1.5">
            <CopyButton text={allApa} label="Copy all (APA)" />
            <CopyButton text={allBib} label="Copy all (BibTeX)" />
          </div>
        </div>
        <p className="text-xs text-[var(--mut)] leading-relaxed mb-3">
          Several parts of this pipeline are evoked by earlier work of Houcemeddine Turki and co-authors on Wikidata, bibliographic metadata and scientometrics, including{' '}
          {RELATED_WORKS.filter((w) => ['letter', 'research letter', 'comment'].includes(w.kind)).length} letters to the editor and comments and{' '}
          {RELATED_WORKS.filter((w) => w.kind === 'editorial').length} editorial (marked below). The works are listed as conceptual background, grouped by the part of the
          pipeline they bear on; they do not endorse this software, which does not reproduce their methods.
        </p>

        <div className="space-y-4">
          {parts.map((p) => (
            <div key={p}>
              <h4 className="text-xs font-semibold text-[var(--ac)]">{PIPELINE_PARTS[p].label}</h4>
              <p className="text-[11px] text-[var(--mut)] mb-1.5">In the tool: {PIPELINE_PARTS[p].where}</p>
              <ul className="space-y-2.5">
                {RELATED_WORKS.filter((w) => w.part === p).map((w) => (
                  <li key={w.id} className="text-xs text-[var(--fg)] leading-relaxed pl-3 border-l-2 border-[var(--bd)]">
                    <div>
                      {w.kind !== 'article' && (
                        <span className="inline-block mr-1.5 align-middle text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200">
                          {w.kind === 'comment' ? 'Comment' : w.kind === 'research letter' ? 'Research letter' : w.kind === 'editorial' ? 'Editorial' : 'Letter'}
                        </span>
                      )}
                      <Reference w={w} />
                    </div>
                    <div className="text-[var(--mut)] mt-0.5">{w.summary}</div>
                    <div className="mt-0.5">
                      <span className="font-semibold">In SciMetro Studio: </span>
                      {w.relation}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
