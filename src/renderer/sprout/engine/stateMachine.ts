// © CoreConduit Consulting Services — MIT License

export type SproutState =
  | "Sprouting"
  | "Idle"
  | "Listening"
  | "Thinking"
  | "Talking"
  | "Reacting"
  | "Sleeping"
  | "Distressed";

type Transition = {
  from: SproutState | "*";
  to: SproutState;
  // Adjacency cost for travel() shortest-path (default 1)
  cost?: number;
};

type StateChangeHandler = (from: SproutState, to: SproutState) => void;

// Directed adjacency list for travel() BFS.
// "*" means reachable from any state.
const TRANSITIONS: Transition[] = [
  { from: "Sprouting", to: "Idle" },
  { from: "Idle", to: "Listening" },
  { from: "Idle", to: "Thinking" },
  { from: "Idle", to: "Sleeping" },
  { from: "Idle", to: "Reacting" },
  { from: "Listening", to: "Idle" },
  { from: "Listening", to: "Reacting" },
  { from: "Listening", to: "Thinking" },
  { from: "Thinking", to: "Talking" },
  { from: "Thinking", to: "Idle" },
  { from: "Talking", to: "Idle" },
  { from: "Reacting", to: "Idle" },
  { from: "Sleeping", to: "Idle" },
  { from: "Distressed", to: "Idle" },
  { from: "*", to: "Distressed" },
];

function buildAdjacency(current: SproutState): SproutState[] {
  return TRANSITIONS.filter((t) => t.from === current || t.from === "*")
    .map((t) => t.to)
    .filter((s) => s !== current);
}

function bfsPath(from: SproutState, to: SproutState): SproutState[] {
  if (from === to) return [];
  const visited = new Set<SproutState>([from]);
  const queue: Array<{ state: SproutState; path: SproutState[] }> = [
    { state: from, path: [] },
  ];
  while (queue.length > 0) {
    const { state, path } = queue.shift()!;
    for (const next of buildAdjacency(state)) {
      if (visited.has(next)) continue;
      const newPath = [...path, next];
      if (next === to) return newPath;
      visited.add(next);
      queue.push({ state: next, path: newPath });
    }
  }
  // No path — teleport directly (Godot IMMEDIATE mode)
  return [to];
}

export class StateMachine {
  private current: SproutState;
  private handlers: Set<StateChangeHandler> = new Set();

  constructor(initial: SproutState = "Idle") {
    this.current = initial;
  }

  get state(): SproutState {
    return this.current;
  }

  onStateChange(handler: StateChangeHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Walk the shortest valid path to `target`, firing handlers at each hop. */
  travel(target: SproutState): void {
    if (this.current === target) return;
    const path = bfsPath(this.current, target);
    for (const next of path) {
      const prev = this.current;
      this.current = next;
      for (const h of this.handlers) h(prev, next);
    }
  }

  /** Teleport directly, bypassing path (use for error recovery only). */
  forceState(target: SproutState): void {
    const prev = this.current;
    this.current = target;
    for (const h of this.handlers) h(prev, target);
  }
}
