// Auto-submit glue between the store and the hiscores worker.
//
// Split into a pure `buildSubmissionPayload` (gating + payload shaping) and
// an effectful `submitHiscoreFromState` (calls fetch, dispatches store
// actions). The store stays free of fetch; App.tsx wires the subscribe-
// debounce loop on top.
//
// Eligibility rules — submit only when:
//   1. lastSync.source === 'wikisync' (plugin imports are unverified files)
//   2. username is non-empty after trim
//   3. current score differs from the last server-acked score
//      (avoids redundant PUTs on reload / no-op state changes)

import { useStore, selectCompletedCount, selectRelicScore } from '../state/store';
import { putHiscore, HiscoresError, type HiscoreSubmission } from './hiscores';

type State = ReturnType<typeof useStore.getState>;

export function buildSubmissionPayload(
  state: State,
  now: number = Date.now(),
): HiscoreSubmission | null {
  if (state.lastSync?.source !== 'wikisync') return null;
  const username = state.lastSync.username.trim();
  if (!username) return null;
  if (state.score === state.hiscoresLastSubmittedScore) return null;
  return {
    username,
    score: state.score,
    points: selectRelicScore(state),
    completedCount: selectCompletedCount(state),
    regionsUnlocked: state.unlockedRegions.length,
    pactsUnlocked: state.unlockedPactIds.length,
    clientUpdatedAt: now,
  };
}

export async function submitHiscoreFromState(state: State): Promise<void> {
  const payload = buildSubmissionPayload(state);
  if (!payload) return;
  try {
    const row = await putHiscore(state.hiscoresProxyBaseUrl, payload.username, payload);
    useStore.getState().recordHiscoresSubmit(row.score, row.updatedAt);
  } catch (err) {
    const message =
      err instanceof HiscoresError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    useStore.getState().recordHiscoresError(message);
    // Failures are surfaced only on the Hiscores tab; log here so dev tail
    // / browser console still picks them up.
    console.warn('[hiscores] submit failed:', message);
  }
}
