import React, { useEffect, useRef } from 'react';
import { Terminal, Trash2 } from 'lucide-react';

interface LogConsoleProps {
  logs: string[];
  onClear: () => void;
}

export const LogConsole: React.FC<LogConsoleProps> = ({ logs, onClear }) => {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <section className="scimetro-card mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-[var(--fg)] flex items-center gap-1.5">
          <Terminal className="w-4 h-4 text-[var(--mut)]" />
          <span>Log</span>
        </h2>
        {logs.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-[var(--mut)] hover:text-[var(--fg)] flex items-center gap-1 transition-colors"
            title="Clear console logs"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        )}
      </div>
      <div
        ref={logRef}
        className="font-mono text-[12px] leading-[1.4] whitespace-pre-wrap max-h-[220px] overflow-y-auto bg-[var(--bg)] border border-[var(--bd)] rounded-md p-2.5 select-text"
      >
        {logs.length === 0 ? (
          <span className="text-[var(--mut)] italic">Ready. Select an item and run the pipeline.</span>
        ) : (
          logs.join('\n')
        )}
      </div>
    </section>
  );
};
