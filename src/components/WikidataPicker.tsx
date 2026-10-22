import React, { useState, useEffect, useRef } from 'react';
import { WikidataHit } from '../types';
import { searchWikidata } from '../services/wikidata';
import { Search, Loader2, Check } from 'lucide-react';

interface WikidataPickerProps {
  selected: WikidataHit | null;
  onSelect: (item: WikidataHit) => void;
  language: string;
  onLog: (msg: string) => void;
}

export const WikidataPicker: React.FC<WikidataPickerProps> = ({
  selected,
  onSelect,
  language,
  onLog,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [hits, setHits] = useState<WikidataHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const debounceRef = useRef<any>(null);

  const performSearch = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) {
      setHits([]);
      setStatusMessage(null);
      return;
    }

    setSearching(true);
    setStatusMessage('Searching…');
    try {
      const primaryLang = language.split(',')[0]?.trim() || 'en';
      const results = await searchWikidata(trimmed, primaryLang);
      setHits(results);
      if (results.length === 0) {
        setStatusMessage('No results. Try another spelling, or type a Q-id such as Q21198.');
      } else {
        setStatusMessage(null);
      }
    } catch (err: any) {
      setHits([]);
      setStatusMessage(
        `Search failed: ${err.message}. If this page runs inside a preview or sandbox, open it from GitHub Pages or a local server instead.`
      );
    } finally {
      setSearching(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    clearTimeout(debounceRef.current);
    if (val.trim().length < 2) {
      setHits([]);
      setStatusMessage(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      performSearch(val);
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceRef.current);
      performSearch(searchTerm);
    }
  };

  const handlePick = (hit: WikidataHit) => {
    onSelect(hit);
    setHits([]);
    setStatusMessage(null);
    onLog(`Selected ${hit.id} ${hit.label}`);
  };

  return (
    <section className="scimetro-card mb-4">
      <h2 className="text-base font-bold text-[var(--fg)] mb-2 flex items-center justify-between">
        <span>1. Choose a Wikidata item</span>
        {selected && (
          <span className="text-xs font-normal text-[var(--ok)] flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />
            Item selected
          </span>
        )}
      </h2>

      <div className="relative">
        <input
          className="scimetro-input pr-8"
          value={searchTerm}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a term (e.g. malaria) or a Q-id (e.g. Q12156), then press Enter"
        />
        {searching && (
          <div className="absolute right-2.5 top-2.5 text-[var(--mut)]">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--ac)]" />
          </div>
        )}
      </div>

      {statusMessage && (
        <div className="text-xs text-[var(--mut)] mt-2 italic px-1">{statusMessage}</div>
      )}

      {hits.length > 0 && (
        <div className="mt-2 max-h-60 overflow-y-auto border border-[var(--bd)] rounded-md bg-[var(--bg)] divide-y divide-[var(--bd)]">
          {hits.map((hit) => (
            <div
              key={hit.id}
              onClick={() => handlePick(hit)}
              className="p-2.5 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-xs transition-colors flex items-start justify-between gap-2"
            >
              <div>
                <span className="font-semibold text-[var(--fg)]">{hit.label}</span>{' '}
                <span className="font-mono text-[var(--mut)]">({hit.id})</span>
                {hit.description && (
                  <p className="text-[var(--mut)] mt-0.5 line-clamp-1">{hit.description}</p>
                )}
              </div>
              <span className="text-[11px] text-[var(--ac)] font-medium shrink-0">Select</span>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-2 text-xs text-[var(--mut)] font-medium flex items-center gap-2">
          <span>Selected:</span>
          <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-[var(--ac)] font-semibold border border-blue-200 dark:border-blue-800">
            {selected.label} ({selected.id})
          </span>
        </div>
      )}
    </section>
  );
};
