import type { Task } from '../types';
import { TIER_LABELS, TIER_POINTS } from '../types';

interface Props {
  task: Task;
  variant?: 'roll' | 'active' | 'list';
  actions?: React.ReactNode;
}

export function TaskCard({ task, variant = 'list', actions }: Props) {
  return (
    <article className={`task-card task-card-${variant} tier-${task.tier}`}>
      <header className="task-card-head">
        <div className="task-tier-row">
          <span className={`pill pill-${task.tier}`}>{TIER_LABELS[task.tier]}</span>
          <span className="pill pill-region" data-region={task.region}>
            {task.region}
          </span>
          <span className="pill pill-points">{TIER_POINTS[task.tier]} pts</span>
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
