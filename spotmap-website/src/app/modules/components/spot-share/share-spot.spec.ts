import {
  copySpotLink,
  hasShareSheet,
  ShareNavigator,
  shareSpot,
  spotLink,
} from './share-spot';

/** The parts of `navigator` a share uses, each present only when given. */
function fakeNavigator(parts: {
  share?: jasmine.Spy;
  canShare?: (data: ShareData) => boolean;
  writeText?: jasmine.Spy;
}): ShareNavigator {
  return {
    ...(parts.share ? { share: parts.share } : {}),
    ...(parts.canShare ? { canShare: parts.canShare } : {}),
    ...(parts.writeText ? { clipboard: { writeText: parts.writeText } } : {}),
  } as unknown as ShareNavigator;
}

const LINK = 'https://example.test/spotmap-website/spot/a-1';

describe('spotLink', () => {
  it('builds the absolute link under the base href', () => {
    expect(spotLink('a-1', 'https://example.test/spotmap-website/')).toBe(LINK);
  });

  it('encodes an id as one path segment', () => {
    expect(spotLink('x y/z', 'https://example.test/spotmap-website/')).toBe(
      'https://example.test/spotmap-website/spot/x%20y%2Fz',
    );
  });

  it('resolves against the document’s base URI by default', () => {
    expect(spotLink('a-1')).toBe(new URL('spot/a-1', document.baseURI).href);
  });
});

describe('shareSpot', () => {
  it('hands the link and the name to the native share sheet', async () => {
    const share = jasmine.createSpy('share').and.resolveTo();
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    expect(
      await shareSpot(LINK, 'Alpha Bank', fakeNavigator({ share, writeText })),
    ).toBe('shared');
    expect(share).toHaveBeenCalledOnceWith({ url: LINK, title: 'Alpha Bank' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('treats a dismissed share sheet as cancelled, copying nothing', async () => {
    const share = jasmine
      .createSpy('share')
      .and.rejectWith(new DOMException('dismissed', 'AbortError'));
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    expect(
      await shareSpot(LINK, 'Alpha Bank', fakeNavigator({ share, writeText })),
    ).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the link when the share sheet fails for another reason', async () => {
    const share = jasmine
      .createSpy('share')
      .and.rejectWith(new DOMException('blocked', 'NotAllowedError'));
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    expect(
      await shareSpot(LINK, 'Alpha Bank', fakeNavigator({ share, writeText })),
    ).toBe('copied');
    expect(writeText).toHaveBeenCalledOnceWith(LINK);
  });

  it('copies the link when the browser says it cannot share it', async () => {
    const share = jasmine.createSpy('share').and.resolveTo();
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    expect(
      await shareSpot(
        LINK,
        'Alpha Bank',
        fakeNavigator({ share, canShare: () => false, writeText }),
      ),
    ).toBe('copied');
    expect(share).not.toHaveBeenCalled();
  });

  it('copies the link where there is no share sheet', async () => {
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    expect(
      await shareSpot(LINK, 'Alpha Bank', fakeNavigator({ writeText })),
    ).toBe('copied');
    expect(writeText).toHaveBeenCalledOnceWith(LINK);
  });

  it('reports a refused copy', async () => {
    const writeText = jasmine
      .createSpy('writeText')
      .and.rejectWith(new DOMException('denied', 'NotAllowedError'));
    expect(
      await shareSpot(LINK, 'Alpha Bank', fakeNavigator({ writeText })),
    ).toBe('copy-failed');
  });

  it('reports a failed copy where there is no clipboard either', async () => {
    expect(await shareSpot(LINK, 'Alpha Bank', fakeNavigator({}))).toBe(
      'copy-failed',
    );
  });
});

describe('hasShareSheet', () => {
  const data: ShareData = { url: LINK, title: 'Alpha Bank' };

  it('is true where the browser shares and has no canShare to ask', () => {
    const share = jasmine.createSpy('share').and.resolveTo();
    expect(hasShareSheet(fakeNavigator({ share }), data)).toBeTrue();
  });

  it('is true where canShare accepts the link', () => {
    const share = jasmine.createSpy('share').and.resolveTo();
    const canShare = jasmine.createSpy('canShare').and.returnValue(true);
    expect(hasShareSheet(fakeNavigator({ share, canShare }), data)).toBeTrue();
    expect(canShare).toHaveBeenCalledOnceWith(data);
  });

  it('is false where canShare refuses the link', () => {
    const share = jasmine.createSpy('share').and.resolveTo();
    expect(
      hasShareSheet(fakeNavigator({ share, canShare: () => false }), data),
    ).toBeFalse();
  });

  it('is false where there is no share sheet at all', () => {
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    expect(hasShareSheet(fakeNavigator({ writeText }), data)).toBeFalse();
  });
});

describe('copySpotLink', () => {
  it('writes the link to the clipboard', async () => {
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    expect(await copySpotLink(LINK, fakeNavigator({ writeText }))).toBe(
      'copied',
    );
    expect(writeText).toHaveBeenCalledOnceWith(LINK);
  });

  it('reports a refused write', async () => {
    const writeText = jasmine
      .createSpy('writeText')
      .and.rejectWith(new DOMException('denied', 'NotAllowedError'));
    expect(await copySpotLink(LINK, fakeNavigator({ writeText }))).toBe(
      'copy-failed',
    );
  });

  it('reports a failed copy where there is no clipboard', async () => {
    expect(await copySpotLink(LINK, fakeNavigator({}))).toBe('copy-failed');
  });
});
