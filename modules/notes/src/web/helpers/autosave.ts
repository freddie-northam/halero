// A tiny debounced saver for the note editor and title field. Edits
// arrive as a stream of snapshots (block documents, or the title string);
// this collapses a burst of them into one save after the writer pauses,
// and flushes the pending snapshot on unmount / tab hide so the last edit
// is never lost. Framework-agnostic and timer-injectable so it can be
// unit tested without a real clock.

export interface Autosaver<T> {
  /** Records the latest value and (re)arms the debounce timer. */
  readonly schedule: (value: T) => void;
  /** Cancels the timer and saves immediately if a value is pending. */
  readonly flush: () => void;
  /** Cancels the timer and discards any pending value without saving. */
  readonly cancel: () => void;
}

export interface AutosaveTimers {
  readonly set: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  readonly clear: (handle: ReturnType<typeof setTimeout>) => void;
}

const defaultTimers: AutosaveTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => {
    clearTimeout(handle);
  },
};

export const createAutosaver = <T>(
  save: (value: T) => void,
  delayMs: number,
  timers: AutosaveTimers = defaultTimers,
): Autosaver<T> => {
  let handle: ReturnType<typeof setTimeout> | null = null;
  let pending: { readonly value: T } | null = null;

  const clearTimer = (): void => {
    if (handle !== null) {
      timers.clear(handle);
      handle = null;
    }
  };

  const fire = (): void => {
    handle = null;
    if (pending !== null) {
      const { value } = pending;
      pending = null;
      save(value);
    }
  };

  return {
    schedule: (value) => {
      pending = { value };
      clearTimer();
      handle = timers.set(fire, delayMs);
    },
    flush: () => {
      clearTimer();
      fire();
    },
    cancel: () => {
      clearTimer();
      pending = null;
    },
  };
};
