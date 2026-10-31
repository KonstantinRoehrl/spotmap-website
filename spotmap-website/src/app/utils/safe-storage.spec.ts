import { safeLocalStorage, safeSessionStorage } from './safe-storage';

const KEY = 'safe-storage-spec';

describe('safe storage', () => {
  // Through the safe wrappers: a spec's blocked-storage spies are still installed at this point.
  afterEach(() => {
    safeLocalStorage.removeItem(KEY);
    safeSessionStorage.removeItem(KEY);
  });

  it('reads, writes and forgets through to each area', () => {
    safeLocalStorage.setItem(KEY, 'local');
    safeSessionStorage.setItem(KEY, 'session');
    expect(localStorage.getItem(KEY)).toBe('local');
    expect(safeLocalStorage.getItem(KEY)).toBe('local');
    expect(safeSessionStorage.getItem(KEY)).toBe('session');
    safeLocalStorage.removeItem(KEY);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBe('session');
  });

  it('answers null when nothing is stored', () => {
    expect(safeLocalStorage.getItem(KEY)).toBeNull();
  });

  it('swallows a storage that throws on use', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    spyOn(Storage.prototype, 'getItem').and.callFake(blocked);
    spyOn(Storage.prototype, 'setItem').and.callFake(blocked);
    spyOn(Storage.prototype, 'removeItem').and.callFake(blocked);
    expect(safeLocalStorage.getItem(KEY)).toBeNull();
    expect(() => safeLocalStorage.setItem(KEY, 'x')).not.toThrow();
    expect(() => safeLocalStorage.removeItem(KEY)).not.toThrow();
  });

  it('swallows an area whose mere access throws', () => {
    spyOnProperty(window, 'localStorage').and.throwError('blocked');
    expect(safeLocalStorage.getItem(KEY)).toBeNull();
    expect(() => safeLocalStorage.setItem(KEY, 'x')).not.toThrow();
    expect(() => safeLocalStorage.removeItem(KEY)).not.toThrow();
  });
});
