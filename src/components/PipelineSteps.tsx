import React from 'react';
import { PipelineStepDef } from '../types';
import { Play, Check, AlertTriangle, Loader2 } from 'lucide-react';

interface PipelineStepsProps {
  steps: PipelineStepDef[];
  isRunningAll: boolean;
  activeStepId: string | null;
  onRunStep: (stepIndex: number) => Promise<boolean>;
  onRunAll: () => Promise<void>;
  disabled: boolean;
}

export const PipelineSteps: React.FC<PipelineStepsProps> = ({
  steps,
  isRunningAll,
  activeStepId,
  onRunStep,
  onRunAll,
  disabled,
}) => {
  return (
    <section className="scimetro-card mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-[var(--fg)]">Pipeline</h2>
        <button
          onClick={onRunAll}
          disabled={disabled || isRunningAll || activeStepId !== null}
          className="scimetro-btn-ghost text-xs px-3 py-1 flex items-center gap-1.5 font-medium"
        >
          {isRunningAll ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Running all…</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current" />
              <span>Run all</span>
            </>
          )}
        </button>
      </div>

      <div className="divide-y divide-[var(--bd)] border border-[var(--bd)] rounded-md bg-[var(--bg)]">
        {steps.map((step, idx) => {
          const isCurrent = activeStepId === step.id;
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 px-3 py-2 text-xs transition-colors ${
                isCurrent ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => onRunStep(idx)}
                disabled={disabled || activeStepId !== null || isRunningAll}
                className="scimetro-btn-ghost text-[11px] py-0.5 px-2 font-medium shrink-0"
              >
                Run
              </button>

              <span className="flex-1 font-medium text-[var(--fg)]">
                {idx + 1}. {step.name}
              </span>

              {step.status === 'running' && (
                <span className="badge-tag running flex items-center gap-1 font-medium">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>running…</span>
                </span>
              )}
              {step.status === 'done' && (
                <span className="badge-tag ok flex items-center gap-1 font-semibold">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>done</span>
                </span>
              )}
              {step.status === 'failed' && (
                <span className="badge-tag er flex items-center gap-1 font-semibold" title={step.message}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>failed</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
