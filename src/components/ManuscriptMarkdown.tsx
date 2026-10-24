import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { parseBlocks, parseInline } from '../services/markdown';
import type { Block, Inline } from '../services/markdown';
import { ManuscriptFigureCard } from './ManuscriptFigure';
import type { StudyStats } from '../types';

/** Title and note of each manuscript figure (shared by the article view and the gallery). */
export function figureSpec(n: number, stats: StudyStats): { title: string; note: string } {
  const g = stats.growthModels?.exponential;
  switch (n) {
    case 1:
      return {
        title: 'Annual scientific production trajectory, citation accumulation, and growth dynamics',
        note: `Corpus of ${stats.docs} publications (${stats.span[0]}–${stats.span[1]}). ${
          g ? `Fitted exponential growth: ${g.ratePct}% per year (95% CI ${g.ciLowPct}% to ${g.ciHighPct}%).` : 'Growth model not estimable.'
        }`,
      };
    case 2:
      return {
        title: "Bradford's law of source scattering distribution model",
        note: `Zone 1: ${stats.bradfordZones[0]?.sourcesCount ?? 0} sources, Zone 2: ${stats.bradfordZones[1]?.sourcesCount ?? 0}, Zone 3: ${stats.bradfordZones[2]?.sourcesCount ?? 0}.`,
      };
    case 3:
      return {
        title: 'Co-authorship network of the most productive authors',
        note: `${stats.coauthorshipNetwork.nodes.length} authors and ${stats.coauthorshipNetwork.edges.length} collaborative ties.`,
      };
    case 4:
      return {
        title: 'Subject-term co-occurrence network',
        note: `${stats.keywordNetwork.nodes.length} terms and ${stats.keywordNetwork.edges.length} co-occurrence links.`,
      };
    case 5:
      return {
        title: 'International collaboration network',
        note: `${stats.topCountries.length} countries; multiple-country publication ratio: ${stats.mcpRatio}.`,
      };
    case 6:
      return {
        title: 'Institutional collaboration network',
        note: `${stats.institutionNetwork.nodes.length} institutions linked by joint publications.`,
      };
    default:
      return {
        title: 'Retrieval, screening and analysis workflow',
        note: 'Record counts at each stage of retrieval and screening, as in a PRISMA-style flow.',
      };
  }
}

const Tex: React.FC<{ tex: string; display?: boolean }> = ({ tex, display }) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: !!display, throwOnError: false, strict: 'ignore' });
    } catch {
      return null;
    }
  }, [tex, display]);
  if (!html) return <code className="text-red-600">{tex}</code>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
};

