import type { Task } from '../types';
import { TIER_LABELS, TIER_POINTS } from '../types';
import { useStore, selectTaskEarnedScore, selectTaskMultiplier } from '../state/store';

interface Props {
  task: Task;
  variant?: 'roll' | 'active' | 'list';
  actions?: React.ReactNode;
}

export function TaskCard({ task, variant = 'list', actions }: Props) {
  const earned = useStore((s) => selectTaskEarnedScore(task, s));
  const mult = useStore((s) => selectTaskMultiplier(task, s));
  const hasBonus = mult > 1;
  return (
    <article className={`task-card task-card-${variant} tier-${task.tier}`}>
      <header className="task-card-head">
        <div className="task-tier-row">
          <span className={`pill pill-${task.tier}`}>{TIER_LABELS[task.tier]}</span>
          <span className="pill pill-region" data-region={task.region}>
            {task.region}
          </span>
          <span className="pill pill-points">{TIER_POINTS[task.tier]} pts</span>
          <span
            className={`pill pill-score${hasBonus ? ' pill-score-bonus' : ''}`}
            title={
              hasBonus
                ? `Early-tier multiplier ×${mult.toFixed(2)} — finish lower-tier tasks to drop it`
                : 'Score awarded on completion'
            }
          >
            +{earned}
            {hasBonus && <span className="pill-score-mult"> ×{mult.toFixed(2)}</span>}
          </span>
        </div>
        <h3 className="task-name">{task.name}</h3>
      </header>
      {task.description && <p className="task-desc">{task.description}</p>}
      {task.requirements && (
        <p className="task-reqs">
          <b>Requires:</b> {task.requirements}
        </p>
      )}
      {actions && <div className="task-actions">{actions}</div>}
    </article>
  );
}
