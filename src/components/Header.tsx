import React from 'react';
import { Sparkles, FolderArchive, Network } from 'lucide-react';

interface HeaderProps {
  onOpenStoredStudies: () => void;
  storedStudiesCount: number;
}

export const Header: React.FC<HeaderProps> = ({ onOpenStoredStudies, storedStudiesCount }) => {
  return (
    <header className="mb-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              <Network className="w-4 h-4" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">SciMetro Studio</h1>
          </div>
          <p className="text-sm text-[var(--mut)] mt-1.5 max-w-2xl leading-relaxed">
            Generate scholarly scientometric studies powered by <b>Wikidata QLever</b>, starting from any scientific concept. Analyze prolific authors, keywords, countries, academic institutions, Bradford & Lotka distributions, and interactive collaboration networks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenStoredStudies}
            className="scimetro-btn-ghost flex items-center gap-1.5 text-xs font-medium py-1.5 px-3"
            title="Browse stored studies"
          >
            <FolderArchive className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Browse stored studies</span>
            {storedStudiesCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold">
                {storedStudiesCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