function renderInline(nodes: Inline[], keyPrefix = ''): React.ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`;
    switch (n.t) {
      case 'text':
        return <React.Fragment key={key}>{n.v}</React.Fragment>;
      case 'bold':
        return <strong key={key}>{renderInline(n.c, key + '.')}</strong>;
      case 'italic':
        return <em key={key}>{renderInline(n.c, key + '.')}</em>;
      case 'code':
        return (
          <code key={key} className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 text-[0.92em] font-mono">
            {n.v}
          </code>
        );
      case 'math':
        return <Tex key={key} tex={n.v} />;
      case 'link':
        return (
          <a key={key} href={n.href} target="_blank" rel="noreferrer noopener" className="text-blue-600 dark:text-blue-400 underline break-all">
            {n.label}
          </a>
        );
      case 'placeholder':
        return (
          <mark
            key={key}
            title="Author input required before submission"
            className="bg-amber-200/80 dark:bg-amber-500/25 text-amber-950 dark:text-amber-200 rounded px-1 font-sans text-[0.9em] not-italic"
          >
            {n.v}
          </mark>
        );
    }
  });
}

const Inl: React.FC<{ text: string }> = ({ text }) => <>{renderInline(parseInline(text))}</>;

const NUMERIC = /^[−+-]?\d[\d.,\s]*%?$|^n\/a$|^—$/;

const BlockView: React.FC<{ b: Block; stats: StudyStats; topic: string }> = ({ b, stats, topic }) => {
  switch (b.type) {
    case 'heading': {
      if (b.level === 1)
        return (
          <div className="border-b border-[var(--bd)] pb-3 mb-4">
            <span className="text-[10px] uppercase font-sans tracking-widest text-blue-600 dark:text-blue-400 font-bold block mb-1">
              Original Scientometric Research Article
            </span>
            <h1 className="text-xl md:text-2xl font-bold font-sans text-[var(--fg)] leading-tight">
              <Inl text={b.text} />
            </h1>
          </div>
        );
      if (b.level === 2)
        return (
          <h2 className="text-base font-bold font-sans text-[var(--fg)] mt-6 mb-2 pb-1 border-b border-[var(--bd)] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--ac)] inline-block" />
            <span>
              <Inl text={b.text} />
            </span>
          </h2>
        );
      if (b.level === 3)
        return (
          <h3 className="text-sm font-bold font-sans mt-4 mb-1 text-[var(--ac)]">
            <Inl text={b.text} />
          </h3>
        );
      return (
        <h4 className="text-xs font-semibold font-sans text-[var(--fg)] mt-3 mb-1">
          <Inl text={b.text} />
        </h4>
      );
    }
    case 'abstract':
      return (
        <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-500/20 my-4 font-sans text-xs space-y-2 leading-relaxed">
          <span className="font-bold text-[var(--fg)] block text-sm">Abstract</span>
          <div className="text-[var(--fg)] opacity-90 text-justify">
            <Inl text={b.text} />
          </div>
        </div>
      );
    case 'paragraph':
      return (
        <p className="text-[var(--fg)] text-justify leading-relaxed">
          <Inl text={b.text} />
        </p>
      );
    case 'list': {
      const Tag = b.ordered ? 'ol' : 'ul';
      return (
        <Tag className={`${b.ordered ? 'list-decimal' : 'list-disc'} pl-6 space-y-1.5 text-[var(--fg)] text-justify leading-relaxed`}>
          {b.items.map((it, i) => (
            <li key={i}>
              <Inl text={it} />
            </li>
          ))}
        </Tag>
      );
    }
    case 'quote': {
      const warn = /warning/i.test(b.text);
      return (
        <blockquote
          className={`font-sans text-xs leading-relaxed rounded-r-lg border-l-4 px-3 py-2 ${
            warn
              ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-950 dark:text-amber-100'
              : 'border-[var(--bd)] bg-black/[0.03] dark:bg-white/5 text-[var(--fg)]'
          }`}
        >
          <Inl text={b.text} />
        </blockquote>
      );
    }
    case 'math':
      return (
        <div className="my-3 overflow-x-auto text-center text-[0.95rem]" role="math">
          <Tex tex={b.tex} display />
        </div>
      );
    case 'code':
      return (
        <pre className="text-[10px] leading-snug bg-black/5 dark:bg-white/10 rounded-lg p-3 overflow-x-auto font-mono">
          <code>{b.code}</code>
        </pre>
      );
    case 'rule':
      return <hr className="border-[var(--bd)] my-4" />;
    case 'figure': {
      const spec = figureSpec(b.n, stats);
      return (
        <ManuscriptFigureCard
          figureNumber={b.n}
          title={spec.title}
          note={spec.note}
          mermaidCode={b.mermaid || undefined}
          stats={stats}
          topic={topic}
        />
      );
    }
    case 'table':
      return (
        <div className="my-4 font-sans">
          {b.caption && (
            <div className="font-bold text-xs text-[var(--fg)] mb-1.5 flex items-start gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <span>
                <Inl text={b.caption} />
              </span>
            </div>
          )}
          <div className="overflow-x-auto border border-[var(--bd)] rounded-lg">
            <table className="prose-table text-xs w-full">
              <thead>
                <tr className="bg-black/5 dark:bg-white/5 border-b border-[var(--bd)]">
                  {b.header.map((h, i) => (
                    <th key={i} className={`py-2 px-3 font-semibold text-[var(--fg)] ${b.align[i] === 'r' ? 'text-right' : b.align[i] === 'c' ? 'text-center' : 'text-left'}`}>
                      <Inl text={h} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--bd)]">
                {b.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td
                        key={ci}
                        className={`py-1.5 px-3 text-[var(--fg)] align-top ${
                          b.align[ci] === 'r' || NUMERIC.test(c.trim()) ? 'text-right tabular-nums' : b.align[ci] === 'c' ? 'text-center' : ''
                        }`}
                      >
                        <Inl text={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
  }
};

export const ManuscriptMarkdown: React.FC<{ markdown: string; stats: StudyStats; topic: string }> = ({ markdown, stats, topic }) => {
  const blocks = useMemo(() => parseBlocks(markdown), [markdown]);
  return (
    <>
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} stats={stats} topic={topic} />
      ))}
    </>
  );
};

/** Mermaid source of each figure, keyed by figure number (used by the gallery). */
export function figureDiagrams(markdown: string): Record<number, string> {
  const out: Record<number, string> = {};
  parseBlocks(markdown).forEach((b) => {
    if (b.type === 'figure' && b.mermaid) out[b.n] = b.mermaid;
  });
  return out;
}
