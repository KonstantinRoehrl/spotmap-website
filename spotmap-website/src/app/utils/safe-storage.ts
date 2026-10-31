/** A Web Storage area that never throws: blocked or missing storage reads as empty and drops writes. */
export interface SafeStorage {
  /** The stored value, or null when there is none or storage is unavailable. */
  getItem(key: string): string | null;
  /** Stores `value`; storage that refuses the write is not an error. */
  setItem(key: string, value: string): void;
  /** Forgets `key`; storage that refuses is not an error. */
  removeItem(key: string): void;
}

/**
 * Wraps a storage area, read inside the `try` at each call: merely touching `localStorage` can
 * throw when storage is blocked, and specs spy on it per test.
 */
function safeStorage(area: () => Storage): SafeStorage {
  return {
    getItem(key) {
      try {
        return area().getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        area().setItem(key, value);
      } catch {
        // Unavailable or full: the value just is not remembered.
      }
    },
    removeItem(key) {
      try {
        area().removeItem(key);
      } catch {
        // Unavailable: there was nothing it could have kept.
      }
    },
  };
}

/** `localStorage`, safe to call in private mode or with storage blocked. */
export const safeLocalStorage: SafeStorage = safeStorage(() => localStorage);

/** `sessionStorage`, safe to call in private mode or with storage blocked. */
export const safeSessionStorage: SafeStorage = safeStorage(
  () => sessionStorage,
);
