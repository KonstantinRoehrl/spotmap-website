import {
  clampColumnWidth,
  clearColumnShare,
  COLUMN_BIG_STEP_PX,
  COLUMN_SHARE_STORAGE_KEY,
  COLUMN_STEP_PX,
  columnWidthFor,
  DEFAULT_COLUMN_WIDTH_PX,
  maxColumnWidth,
  MIN_COLUMN_WIDTH_PX,
  readColumnShare,
  storeColumnShare,
} from './column-split';

describe('column split', () => {
  afterEach(() => localStorage.removeItem(COLUMN_SHARE_STORAGE_KEY));

  it('pins the spec’s figures', () => {
    expect(DEFAULT_COLUMN_WIDTH_PX).toBe(384);
    expect(MIN_COLUMN_WIDTH_PX).toBe(340);
    expect(COLUMN_STEP_PX).toBe(16);
    expect(COLUMN_BIG_STEP_PX).toBe(64);
    expect(COLUMN_SHARE_STORAGE_KEY).toBe('spotColumnShare');
  });

  describe('limits', () => {
    it('lets the column grow to half the frame', () => {
      // 1024 px viewport less the two 24 px gutters.
      expect(maxColumnWidth(976)).toBe(488);
      expect(maxColumnWidth(1201)).toBe(600);
    });

    it('never puts the maximum under the minimum, however narrow the frame', () => {
      expect(maxColumnWidth(600)).toBe(340);
      expect(maxColumnWidth(0)).toBe(340);
    });

    it('holds a width between the limits, in whole pixels', () => {
      expect(clampColumnWidth(300, 976)).toBe(340);
      expect(clampColumnWidth(600, 976)).toBe(488);
      expect(clampColumnWidth(400.4, 976)).toBe(400);
      expect(clampColumnWidth(400.6, 976)).toBe(401);
      expect(clampColumnWidth(500, 600)).toBe(340);
    });
  });

  describe('the width for a share', () => {
    it('starts at the default width while nothing is remembered', () => {
      expect(columnWidthFor(null, 1200)).toBe(384);
      // A frame too narrow for the default still keeps the column inside the limits.
      expect(columnWidthFor(null, 700)).toBe(350);
    });

    it('scales a remembered share with the frame, inside the limits', () => {
      expect(columnWidthFor(0.4, 1200)).toBe(480);
      expect(columnWidthFor(0.4, 1600)).toBe(640);
      expect(columnWidthFor(0.5, 1200)).toBe(600);
      expect(columnWidthFor(0.2, 1200)).toBe(340);
    });
  });

  describe('storage', () => {
    it('reads nothing while nothing is stored', () => {
      expect(readColumnShare()).toBeNull();
    });

    it('remembers a share and reads it back', () => {
      storeColumnShare(0.375);
      expect(localStorage.getItem('spotColumnShare')).toBe('0.375');
      expect(readColumnShare()).toBe(0.375);
    });

    it('reads nothing for a stored value that is not a share in (0, 0.5]', () => {
      for (const stored of ['', 'abc', '0', '-0.1', '0.6', 'Infinity', 'NaN']) {
        localStorage.setItem(COLUMN_SHARE_STORAGE_KEY, stored);
        expect(readColumnShare()).withContext(stored).toBeNull();
      }
      localStorage.setItem(COLUMN_SHARE_STORAGE_KEY, '0.5');
      expect(readColumnShare()).toBe(0.5);
    });

    it('forgets the share on a reset', () => {
      storeColumnShare(0.3);
      clearColumnShare();
      expect(localStorage.getItem(COLUMN_SHARE_STORAGE_KEY)).toBeNull();
      expect(readColumnShare()).toBeNull();
    });

    it('reads nothing when localStorage.getItem throws', () => {
      spyOn(localStorage, 'getItem').and.throwError('SecurityError');
      expect(readColumnShare()).toBeNull();
    });

    it('does not throw when storage refuses a write or a removal', () => {
      spyOn(localStorage, 'setItem').and.throwError('QuotaExceeded');
      const removeItem = spyOn(localStorage, 'removeItem').and.throwError(
        'SecurityError',
      );
      expect(() => storeColumnShare(0.3)).not.toThrow();
      expect(() => clearColumnShare()).not.toThrow();
      // The afterEach cleanup runs before Jasmine removes the spy: let it reach real storage.
      removeItem.and.callThrough();
    });
  });
});
