import React, { useState } from 'react';
import { StudyStats, Publication } from '../types';
import { ScientometricNetworkGraph } from './ScientometricNetworkGraph';
import { ManuscriptFigureCard } from './ManuscriptFigure';
import {
  BarChart2,
  TrendingUp,
  Users,
  BookOpen,
  Globe,
  Building,
  Tag,
  Award,
  Share2,
  Download,
  FileJson,
  Github,
  Copy,
  Check,
  Eye,
  Code,
  Layers,
  Sparkles,
  Library,
  ExternalLink,
  Search,
  Filter,
  FileText,
  Compass,
} from 'lucide-react';

interface ResultsViewProps {
  stats: StudyStats | null;
  priorStudies?: Publication[];
  topic?: string;
  paperMarkdown: string;
  onDownloadMarkdown: () => void;
  onDownloadJson: () => void;
  onStoreGitHub: () => Promise<void>;
  isStoringGitHub: boolean;
}

type TabType =
  | 'overview'
  | 'networks'
  | 'reviews'
  | 'authors'
  | 'sources'
  | 'countries'
  | 'institutions'
  | 'keywords'
  | 'seminal'
  | 'paper';

type PaperViewMode = 'article' | 'gallery' | 'raw';

export const ResultsView: React.FC<ResultsViewProps> = ({
  stats,
  priorStudies = [],
  topic = 'Scientometric Topic',
  paperMarkdown,
  onDownloadMarkdown,
  onDownloadJson,
  onStoreGitHub,
  isStoringGitHub,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [paperMode, setPaperMode] = useState<PaperViewMode>('article');
  const [copied, setCopied] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'bibliometric' | 'systematic_review' | 'conceptual_survey'>('all');
  const [reviewSearch, setReviewSearch] = useState('');

  if (!stats && !paperMarkdown) {
    return null;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(paperMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter prior review studies
  const filteredReviews = priorStudies.filter((p) => {
    if (reviewFilter !== 'all' && p.reviewType !== reviewFilter) return false;
    if (!reviewSearch) return true;
    const q = reviewSearch.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      p.venue.toLowerCase().includes(q) ||
      p.authors.some((a) => a.name.toLowerCase().includes(q))
    );
  });

  const jumpToFigure = (figNum: number) => {
    const elem = document.getElementById(`fig-${figNum}`);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Helper to extract mermaid code from markdown blocks
  const extractMermaidCode = (text: string): string => {
    const match = text.match(/```mermaid([\s\S]*?)```/);
    return match ? match[1].trim() : '';
  };

  return (
    <section className="scimetro-card mb-6" id="out">
      {/* Title & Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-[var(--bd)]">
        <div>
          <h2 className="text-lg font-bold text-[var(--fg)] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--ac)]" />
            <span>Scientometric Analysis & Publication Report</span>
          </h2>
          <p className="text-xs text-[var(--mut)] mt-0.5">
            Scholarly indicators, bibliometric laws, scientometric networks, systematic literature appraisal, and publication manuscript.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-1 bg-[var(--card)] p-1 rounded-lg border border-[var(--bd)] text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Overview & Laws</span>
          </button>

          <button
            onClick={() => setActiveTab('networks')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'networks'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Networks</span>
          </button>

          <button
            onClick={() => setActiveTab('reviews')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'reviews'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <Library className="w-3.5 h-3.5 text-amber-500" />
            <span>Literature Reviews ({priorStudies.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('authors')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'authors'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Authors</span>
          </button>

          <button
            onClick={() => setActiveTab('sources')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'sources'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Sources</span>
          </button>

          <button
            onClick={() => setActiveTab('countries')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'countries'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Countries</span>
          </button>

          <button
            onClick={() => setActiveTab('institutions')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'institutions'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Institutions</span>
          </button>

          <button
            onClick={() => setActiveTab('keywords')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'keywords'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Keywords</span>
          </button>

          <button
            onClick={() => setActiveTab('seminal')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'seminal'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Top Cited</span>
          </button>

          <button
            onClick={() => setActiveTab('paper')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'paper'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-[var(--mut)] hover:text-[var(--fg)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span>Manuscript & Figures</span>
          </button>
        </div>
      </div>

      {/* Main Scientometric KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 mb-4">
          <div className="bg-[var(--bg)] border border-[var(--bd)] p-3 rounded-lg">
            <div className="text-[11px] text-[var(--mut)] font-medium">Publications</div>
            <div className="text-xl font-bold text-[var(--fg)] mt-0.5">{stats.docs}</div>
            <div className="text-[10px] text-[var(--mut)] mt-1">{stats.span[0]}–{stats.span[1]}</div>
          </div>

          <div className="bg-[var(--bg)] border border-[var(--bd)] p-3 rounded-lg">
            <div className="text-[11px] text-[var(--mut)] font-medium">Total Citations</div>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">
              {stats.totalCitations.toLocaleString()}
            </div>
            <div className="text-[10px] text-[var(--mut)] mt-1">Mean: {stats.meanCitations}/work</div>
          </div>

          <div className="bg-[var(--bg)] border border-[var(--bd)] p-3 rounded-lg">
            <div className="text-[11px] text-[var(--mut)] font-medium">Impact Indices</div>
            <div className="text-xl font-bold text-[var(--fg)] mt-0.5">
              h: {stats.hIndex} <span className="text-xs font-normal text-[var(--mut)]">g: {stats.gIndex}</span>
            </div>
            <div className="text-[10px] text-[var(--mut)] mt-1">m-quotient: {stats.mQuotient ?? '—'}</div>
          </div>

          <div className="bg-[var(--bg)] border border-[var(--bd)] p-3 rounded-lg">
            <div className="text-[11px] text-[var(--mut)] font-medium">Growth (CAGR)</div>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {stats.annualGrowthPct != null ? `${stats.annualGrowthPct}%` : 'N/A'}
            </div>
            <div className="text-[10px] text-[var(--mut)] mt-1">
              Doubling: {stats.doublingTimeYears ? `${stats.doublingTimeYears} yrs` : '—'}
            </div>
          </div>

          <div className="bg-[var(--bg)] border border-[var(--bd)] p-3 rounded-lg">
            <div className="text-[11px] text-[var(--mut)] font-medium">Collaboration</div>
            <div className="text-xl font-bold text-[var(--fg)] mt-0.5">
              DC: {stats.degreeOfCollaboration}
            </div>
            <div className="text-[10px] text-[var(--mut)] mt-1">
              Intl Collab: {stats.internationalCollabPct != null ? `${stats.internationalCollabPct}%` : '—'}
            </div>
          </div>

          <div className="bg-[var(--bg)] border border-[var(--bd)] p-3 rounded-lg">
            <div className="text-[11px] text-[var(--mut)] font-medium">Authors</div>
            <div className="text-xl font-bold text-[var(--fg)] mt-0.5">{stats.authors}</div>
            <div className="text-[10px] text-[var(--mut)] mt-1">
              Price Elite: {stats.priceEliteCount} scholars
            </div>
          </div>
        </div>
      )}

      {/* Tab 1: Overview, Laws & Growth Timeline */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-4">
          <div className="bg-[var(--bg)] border border-[var(--bd)] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-xs text-[var(--fg)] flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-[var(--ac)]" />
                <span>Annual Scientific Production & Citation Impact</span>
              </span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[var(--ac)] inline-block"></span>
                  <span>Publications</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block"></span>
                  <span>Citations Received</span>
                </span>
              </div>
            </div>

            {renderDualTimelineChart(stats)}
          </div>

          {/* Bibliometric Laws: Lotka & Bradford */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Lotka's Law */}
            <div className="bg-[var(--bg)] border border-[var(--bd)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2 pb-1 border-b border-[var(--bd)]">
                <div>
                  <h4 className="font-bold text-xs text-[var(--fg)]">Lotka's Law of Author Productivity</h4>
                  <p className="text-[11px] text-[var(--mut)]">
                    Inverse square law of scientific contribution: f(x) = C / x^2
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-[var(--ac)] text-[10px] font-semibold">
                  Exponent α ≈ 2.0
                </span>
              </div>

              <table className="prose-table text-xs">
                <thead>
                  <tr className="bg-black/5 dark:bg-white/5">
                    <th>Works (x)</th>
                    <th>Observed Authors</th>
                    <th>Theoretical (Lotka)</th>
                    <th>Observed Share</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.lotka.map((row, idx) => (
                    <tr key={idx}>
                      <td className="font-semibold">{row.works}</td>
                      <td>{row.observed}</td>
                      <td className="text-[var(--mut)]">{row.theoretical}</td>
                      <td className="font-mono text-[11px]">
                        {stats.authors ? `${Math.round((100 * row.observed) / stats.authors)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bradford's Law */}
            <div className="bg-[var(--bg)] border border-[var(--bd)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2 pb-1 border-b border-[var(--bd)]">
                <div>
                  <h4 className="font-bold text-xs text-[var(--fg)]">Bradford's Law of Source Scattering</h4>
                  <p className="text-[11px] text-[var(--mut)]">
                    Concentration of publications in Core, Moderate, and Peripheral zones
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                  3 Bradford Zones
                </span>
              </div>

              <div className="space-y-2 mt-3">
                {stats.bradfordZones.map((zone) => (
                  <div
                    key={zone.zone}
                    className="p-2.5 rounded-lg border border-[var(--bd)] bg-black/[0.01] dark:bg-white/[0.01]"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--fg)]">{zone.name}</span>
                      <span className="font-mono text-xs text-[var(--ac)]">
                        {zone.worksCount} works ({zone.percentage}%)
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--mut)] mt-1">
                      {zone.sourcesCount} sources • Examples: {zone.sources.slice(0, 3).join(', ') || 'Various'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Interactive Scientometric Networks */}
      {activeTab === 'networks' && stats && (
        <ScientometricNetworkGraph
          coauthorship={stats.coauthorshipNetwork}
          keywords={stats.keywordNetwork}
          countries={stats.countryNetwork}
          institutions={stats.institutionNetwork}
        />
      )}

      {/* Tab 3: Literature Reviews & Benchmark Prior Surveys */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {/* Header & Controls */}
          <div className="bg-[var(--bg)] border border-[var(--bd)] rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-2 border-b border-[var(--bd)]">
              <div>
                <h3 className="font-bold text-sm text-[var(--fg)] flex items-center gap-1.5">
                  <Library className="w-4 h-4 text-amber-500" />
                  <span>Foundational Literature Reviews & Prior Bibliometric Studies</span>
                </h3>
                <p className="text-xs text-[var(--mut)] mt-0.5">
                  Benchmark review papers identified from Wikidata QLever, categorized and cited as references in the manuscript.
                </p>
              </div>

              {/* Filter Chips */}
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <button
                  onClick={() => setReviewFilter('all')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    reviewFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--card)] text-[var(--mut)] hover:text-[var(--fg)] border border-[var(--bd)]'
                  }`}
                >
                  All ({priorStudies.length})
                </button>
                <button
                  onClick={() => setReviewFilter('bibliometric')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    reviewFilter === 'bibliometric'
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--card)] text-[var(--mut)] hover:text-[var(--fg)] border border-[var(--bd)]'
                  }`}
                >
                  Bibliometric ({priorStudies.filter((p) => p.reviewType === 'bibliometric').length})
                </button>
                <button
                  onClick={() => setReviewFilter('systematic_review')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    reviewFilter === 'systematic_review'
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--card)] text-[var(--mut)] hover:text-[var(--fg)] border border-[var(--bd)]'
                  }`}
                >
                  Systematic Reviews ({priorStudies.filter((p) => p.reviewType === 'systematic_review').length})
                </button>
                <button
                  onClick={() => setReviewFilter('conceptual_survey')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    reviewFilter === 'conceptual_survey'
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--card)] text-[var(--mut)] hover:text-[var(--fg)] border border-[var(--bd)]'
                  }`}
                >
                  State-of-Art Surveys ({priorStudies.filter((p) => p.reviewType === 'conceptual_survey' || !p.reviewType).length})
                </button>
              </div>
            </div>

            {/* Search Box */}
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--mut)]" />
              <input
                type="text"
                value={reviewSearch}
                onChange={(e) => setReviewSearch(e.target.value)}
                placeholder="Search literature review titles, authors, or venues…"
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-[var(--bd)] bg-[var(--bg)] text-[var(--fg)] focus:outline-hidden focus:border-blue-500"
              />
            </div>

            {/* List of Prior Review Studies */}
            {filteredReviews.length === 0 ? (
              <div className="text-center py-8 text-xs text-[var(--mut)]">
                No literature review studies matched your filter.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredReviews.map((study, idx) => {
                  const refNum = priorStudies.indexOf(study) + 1;
                  return (
                    <div
                      key={study.id || idx}
                      className="p-3.5 rounded-lg border border-[var(--bd)] bg-black/[0.01] dark:bg-white/[0.01] hover:border-[var(--ac)] transition-colors space-y-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <span className="font-mono font-bold text-xs text-[var(--ac)] bg-blue-500/10 px-1.5 py-0.5 rounded shrink-0">
                            [{refNum}]
                          </span>
                          <div>
                            <h4 className="font-bold text-xs text-[var(--fg)] leading-snug">
                              {study.title}
                            </h4>
                            <div className="text-[11px] text-[var(--mut)] mt-0.5 flex flex-wrap items-center gap-2">
                              <span>
                                {study.authors.length > 0
                                  ? study.authors.slice(0, 3).map((a) => a.name).join(', ') +
                                    (study.authors.length > 3 ? ' et al.' : '')
                                  : 'Scholarly Authors'}
                              </span>
                              <span>•</span>
                              <span>{study.year || 'n.d.'}</span>
                              <span>•</span>
                              <span className="italic">{study.venue || 'Scholarly Venue'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              study.reviewType === 'bibliometric'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : study.reviewType === 'systematic_review'
                                ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                                : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {study.reviewType === 'bibliometric'
                              ? 'Bibliometric Mapping'
                              : study.reviewType === 'systematic_review'
                              ? 'Systematic Review'
                              : 'Conceptual Survey'}
                          </span>

                          <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-[var(--ac)] text-[10px] font-mono font-semibold">
                            {study.cites.toLocaleString()} cites
                          </span>

                          {study.doi && (
                            <a
                              href={`https://doi.org/${study.doi}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--mut)] hover:text-[var(--ac)] p-1 transition-colors"
                              title="Open DOI"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Synthesis Details & Research Gap */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-[var(--bd)] text-[11px]">
                        <div>
                          <span className="font-semibold text-[var(--fg)]">Methodology & Focus: </span>
                          <span className="text-[var(--mut)]">
                            {study.methodology || 'Qualitative literature synthesis and evidence gathering'}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-rose-600 dark:text-rose-400">Identified Research Gap: </span>
                          <span className="text-[var(--mut)]">
                            {study.researchGap || 'Lacks open linked graph reproducibility and multi-network topology modeling'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Authors */}
      {activeTab === 'authors' && stats && (
        <div className="bg-[var(--bg)] border border-[var(--bd)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--bd)]">
            <div>
              <h3 className="font-bold text-sm text-[var(--fg)] flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[var(--ac)]" />
                <span>Prolific and Influential Scholars</span>
              </h3>
              <p className="text-xs text-[var(--mut)] mt-0.5">
                Ranked by scientific output, citation count, local h-index, and affiliation.
              </p>
            </div>
            <div className="text-xs text-[var(--mut)]">
              Price's Law Elite: <b>{stats.priceEliteCount}</b> core scholars
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="prose-table text-xs">
              <thead>
                <tr className="bg-black/5 dark:bg-white/5">
                  <th>Rank</th>
                  <th>Author</th>
                  <th>Works</th>
                  <th>Citations</th>
                  <th>h-Index</th>
                  <th>Primary Institution</th>
                  <th>Country</th>
                </tr>
              </thead>
              <tbody>
                {stats.topAuthors.map((author, idx) => (
                  <tr key={author.id || idx}>
                    <td className="font-mono text-[var(--mut)]">{idx + 1}</td>
                    <td className="font-semibold text-[var(--fg)]">{author.name}</td>
                    <td className="font-semibold text-[var(--ac)]">{author.works}</td>
                    <td>{author.citations}</td>
                    <td className="font-mono">{author.hIndex}</td>
                    <td className="text-[var(--mut)]">{author.institution}</td>
                    <td className="text-[var(--mut)]">{author.country}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Sources */}
      {activeTab === 'sources' && stats && (
        <div className="bg-[var(--bg)] border border-[var(--bd)] rounded-xl p-4">
          <div className="mb-3 pb-2 border-b border-[var(--bd)]">
            <h3 className="font-bold text-sm text-[var(--fg)] flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[var(--ac)]" />
              <span>Leading Publication Venues & Sources</span>
            </h3>
            <p className="text-xs text-[var(--mut)] mt-0.5">
              Primary journals, proceedings, and their respective Bradford scattering zones.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="prose-table text-xs">
              <thead>
                <tr className="bg-black/5 dark:bg-white/5">
                  <th>Rank</th>
                  <th>Source Title</th>
                  <th>Works</th>
                  <th>Citations</th>
                  <th>Bradford Zone</th>
                </tr>
              </thead>
              <tbody>
                {stats.topSources.map((source, idx) => (
                  <tr key={idx}>
                    <td className="font-mono text-[var(--mut)]">{idx + 1}</td>
                    <td className="font-semibold text-[var(--fg)]">{source.name}</td>
                    <td className="font-semibold text-[var(--ac)]">{source.works}</td>
                    <td>{source.citations}</td>
                    <td>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          source.bradfordZone === 1
                            ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                            : source.bradfordZone === 2
                            ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        Zone {source.bradfordZone}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 6: Countries */}
      {activeTab === 'countries' && stats && (
        <div className="bg-[var(--bg)] border border-[var(--bd)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--bd)]">
            <div>
              <h3 className="font-bold text-sm text-[var(--fg)] flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-[var(--ac)]" />
                <span>Geographic Distribution & International Collaboration</span>
              </h3>
              <p className="text-xs text-[var(--mut)] mt-0.5">
                SCP (Single Country Publications) vs MCP (Multiple Country Publications).
              </p>
            </div>
            <div className="text-xs text-[var(--mut)]">
              Overall MCP Ratio: <b>{stats.mcpRatio}</b>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="prose-table text-xs">
              <thead>
                <tr className="bg-black/5 dark:bg-white/5">
                  <th>Rank</th>
                  <th>Country</th>
                  <th>Total Works</th>
                  <th>Citations</th>
                  <th>SCP (National)</th>
                  <th>MCP (International)</th>
                  <th>MCP Ratio</th>
                </tr>
              </thead>
              <tbody>
                {stats.topCountries.map((c, idx) => (
                  <tr key={c.country || idx}>
                    <td className="font-mono text-[var(--mut)]">{idx + 1}</td>
                    <td className="font-semibold text-[var(--fg)]">{c.country}</td>
                    <td className="font-semibold text-[var(--ac)]">{c.works}</td>
                    <td>{c.citations}</td>
                    <td className="font-mono">{c.scp}</td>
                    <td className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      {c.mcp}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-[var(--bd)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${Math.min(c.mcpRatio * 100, 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px]">{c.mcpRatio}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 7: Institutions */}
      {activeTab === 'institutions' && stats && (
        <div className="bg-[var(--bg)] border border-[var(--bd)] rounded-xl p-4">
          <div className="mb-3 pb-2 border-b border-[var(--bd)]">
            <h3 className="font-bold text-sm text-[var(--fg)] flex items-center gap-1.5">
              <Building className="w-4 h-4 text-[var(--ac)]" />
              <span>Leading Universities & Academic Institutions</span>
            </h3>
            <p className="text-xs text-[var(--mut)] mt-0.5">
              Ranked by institutional output and total research impact.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="prose-table text-xs">
              <thead>
                <tr className="bg-black/5 dark:bg-white/5">
                  <th>Rank</th>
                  <th>Institution</th>
                  <th>Country</th>
                  <th>Works</th>
                  <th>Citations</th>
                </tr>
              </thead>
              <tbody>
                {stats.topInstitutions.map((inst, idx) => (
                  <tr key={idx}>
                    <td className="font-mono text-[var(--mut)]">{idx + 1}</td>
                    <td className="font-semibold text-[var(--fg)]">{inst.name}</td>
                    <td className="text-[var(--mut)]">{inst.country}</td>
                    <td className="font-semibold text-[var(--ac)]">{inst.works}</td>
                    <td>{inst.citations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 8: Keywords */}
      {activeTab === 'keywords' && stats && (
        <div className="space-y-4">
          <div className="bg-[var(--bg)] border border-[var(--bd)] rounded-xl p-4">
            <div className="mb-3 pb-2 border-b border-[var(--bd)]">
              <h3 className="font-bold text-sm text-[var(--fg)] flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-[var(--ac)]" />
                <span>Thematic Keywords & Subject Topics</span>
              </h3>
              <p className="text-xs text-[var(--mut)] mt-0.5">
                Extracted from Wikidata taxonomy concepts and title lexical frequencies.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-bold text-[var(--fg)] mb-2">Subject Topics</h4>
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {stats.topKeywords.slice(0, 15).map((kw, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-md border border-[var(--bd)] text-xs"
                    >
                      <span className="font-medium text-[var(--fg)]">{kw.keyword}</span>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span>{kw.count} works</span>
                        <span className="text-[var(--mut)]">({kw.percentage}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-[var(--fg)] mb-2">Frequent Title Bigrams</h4>
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {stats.topBigrams.map(([bigram, count], idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-md border border-[var(--bd)] text-xs"
                    >
                      <span className="font-medium text-[var(--fg)] capitalize">{bigram}</span>
                      <span className="font-mono text-xs text-[var(--ac)]">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 9: Seminal Works */}
      {activeTab === 'seminal' && stats && (
        <div className="bg-[var(--bg)] border border-[var(--bd)] rounded-xl p-4">
          <div className="mb-3 pb-2 border-b border-[var(--bd)]">
            <h3 className="font-bold text-sm text-[var(--fg)] flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-500" />
              <span>Seminal & Most Cited Publications</span>
            </h3>
            <p className="text-xs text-[var(--mut)] mt-0.5">
              The foundational literature driving citation networks in this scientific domain.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="prose-table text-xs">
              <thead>
                <tr className="bg-black/5 dark:bg-white/5">
                  <th>Rank</th>
                  <th>Title</th>
                  <th>Year</th>
                  <th>Citations</th>
                  <th>DOI</th>
                </tr>
              </thead>
              <tbody>
                {stats.topCited.map(([title, year, cites, doi], idx) => (
                  <tr key={idx}>
                    <td className="font-mono text-[var(--mut)]">{idx + 1}</td>
                    <td className="font-semibold text-[var(--fg)] max-w-md">{title}</td>
                    <td className="font-mono">{year}</td>
                    <td className="font-bold text-[var(--ac)]">{cites}</td>
                    <td>
                      {doi ? (
                        <a
                          href={`https://doi.org/${doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--ac)] hover:underline font-mono text-[11px]"
                        >
                          {doi}
                        </a>
                      ) : (
                        <span className="text-[var(--mut)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 10: Manuscript & Figures */}
      {activeTab === 'paper' && paperMarkdown && (
        <div className="space-y-3">
          {/* Top Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--card)] p-2.5 rounded-xl border border-[var(--bd)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--fg)] flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-[var(--ac)]" />
                <span>Jump to Figure:</span>
              </span>
              <div className="flex items-center gap-1 text-[11px] flex-wrap">
                {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                  <button
                    key={num}
                    onClick={() => jumpToFigure(num)}
                    className="px-2 py-0.5 rounded bg-[var(--bg)] hover:bg-blue-500/10 border border-[var(--bd)] text-[var(--fg)] font-medium transition-colors"
                  >
                    Fig {num}
                  </button>
                ))}
              </div>
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 bg-[var(--bg)] p-0.5 rounded-lg border border-[var(--bd)] text-xs">
              <button
                onClick={() => setPaperMode('article')}
                className={`px-2.5 py-1 rounded font-medium flex items-center gap-1 transition-colors ${
                  paperMode === 'article'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-[var(--mut)] hover:text-[var(--fg)]'
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>Journal Article</span>
              </button>

              <button
                onClick={() => setPaperMode('gallery')}
                className={`px-2.5 py-1 rounded font-medium flex items-center gap-1 transition-colors ${
                  paperMode === 'gallery'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-[var(--mut)] hover:text-[var(--fg)]'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Figures Gallery</span>
              </button>

              <button
                onClick={() => setPaperMode('raw')}
                className={`px-2.5 py-1 rounded font-medium flex items-center gap-1 transition-colors ${
                  paperMode === 'raw'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-[var(--mut)] hover:text-[var(--fg)]'
                }`}
              >
                <Code className="w-3 h-3" />
                <span>Markdown</span>
              </button>
            </div>
          </div>

          {/* Mode 1: Formatted Journal Article with Embedded Figures */}
          {paperMode === 'article' && stats && (
            <div className="bg-[var(--bg)] border border-[var(--bd)] rounded-xl p-6 text-xs leading-relaxed max-h-[620px] overflow-y-auto space-y-4 font-serif">
              {paperMarkdown.split('\n\n').map((paragraph, i) => {
                const trimmed = paragraph.trim();

                // Title H1
                if (trimmed.startsWith('# ')) {
                  return (
                    <div key={i} className="border-b border-[var(--bd)] pb-3 mb-4">
                      <span className="text-[10px] uppercase font-sans tracking-widest text-blue-600 dark:text-blue-400 font-bold block mb-1">
                        Original Scientometric Research Article
                      </span>
                      <h1 className="text-xl md:text-2xl font-bold font-sans text-[var(--fg)] leading-tight">
                        {trimmed.slice(2)}
                      </h1>
                    </div>
                  );
                }

                // Section Heading H2
                if (trimmed.startsWith('## ')) {
                  return (
                    <h2
                      key={i}
                      className="text-base font-bold font-sans text-[var(--fg)] mt-6 mb-2 pb-1 border-b border-[var(--bd)] flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-[var(--ac)] inline-block"></span>
                      <span>{trimmed.slice(3)}</span>
                    </h2>
                  );
                }

                // Subsection H3
                if (trimmed.startsWith('### ')) {
                  return (
                    <h3 key={i} className="text-xs font-bold font-sans text-[var(--fg)] mt-4 mb-1 text-[var(--ac)]">
                      {trimmed.slice(4)}
                    </h3>
                  );
                }

                // Subsection H4
                if (trimmed.startsWith('#### ')) {
                  return (
                    <h4 key={i} className="text-xs font-semibold font-sans text-[var(--fg)] mt-3 mb-1">
                      {trimmed.slice(5)}
                    </h4>
                  );
                }

                // Abstract Box
                if (trimmed.includes('**Context and Objectives:**') || trimmed.startsWith('### Abstract')) {
                  return (
                    <div
                      key={i}
                      className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-500/20 my-4 font-sans text-xs space-y-2 leading-relaxed"
                    >
                      <span className="font-bold text-[var(--fg)] block text-sm">Abstract</span>
                      <div className="text-[var(--fg)] space-y-1.5 opacity-90">{trimmed.replace('### Abstract', '')}</div>
                    </div>
                  );
                }

                // Figure 1 Replacement
                if (trimmed.includes('**Figure 1.**')) {
                  return (
                    <ManuscriptFigureCard
                      key={i}
                      figureNumber={1}
                      title="Annual scientific production trajectory, citation accumulation, and growth dynamics"
                      note={`Corpus of ${stats.docs} publications (${stats.span[0]}–${stats.span[1]}). Calculated Compound Annual Growth Rate (CAGR): ${stats.annualGrowthPct}%, doubling time: ${stats.doublingTimeYears} years.`}
                      stats={stats}
                      topic={topic}
                    />
                  );
                }

                // Figure 2 Replacement
                if (trimmed.includes('**Figure 2.**')) {
                  return (
                    <ManuscriptFigureCard
                      key={i}
                      figureNumber={2}
                      title="Bradford's law of source scattering distribution model"
                      note={`Partitioned into Core Nucleus (Zone 1: ${stats.bradfordZones[0]?.sourcesCount} journals), Extended (Zone 2: ${stats.bradfordZones[1]?.sourcesCount} journals), and Peripheral (Zone 3: ${stats.bradfordZones[2]?.sourcesCount} journals).`}
                      stats={stats}
                      topic={topic}
                    />
                  );
                }

                // Figure 3 Replacement (Co-authorship)
                if (trimmed.includes('**Figure 3.**')) {
                  return (
                    <ManuscriptFigureCard
                      key={i}
                      figureNumber={3}
                      title="High-density co-authorship collaborative clusters and primary scientific networks"
                      note={`Topological network of ${stats.coauthorshipNetwork.nodes.length} scholars and ${stats.coauthorshipNetwork.edges.length} collaborative ties. Average degree: ${((2 * stats.coauthorshipNetwork.edges.length) / Math.max(1, stats.coauthorshipNetwork.nodes.length)).toFixed(2)}.`}
                      mermaidCode={extractMermaidCode(trimmed)}
                      stats={stats}
                      topic={topic}
                    />
                  );
                }

                // Figure 4 Replacement (Keywords)
                if (trimmed.includes('**Figure 4.**')) {
                  return (
                    <ManuscriptFigureCard
                      key={i}
                      figureNumber={4}
                      title="Intellectual structure and thematic keyword co-occurrence fronts"
                      note={`Semantic network of ${stats.keywordNetwork.nodes.length} subject concepts and ${stats.keywordNetwork.edges.length} relational edges.`}
                      mermaidCode={extractMermaidCode(trimmed)}
                      stats={stats}
                      topic={topic}
                    />
                  );
                }

                // Figure 5 Replacement (Countries)
                if (trimmed.includes('**Figure 5.**')) {
                  return (
                    <ManuscriptFigureCard
                      key={i}
                      figureNumber={5}
                      title="Global cross-national scientific collaboration network and MCP distribution"
                      note={`International collaboration matrix across ${stats.topCountries.length} countries. Multiple Country Publications (MCP) ratio: ${stats.mcpRatio}.`}
                      mermaidCode={extractMermaidCode(trimmed)}
                      stats={stats}
                      topic={topic}
                    />
                  );
                }

                // Figure 6 Replacement (Institutions)
                if (trimmed.includes('**Figure 6.**')) {
                  return (
                    <ManuscriptFigureCard
                      key={i}
                      figureNumber={6}
                      title="Inter-institutional research alliances and university collaboration topology"
                      note={`Network of ${stats.institutionNetwork.nodes.length} academic universities and institutes linked by joint publications.`}
                      stats={stats}
                      topic={topic}
                    />
                  );
                }

                // Figure 7 Replacement (Literature Review Synthesis)
                if (trimmed.includes('**Figure 7.**')) {
                  return (
                    <ManuscriptFigureCard
                      key={i}
                      figureNumber={7}
                      title="Methodological workflow, systematic review taxonomy, and research gap positioning"
                      note={`Identification, multi-class categorization (Bibliometric, SLR, State-of-the-Art), and gap formulation addressing proprietary database silos.`}
                      stats={stats}
                      priorStudies={priorStudies}
                      topic={topic}
                    />
                  );
                }

                // Tables
                if (trimmed.startsWith('**Table')) {
                  const parts = trimmed.split('\n\n');
                  const title = parts[0];
                  const tableBlock = parts.slice(1).join('\n\n') || trimmed;
                  return (
                    <div key={i} className="my-4 font-sans">
                      <div className="font-bold text-xs text-[var(--fg)] mb-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        <span>{title}</span>
                      </div>
                      {renderMarkdownTable(tableBlock)}
                    </div>
                  );
                }

                if (trimmed.startsWith('|')) {
                  return (
                    <div key={i} className="my-3 font-sans overflow-x-auto">
                      {renderMarkdownTable(trimmed)}
                    </div>
                  );
                }

                // Normal Paragraph
                return (
                  <p key={i} className="text-[var(--fg)] text-justify leading-relaxed">
                    {trimmed}
                  </p>
                );
              })}
            </div>
          )}

          {/* Mode 2: Figures & Tables Gallery */}
          {paperMode === 'gallery' && stats && (
            <div className="space-y-6 max-h-[620px] overflow-y-auto pr-1">
              <div className="bg-[var(--card)] border border-[var(--bd)] p-4 rounded-xl">
                <h3 className="font-bold text-sm text-[var(--fg)] mb-1">
                  Publication Scientific Figures (1 to 7)
                </h3>
                <p className="text-xs text-[var(--mut)]">
                  All figures generated for the manuscript, rendered with high-resolution vector SVGs and available for export.
                </p>
              </div>

              <ManuscriptFigureCard
                figureNumber={1}
                title="Annual scientific production trajectory, citation accumulation, and growth dynamics"
                note={`Corpus of ${stats.docs} publications (${stats.span[0]}–${stats.span[1]}). Calculated Compound Annual Growth Rate (CAGR): ${stats.annualGrowthPct}%, doubling time: ${stats.doublingTimeYears} years.`}
                stats={stats}
                topic={topic}
              />

              <ManuscriptFigureCard
                figureNumber={2}
                title="Bradford's law of source scattering distribution model"
                note={`Partitioned into Core Nucleus (Zone 1: ${stats.bradfordZones[0]?.sourcesCount} journals), Extended (Zone 2: ${stats.bradfordZones[1]?.sourcesCount} journals), and Peripheral (Zone 3: ${stats.bradfordZones[2]?.sourcesCount} journals).`}
                stats={stats}
                topic={topic}
              />

              <ManuscriptFigureCard
                figureNumber={3}
                title="High-density co-authorship collaborative clusters and primary scientific networks"
                note={`Topological network of ${stats.coauthorshipNetwork.nodes.length} scholars and ${stats.coauthorshipNetwork.edges.length} collaborative ties.`}
                mermaidCode={extractMermaidCode(paperMarkdown)}
                stats={stats}
                topic={topic}
              />

              <ManuscriptFigureCard
                figureNumber={4}
                title="Intellectual structure and thematic keyword co-occurrence fronts"
                note={`Semantic network of ${stats.keywordNetwork.nodes.length} subject concepts and ${stats.keywordNetwork.edges.length} relational edges.`}
                mermaidCode={extractMermaidCode(paperMarkdown)}
                stats={stats}
                topic={topic}
              />

              <ManuscriptFigureCard
                figureNumber={5}
                title="Global cross-national scientific collaboration network and MCP distribution"
                note={`International collaboration matrix across ${stats.topCountries.length} countries. Multiple Country Publications (MCP) ratio: ${stats.mcpRatio}.`}
                mermaidCode={extractMermaidCode(paperMarkdown)}
                stats={stats}
                topic={topic}
              />

              <ManuscriptFigureCard
                figureNumber={6}
                title="Inter-institutional research alliances and university collaboration topology"
                note={`Network of ${stats.institutionNetwork.nodes.length} academic universities and institutes linked by joint publications.`}
                stats={stats}
                topic={topic}
              />

              <ManuscriptFigureCard
                figureNumber={7}
                title="Methodological workflow, systematic review taxonomy, and research gap positioning"
                note={`Identification, multi-class categorization (Bibliometric, SLR, State-of-the-Art), and gap formulation addressing proprietary database silos.`}
                stats={stats}
                priorStudies={priorStudies}
                topic={topic}
              />
            </div>
          )}

          {/* Mode 3: Raw Markdown */}
          {paperMode === 'raw' && (
            <pre className="whitespace-pre-wrap bg-[var(--bg)] border border-[var(--bd)] rounded-xl p-4 max-h-[550px] overflow-y-auto text-xs font-mono leading-relaxed select-text">
              {paperMarkdown}
            </pre>
          )}
        </div>
      )}

      {/* Global Actions Bar */}
      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-[var(--bd)]">
        <button
          onClick={onDownloadMarkdown}
          className="scimetro-btn text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          Download .md Paper
        </button>

        <button
          onClick={onDownloadJson}
          className="scimetro-btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5"
        >
          <FileJson className="w-3.5 h-3.5 text-amber-500" />
          Download data.json
        </button>

        <button
          onClick={onStoreGitHub}
          disabled={isStoringGitHub}
          className="scimetro-btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5"
        >
          <Github className="w-3.5 h-3.5" />
          {isStoringGitHub ? 'Storing in GitHub…' : 'Store in GitHub'}
        </button>

        {paperMarkdown && (
          <button
            onClick={handleCopy}
            className="scimetro-btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 ml-auto"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[var(--ok)]" />
                <span>Copied Manuscript</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Manuscript</span>
              </>
            )}
          </button>
        )}
      </div>
    </section>
  );
};

// Dual Timeline Chart
function renderDualTimelineChart(stats: StudyStats) {
  const years = Object.keys(stats.byYear).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  if (!years.length) return null;

  const pubValues = Object.values(stats.byYear);
  const citeValues = Object.values(stats.citesByYear);
  const maxPub = Math.max(...pubValues, 1);
  const maxCite = Math.max(...citeValues, 1);

  const barWidth = 10;
  const barGap = 4;
  const totalStep = barWidth + barGap;
  const W = Math.max(380, years.length * totalStep + 30);
  const chartHeight = 90;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} 125`} className="w-full max-h-[145px] text-[var(--fg)]">
        {/* Baseline */}
        <line x1="0" y1={chartHeight} x2={W} y2={chartHeight} stroke="var(--bd)" strokeWidth="1" />

        {years.map((year, idx) => {
          const pubs = stats.byYear[year] || 0;
          const cites = stats.citesByYear[year] || 0;
          const pubH = Math.max(2, Math.round((70 * pubs) / maxPub));
          const x = idx * totalStep + 15;
          const pubY = chartHeight - pubH;

          // Secondary line height for citations
          const citeH = Math.max(1, Math.round((70 * cites) / maxCite));
          const citeY = chartHeight - citeH;

          return (
            <g key={year} className="group cursor-pointer">
              {/* Publication bar */}
              <rect
                x={x}
                y={pubY}
                width={barWidth}
                height={pubH}
                rx="1"
                className="fill-[var(--ac)] hover:opacity-80 transition-opacity"
              >
                <title>{`${year}: ${pubs} publications, ${cites} citations`}</title>
              </rect>

              {/* Citations indicator dot */}
              <circle cx={x + barWidth / 2} cy={citeY} r="2.5" fill="#f59e0b">
                <title>{`${year}: ${cites} citations received`}</title>
              </circle>

              {/* Year label */}
              {(idx === 0 ||
                idx === years.length - 1 ||
                idx % Math.ceil(years.length / 8) === 0) && (
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 16}
                  fontSize="9"
                  textAnchor="middle"
                  fill="currentColor"
                  className="opacity-70 text-[9px]"
                >
                  {year}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function renderMarkdownTable(tableText: string) {
  const lines = tableText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'));

  if (lines.length < 2) return null;

  const headers = lines[0]
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
  const rows = lines.slice(2).map((line) =>
    line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
  );

  return (
    <div className="overflow-x-auto my-1.5 border border-[var(--bd)] rounded-lg shadow-xs">
      <table className="prose-table text-xs">
        <thead>
          <tr className="bg-black/5 dark:bg-white/5 border-b border-[var(--bd)]">
            {headers.map((h, i) => (
              <th key={i} className="py-2 px-3 font-semibold text-[var(--fg)] text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--bd)]">
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-black/2 dark:hover:bg-white/2 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="py-1.5 px-3 text-[var(--fg)]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
