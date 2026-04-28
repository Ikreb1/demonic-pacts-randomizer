import type { ReactNode } from 'react';
import type { Task, Tier } from '../types';
import { TIER_LABELS, TIER_POINTS } from '../types';
import { TaskCard } from './TaskCard';

interface Props {
  tier: Tier;
  task: Task;
  revealed: boolean;
  picked: boolean;
  fading: boolean;
  actions: ReactNode;
}

export function FlipCard({ tier, task, revealed, picked, fading, actions }: Props) {
  const cls = [
    'flip-card',
    `tier-${tier}`,
    revealed && 'flip-card-revealed',
    revealed && tier === 'master' && 'flip-card-master-land',
    picked && 'flip-card-picked',
    fading && 'flip-card-fading',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} aria-busy={!revealed}>
      <div className="flip-card-inner">
        <div className="flip-card-front">
          <TaskCard task={task} variant="roll" actions={actions} />
        </div>
        <div className={`flip-card-back tier-${tier}`} aria-hidden={revealed}>
          <span className="flip-back-label">{TIER_LABELS[tier]}</span>
          <span className="flip-back-points">{TIER_POINTS[tier]} pts</span>
          <span className="flip-back-glyph" aria-hidden>
            ?
          </span>
        </div>
      </div>
    </div>
  );
}
