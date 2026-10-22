import React from 'react';

interface QueryEditorProps {
  query: string;
  onChange: (val: string) => void;
}

export const QueryEditor: React.FC<QueryEditorProps> = ({ query, onChange }) => {
  return (
    <section className="scimetro-card mb-4">
      <h2 className="text-base font-bold text-[var(--fg)] mb-1">
        Search query{' '}
        <span className="text-xs font-normal text-[var(--mut)]">
          (editable: one AND-group per line; terms inside a line separated by{' '}
          <code className="px-1 py-0.2 rounded bg-[var(--bg)] border border-[var(--bd)] font-mono">
            |
          </code>{' '}
          mean OR; matched against dblp titles)
        </span>
      </h2>
      <textarea
        className="scimetro-input font-mono text-xs leading-relaxed"
        rows={3}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. malaria | plasmodium&#10;machine learning | neural network"
      />
    </section>
  );
};
