import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppSettings,
  WikidataHit,
  TermPack,
  Publication,
  StudyStats,
  PipelineStepDef,
  StoredStudyMeta,
} from './types';
import { Header } from './components/Header';
import { SettingsPanel } from './components/SettingsPanel';
import { WikidataPicker } from './components/WikidataPicker';
import { PipelineSteps } from './components/PipelineSteps';
import { QueryEditor } from './components/QueryEditor';
import { LogConsole } from './components/LogConsole';
import { ResultsView } from './components/ResultsView';
import { StoredStudiesModal } from './components/StoredStudiesModal';

import { fetchWikidataTerms } from './services/wikidata';
import {
  searchWikidataWorks,
  snowballWikidataWorks,
  findPriorStudiesWikidata,
  enrichMetadata,
  DEFAULT_QLEVER_ENDPOINT,
} from './services/qlever';
import {
  formulateQueryWithLlm,
  filterOutliersWithLlm,
  generatePaperWithLlm,
} from './services/llm';
import { computeStudyStats } from './services/stats';
import {
  putGitHubFile,
  getStoredStudies,
  saveStudyLocally,
  deleteStoredStudy,
} from './services/github';

const DEFAULT_SETTINGS: AppSettings = {
  qleverUrl: DEFAULT_QLEVER_ENDPOINT,
  ol: 'http://localhost:11434',
  md: 'llama3.1:8b',
  db: 'Wikidata (QLever)',
  mx: 200,
  th: 5,
  lg: 'en,fr,ar,es,de',
  rp: '',
  pt: 'studies',
  tk: '',
  llmProvider: 'synthesizer',
  useGeminiFallback: true,
};

const INITIAL_STEPS: PipelineStepDef[] = [
  { id: 'terms', name: 'Wikidata labels, aliases and related terms', status: 'idle' },
  { id: 'query', name: 'Formulate query with local LLM', status: 'idle' },
  { id: 'search', name: 'Search Wikidata QLever (scholarly articles & topics)', status: 'idle' },
  { id: 'snowball', name: 'Citation snowballing via Wikidata triples (P2860)', status: 'idle' },
  { id: 'filt', name: 'LLM outlier filtering', status: 'idle' },
  { id: 'metadata', name: 'Metadata & author affiliation check', status: 'idle' },
  { id: 'stats', name: 'Scientometric analysis (Lotka, Bradford, Networks)', status: 'idle' },
  { id: 'prior', name: 'Previous scientometric & review studies', status: 'idle' },
  { id: 'write', name: 'Write the academic paper with local LLM', status: 'idle' },
];

