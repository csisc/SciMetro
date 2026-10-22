import React, { useState } from 'react';
import { StoredStudyMeta } from '../types';
import { X, FileText, Download, FileJson, Trash2, ArrowLeft, ExternalLink, Calendar, Database } from 'lucide-react';

interface StoredStudiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  studies: StoredStudyMeta[];
  onDeleteStudy: (slug: string) => void;
  onLoadStudy: (study: StoredStudyMeta) => void;
}

export const StoredStudiesModal: React.FC<StoredStudiesModalProps> = ({
  isOpen,
  onClose,
  studies,
  onDeleteStudy,
  onLoadStudy,
}) => {
  const [selectedStudy, setSelectedStudy] = useState<StoredStudyMeta | null>(null);

  if (!isOpen) return null;

  const downloadFile = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[var(--bg)] border border-[var(--bd)] rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[var(--bd)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedStudy ? (
              <button
                onClick={() => setSelectedStudy(null)}
                className="scimetro-btn-ghost text-xs py-1 px-2 flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All studies</span>
              </button>
            ) : (
              <h2 className="text-base font-bold text-[var(--fg)] flex items-center gap-2">
                <span>Stored Studies</span>
                <span className="text-xs font-normal text-[var(--mut)]">
                  ({studies.length} saved)
                </span>
              </h2>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[var(--mut)] hover:text-[var(--fg)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {selectedStudy ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--bd)]">
                <div>
                  <h3 className="font-bold text-base text-[var(--fg)]">{selectedStudy.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-[var(--mut)] mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {selectedStudy.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Database className="w-3 h-3" />
                      {selectedStudy.database}
                    </span>
                    {selectedStudy.works !== undefined && (
                      <span>{selectedStudy.works} works analyzed</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onLoadStudy(selectedStudy);
                      onClose();
                    }}
                    className="scimetro-btn text-xs py-1.5 px-3"
                  >
                    Load into Studio
                  </button>
                  <button
                    onClick={() =>
                      downloadFile(`${selectedStudy.slug}.md`, selectedStudy.paperMarkdown, 'text/markdown')
                    }
                    className="scimetro-btn-ghost text-xs py-1.5 px-3 flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    .md
                  </button>
                  <button
                    onClick={() =>
                      downloadFile(`${selectedStudy.slug}.json`, selectedStudy.jsonData, 'application/json')
                    }
                    className="scimetro-btn-ghost text-xs py-1.5 px-3 flex items-center gap-1"
                  >
                    <FileJson className="w-3 h-3 text-amber-500" />
                    .json
                  </button>
                </div>
              </div>

              <pre className="whitespace-pre-wrap bg-[var(--card)] p-4 rounded-lg border border-[var(--bd)] font-mono text-xs leading-relaxed max-h-[500px] overflow-y-auto">
                {selectedStudy.paperMarkdown}
              </pre>
            </div>
          ) : studies.length === 0 ? (
            <div className="text-center py-12 text-[var(--mut)] text-sm space-y-2">
              <FileText className="w-8 h-8 mx-auto stroke-1 text-[var(--mut)]" />
              <p>No studies stored yet.</p>
              <p className="text-xs">
                Run the pipeline and generate a paper to save studies locally or to your GitHub repository.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-[var(--bd)] rounded-lg">
              <table className="prose-table w-full">
                <thead>
                  <tr className="bg-black/5 dark:bg-white/5">
                    <th>Date</th>
                    <th>Study Title</th>
                    <th>Works</th>
                    <th>Database</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {studies.map((item) => (
                    <tr key={item.slug} className="hover:bg-black/2 dark:hover:bg-white/2">
                      <td className="text-[var(--mut)] text-xs font-mono">{item.date}</td>
                      <td>
                        <button
                          onClick={() => setSelectedStudy(item)}
                          className="font-medium text-[var(--ac)] hover:underline text-left text-xs"
                        >
                          {item.title}
                        </button>
                      </td>
                      <td className="text-xs">{item.works ?? '—'}</td>
                      <td className="text-xs font-mono text-[var(--mut)]">{item.database}</td>
                      <td className="text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedStudy(item)}
                          className="scimetro-btn-ghost text-[11px] py-1 px-2"
                        >
                          View
                        </button>
                        <button
                          onClick={() =>
                            downloadFile(`${item.slug}.md`, item.paperMarkdown, 'text/markdown')
                          }
                          className="scimetro-btn-ghost text-[11px] py-1 px-2"
                          title="Download Markdown"
                        >
                          md
                        </button>
                        <button
                          onClick={() =>
                            downloadFile(`${item.slug}.json`, item.jsonData, 'application/json')
                          }
                          className="scimetro-btn-ghost text-[11px] py-1 px-2"
                          title="Download JSON data"
                        >
                          json
                        </button>
                        <button
                          onClick={() => onDeleteStudy(item.slug)}
                          className="p-1 hover:text-red-500 text-[var(--mut)] inline-block align-middle ml-1"
                          title="Delete from local list"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
