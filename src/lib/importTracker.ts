// Parses an export from the osrs-reldo Tasks Tracker RuneLite plugin.
//
// Confirmed shape (read from plugin source):
//   {
//     displayName: string,
//     taskType: "DEMONIC_PACTS" | ...,
//     tasks: { [structId: string]: { completed: number, structId: number, ... } }
//   }
// `completed` is a unix timestamp in milliseconds (0 if not done).

export interface TasksTrackerImport {
  completedIds: number[];
  username: string | null;
  taskTypeMatched: boolean;
  unknownIds: number[];
  totalSeen: number;
}

const EXPECTED_TASK_TYPES = ['DEMONIC_PACTS', 'DEMONIC_PACTS_LEAGUE', 'DEMONICPACTS'];

export function parseTrackerExport(input: unknown, knownIds: ReadonlySet<number>): TasksTrackerImport {
  if (!input || typeof input !== 'object') {
    throw new Error('Expected a JSON object at the root of the export.');
  }
  const root = input as Record<string, unknown>;
  const taskType = typeof root.taskType === 'string' ? root.taskType : '';
  const username = typeof root.displayName === 'string' ? root.displayName : null;
  const tasks = root.tasks;
  if (!tasks || typeof tasks !== 'object') {
    throw new Error('Export is missing the `tasks` map.');
  }

  const completedIds: number[] = [];
  const unknownIds: number[] = [];
  let totalSeen = 0;

  for (const [key, raw] of Object.entries(tasks as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const idFromKey = Number.parseInt(key, 10);
    const idFromBody = typeof entry.structId === 'number' ? entry.structId : NaN;
    const id = Number.isFinite(idFromBody) ? idFromBody : idFromKey;
    if (!Number.isFinite(id)) continue;
    totalSeen++;
    const completed = entry.completed;
    const isComplete = typeof completed === 'number' ? completed > 0 : completed === true;
    if (!isComplete) continue;
    if (knownIds.has(id)) completedIds.push(id);
    else unknownIds.push(id);
  }

  return {
    completedIds,
    username,
    taskTypeMatched: EXPECTED_TASK_TYPES.includes(taskType.toUpperCase()),
    unknownIds,
    totalSeen,
  };
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text);
}