export const App: React.FC = () => {
  // Settings & storage
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('sms_v2');
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {}
    return DEFAULT_SETTINGS;
  });

  const [selectedItem, setSelectedItem] = useState<WikidataHit | null>(null);
  const [terms, setTerms] = useState<TermPack[]>([]);
  const [queryText, setQueryText] = useState('');
  const [recs, setRecs] = useState<Publication[]>([]);
  const [stats, setStats] = useState<StudyStats | null>(null);
  const flowRef = useRef<{ identified: number; duplicatesById: number; missingYearOrTitle: number } | undefined>(undefined);
  const [priorStudies, setPriorStudies] = useState<Publication[]>([]);
  const [paper, setPaper] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  // Pipeline execution state
  const [steps, setSteps] = useState<PipelineStepDef[]>(INITIAL_STEPS);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);

  // Stored studies
  const [storedStudies, setStoredStudies] = useState<StoredStudyMeta[]>([]);
  const [isStoredModalOpen, setIsStoredModalOpen] = useState(false);
  const [isStoringGitHub, setIsStoringGitHub] = useState(false);

  // Auto-save settings
  const handleSettingsChange = (key: keyof AppSettings, val: any) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: val };
      try {
        localStorage.setItem('sms_v2', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, msg]);
  }, []);

  const clearLogs = () => {
    setLogs([]);
  };

  // Load stored studies on mount
  useEffect(() => {
    const list = getStoredStudies();
    setStoredStudies(list);
  }, []);

  // Update step status helper
  const setStepState = (
    stepIdx: number,
    status: PipelineStepDef['status'],
    message?: string
  ) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === stepIdx ? { ...s, status, message } : s))
    );
  };

  // 1. Terms step
  const runTermsStep = async (): Promise<TermPack[]> => {
    if (!selectedItem) {
      throw new Error('choose a Wikidata item first');
    }
    const langs = settings.lg
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const fetchedTerms = await fetchWikidataTerms(selectedItem.id, langs, addLog);
    setTerms(fetchedTerms);
    return fetchedTerms;
  };

  // 2. Query formulation step
  const runQueryStep = async (currentTerms?: TermPack[]): Promise<string> => {
    let tList = currentTerms || terms;
    if (!tList.length) {
      tList = await runTermsStep();
    }

    const flat = (t: TermPack) => [
      ...new Set([...Object.values(t.labels), ...Object.values(t.aliases).flat()]),
    ];
    const main = flat(tList[0]).slice(0, 12);
    const rels: Record<string, string[]> = {};

    tList.slice(1).forEach((t) => {
      if (!rels[t.rel]) rels[t.rel] = [];
      const englishLabels = [t.labels.en, ...(t.aliases.en || []).slice(0, 2)].filter(
        Boolean
      );
      rels[t.rel].push(...englishLabels);
    });

    Object.keys(rels).forEach((k) => {
      rels[k] = [...new Set(rels[k])].slice(0, 15);
    });

    const groups = await formulateQueryWithLlm(main, rels, settings, addLog);
    const formattedQuery = groups.map((g) => g.join(' | ')).join('\n');
    setQueryText(formattedQuery);
    addLog(`Query groups:\n${formattedQuery}`);
    return formattedQuery;
  };

  // 3. Search Wikidata QLever step
  const runSearchStep = async (currentQuery?: string): Promise<Publication[]> => {
    if (!selectedItem) {
      throw new Error('Choose a Wikidata item first');
    }
    const q = currentQuery ?? queryText;
    const relatedIds = terms.slice(1).map((t) => t.id);
    const endpoint = settings.qleverUrl || DEFAULT_QLEVER_ENDPOINT;

    const results = await searchWikidataWorks(
      selectedItem.id,
      relatedIds,
      q,
      settings.mx,
      endpoint,
      addLog
    );
    setRecs(results);
    return results;
  };

  // 4. Citation Snowballing step (wdt:P2860 on Wikidata)
  const runSnowballStep = async (currentRecs?: Publication[]): Promise<Publication[]> => {
    const list = currentRecs || recs;
    if (!list.length) {
      throw new Error('Search Wikidata QLever first before snowballing');
    }
    const endpoint = settings.qleverUrl || DEFAULT_QLEVER_ENDPOINT;
    const added = await snowballWikidataWorks(list, endpoint, addLog);
    const merged = [...list, ...added];
    setRecs(merged);
    return merged;
  };

  // 5. LLM Outlier filtering step
  const runFilterStep = async (currentRecs?: Publication[]): Promise<Publication[]> => {
    const list = currentRecs || recs;
    if (!list.length) {
      throw new Error('No publications available to filter');
    }
    const topic = terms[0]?.labels?.en || selectedItem?.label || 'Topic';
    const filtered = await filterOutliersWithLlm(list, topic, queryText, settings, addLog);
    setRecs(filtered);
    return filtered;
  };

  // 6. Metadata check & enrichment step
  const runMetadataStep = async (currentRecs?: Publication[]): Promise<Publication[]> => {
    const list = currentRecs || recs;
    const uniqueMap = new Map<string, Publication>();
    list.forEach((r) => {
      if (!uniqueMap.has(r.id)) uniqueMap.set(r.id, r);
    });
    const deduped = [...uniqueMap.values()];
    const cleaned = deduped.filter((r) => r.title && r.year);
    flowRef.current = {
      identified: list.length,
      duplicatesById: list.length - deduped.length,
      missingYearOrTitle: deduped.length - cleaned.length,
    };
    addLog(
      `Screening: ${list.length} records → ${deduped.length} after de-duplication by Wikidata ID (${list.length - deduped.length} duplicates) → ${cleaned.length} with title and publication year (${deduped.length - cleaned.length} excluded for missing year/title).`
    );

    // Ensure enrichment
    const missingAuthors = cleaned.filter((r) => !r.authors.length);
    if (missingAuthors.length > 0) {
      const endpoint = settings.qleverUrl || DEFAULT_QLEVER_ENDPOINT;
      await enrichMetadata(missingAuthors.slice(0, 50), endpoint, addLog);
    }

    setRecs(cleaned);

    const pct = (f: (r: Publication) => boolean) =>
      Math.round((100 * cleaned.filter(f).length) / Math.max(1, cleaned.length));

    addLog(
      `Metadata: ${cleaned.length} unique works; authors ${pct(
        (r) => r.authors.length > 0
      )}%, affiliations ${pct(
        (r) => r.authors.some((a) => Boolean(a.aff))
      )}%, DOI ${pct((r) => Boolean(r.doi))}%, cited ≥1 ${pct((r) => r.cites > 0)}%`
    );
    return cleaned;
  };

  // 7. Statistical & Scientometric analysis step
  const runStatsStep = async (currentRecs?: Publication[]): Promise<StudyStats> => {
    const list = currentRecs || recs;
    if (!list.length) {
      throw new Error('No publications to analyze');
    }
    const topicLabel = terms[0]?.labels?.en || selectedItem?.label || '';
    const queryTerms = queryText
      .split(/[\s,;|()"']+|\b(?:AND|OR|NOT)\b/)
      .filter((w) => w && w.length > 2);
    const computed = computeStudyStats(list, {
      excludeTerms: [topicLabel, ...queryTerms].filter(Boolean),
      upstream: flowRef.current,
    });
    if (computed.screening && computed.screening.removed.length) {
      addLog(
        `Record screening removed: ${computed.screening.removed.map((x) => `${x.count} × ${x.reason}`).join('; ')}.`
      );
    }
    if (computed.screening?.citationSelectionFlag) {
      addLog('Warning: almost no uncited works — the sample looks selected on citation counts; citation and growth indicators are not population estimates.');
    }
    setStats(computed);
    addLog(
      `Scientometric analysis complete: ${computed.docs} works, ${computed.authors} authors, h-index ${computed.hIndex}, g-index ${computed.gIndex}, DC ${computed.degreeOfCollaboration}`
    );
    return computed;
  };

  // 8. Previous studies step
  const runPriorStep = async (currentTerms?: TermPack[]): Promise<Publication[]> => {
    if (!selectedItem) {
      throw new Error('Select a Wikidata item first');
    }
    const tList = currentTerms || terms;
    const relatedIds = tList.slice(1).map((t) => t.id);
    const endpoint = settings.qleverUrl || DEFAULT_QLEVER_ENDPOINT;
    const prior = await findPriorStudiesWikidata(
      selectedItem.id,
      selectedItem.label,
      relatedIds,
      endpoint,
      addLog
    );
    setPriorStudies(prior);
    return prior;
  };

  // 9. Write manuscript step
  const runWriteStep = async (
    currentStats?: StudyStats | null,
    currentPrior?: Publication[] | null
  ): Promise<string> => {
    const st = currentStats || stats;
    if (!st) {
      throw new Error('Run statistical analysis first');
    }
    const pr = currentPrior || priorStudies;
    const topic = terms[0]?.labels?.en || selectedItem?.label || 'Topic';
    const q = queryText || topic;
    const id = selectedItem?.id || 'Concept';

    const generatedMarkdown = await generatePaperWithLlm(
      topic,
      id,
      q,
      st,
      pr,
      settings,
      addLog
    );

    setPaper(generatedMarkdown);

    // Save locally
    const currentSlug = getSlug();
    const currentJson = getDataJson();
    const studyMeta: StoredStudyMeta = {
      slug: currentSlug,
      title: `A Scientometric Analysis of ${topic}`,
      date: new Date().toISOString().slice(0, 10),
      works: st.docs,
      database: settings.db,
      paperMarkdown: generatedMarkdown,
      jsonData: currentJson,
      savedAt: new Date().toISOString(),
    };
    saveStudyLocally(studyMeta);
    setStoredStudies(getStoredStudies());
    addLog(`Study saved: ${currentSlug}`);

    return generatedMarkdown;
  };

  // Execute single step
  const runStepByIndex = async (idx: number): Promise<boolean> => {
    const step = steps[idx];
    setActiveStepId(step.id);
    setStepState(idx, 'running');

    try {
      switch (idx) {
        case 0:
          await runTermsStep();
          break;
        case 1:
          await runQueryStep();
          break;
        case 2:
          await runSearchStep();
          break;
        case 3:
          await runSnowballStep();
          break;
        case 4:
          await runFilterStep();
          break;
        case 5:
          await runMetadataStep();
          break;
        case 6:
          await runStatsStep();
          break;
        case 7:
          await runPriorStep(terms);
          break;
        case 8:
          await runWriteStep();
          break;
      }
      setStepState(idx, 'done');
      setActiveStepId(null);
      return true;
    } catch (e: any) {
      setStepState(idx, 'failed', e.message);
      addLog(`✗ ${step.name}: ${e.message}`);
      setActiveStepId(null);
      return false;
    }
  };

  // Run all pipeline steps sequentially
  const runAllPipeline = async () => {
    if (!selectedItem) {
      addLog('✗ Please choose a Wikidata item first.');
      return;
    }

    setIsRunningAll(true);
    let currentTerms: TermPack[] = terms;
    let currentQuery = queryText;
    let currentRecs: Publication[] = recs;
    let currentStats: StudyStats | null = stats;
    let currentPrior: Publication[] = priorStudies;

    for (let i = 0; i < steps.length; i++) {
      setActiveStepId(steps[i].id);
      setStepState(i, 'running');

      try {
        switch (i) {
          case 0:
            currentTerms = await runTermsStep();
            break;
          case 1:
            currentQuery = await runQueryStep(currentTerms);
            break;
          case 2:
            currentRecs = await runSearchStep(currentQuery);
            break;
          case 3:
            currentRecs = await runSnowballStep(currentRecs);
            break;
          case 4:
            currentRecs = await runFilterStep(currentRecs);
            break;
          case 5:
            currentRecs = await runMetadataStep(currentRecs);
            break;
          case 6:
            currentStats = await runStatsStep(currentRecs);
            break;
          case 7:
            currentPrior = await runPriorStep(currentTerms);
            break;
          case 8:
            await runWriteStep(currentStats, currentPrior);
            break;
        }
        setStepState(i, 'done');
      } catch (err: any) {
        setStepState(i, 'failed', err.message);
        addLog(`✗ ${steps[i].name}: ${err.message}`);
        break;
      }
    }

    setActiveStepId(null);
    setIsRunningAll(false);
  };

  // Slugs and data formatting
  const getSlug = (): string => {
    const label = terms[0]?.labels?.en || selectedItem?.label || 'study';
    return (
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-wikidata-qlever-' +
      new Date().toISOString().slice(0, 10)
    );
  };

  const getDataJson = (): string => {
    return JSON.stringify(
      {
        wikidata: selectedItem,
        database: settings.db,
        endpoint: settings.qleverUrl,
        query: queryText,
        terms,
        stats,
        previousStudies: priorStudies,
        works: recs.map(({ id, doi, title, year, venue, cites, authors, keywords, origin }) => ({
          id,
          doi,
          title,
          year,
          venue,
          cites,
          authors,
          keywords,
          origin,
        })),
      },
      null,
      2
    );
  };

  const handleDownloadMarkdown = () => {
    const filename = `${getSlug()}.md`;
    const blob = new Blob([paper], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const filename = `${getSlug()}.json`;
    const blob = new Blob([getDataJson()], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStoreGitHub = async () => {
    const repo = settings.rp.trim();
    const token = settings.tk.trim();
    const folder = (settings.pt.trim() || 'studies').replace(/^\/|\/$/g, '');
    const dir = `${folder}/${getSlug()}`;

    if (!repo || !token) {
      alert('Set the GitHub repo and token in Settings.');
      return;
    }

    setIsStoringGitHub(true);
    try {
      await putGitHubFile(`${dir}/paper.md`, paper, token, repo);
      await putGitHubFile(`${dir}/data.json`, getDataJson(), token, repo);
      addLog(`Stored: https://github.com/${repo}/tree/main/${dir}`);
    } catch (e: any) {
      addLog(`GitHub error: ${e.message}`);
    } finally {
      setIsStoringGitHub(false);
    }
  };

  const handleLoadStoredStudy = (study: StoredStudyMeta) => {
    try {
      const data = JSON.parse(study.jsonData);
      if (data.wikidata) setSelectedItem(data.wikidata);
      if (data.query) setQueryText(data.query);
      if (data.terms) setTerms(data.terms);
      if (data.stats) setStats(data.stats);
      if (data.previousStudies) setPriorStudies(data.previousStudies);
      if (data.works) setRecs(data.works);
      setPaper(study.paperMarkdown);
      addLog(`Loaded stored study: ${study.title}`);
    } catch (e: any) {
      addLog(`Failed to load stored study: ${e.message}`);
    }
  };

  const handleDeleteStoredStudy = (slug: string) => {
    deleteStoredStudy(slug);
    setStoredStudies(getStoredStudies());
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <main className="max-w-[1000px] mx-auto px-4 py-6 pb-20">
        <Header
          onOpenStoredStudies={() => setIsStoredModalOpen(true)}
          storedStudiesCount={storedStudies.length}
        />

        <SettingsPanel
          settings={settings}
          onChange={handleSettingsChange}
          onLog={addLog}
        />

        <WikidataPicker
          selected={selectedItem}
          onSelect={(item) => {
            setSelectedItem(item);
            setTerms([]);
          }}
          language={settings.lg}
          onLog={addLog}
        />

        <PipelineSteps
          steps={steps}
          isRunningAll={isRunningAll}
          activeStepId={activeStepId}
          onRunStep={runStepByIndex}
          onRunAll={runAllPipeline}
          disabled={!selectedItem}
        />

        <QueryEditor query={queryText} onChange={setQueryText} />

        <LogConsole logs={logs} onClear={clearLogs} />

        <ResultsView
          stats={stats}
          priorStudies={priorStudies}
          topic={terms[0]?.labels?.en || selectedItem?.label || 'Topic'}
          paperMarkdown={paper}
          onDownloadMarkdown={handleDownloadMarkdown}
          onDownloadJson={handleDownloadJson}
          onStoreGitHub={handleStoreGitHub}
          isStoringGitHub={isStoringGitHub}
        />
      </main>

      <StoredStudiesModal
        isOpen={isStoredModalOpen}
        onClose={() => setIsStoredModalOpen(false)}
        studies={storedStudies}
        onDeleteStudy={handleDeleteStoredStudy}
        onLoadStudy={handleLoadStoredStudy}
      />
    </div>
  );
};

export default App;
