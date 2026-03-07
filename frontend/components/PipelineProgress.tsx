"use client";

export type StepState = "active" | "done" | "error" | "";

export interface PipelineStep {
  id: string;
  label: string;
  state: StepState;
  detail: string;
}

interface PipelineProgressProps {
  visible: boolean;
  steps: PipelineStep[];
}

export default function PipelineProgress({ visible, steps }: PipelineProgressProps) {
  if (!visible) return null;

  return (
    <div className="pipeline-progress">
      <div className="pipeline-steps">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`pipeline-step${step.state ? ` ${step.state}` : ""}`}
          >
            <div className="step-row">
              <span className="step-icon">
                {steps.indexOf(step) + 1}
              </span>
              <span className="step-label">{step.label}</span>
            </div>
            {step.detail && <span className="step-detail">{step.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
