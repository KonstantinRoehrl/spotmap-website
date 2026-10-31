import { TestBed } from '@angular/core/testing';
import { AsciiAnimationTextComponent } from '../ascii-animation-text/ascii-animation-text.component';
import {
  bannerLineWidth,
  fittingBannerLines,
  HEADER_BANNER_FONT_PX,
  RESTING_BANNER_LINE,
  TOPBAR_BANNER_FONT_PX,
} from './topbar-banner';

/** A 320 px phone's top bar, inside its 16 px padding. */
const PHONE_320_CONTENT_PX = 320 - 2 * 16;

/** The longest house line: 33 glyphs with its cursor, 277.2 px at 14 px, so 278. */
const LONGEST_HOUSE_LINE = 'SUPPORTED BY ROLLTROTTEL-VERBAND';

/** Lines in the page's order: the resting line, the city's, then house-voice lines of each length. */
const linesFor = (cityLine: string) => [
  RESTING_BANNER_LINE,
  cityLine,
  'RESPECT THE LOCALS',
  'LET`S GO PLAZA',
  'ANYONE HAS A PIN?',
  'CONTINUOUSLY UPDATED',
];

describe('the top bar banner', () => {
  it('pins the spec’s sizes', () => {
    expect(TOPBAR_BANNER_FONT_PX).toBe(14);
    expect(HEADER_BANNER_FONT_PX).toBe(20);
    expect(RESTING_BANNER_LINE).toBe('SPOTMAP');
  });

  describe('a banner line’s width', () => {
    it('is the line and its cursor at 0.6 em a glyph, rounded up to whole pixels', () => {
      expect(bannerLineWidth('SPOTMAP', 14)).toBe(68); // 8 × 8.4 = 67.2
      expect(bannerLineWidth('LET`S GO PLAZA', 14)).toBe(126); // 15 × 8.4, exact
      expect(bannerLineWidth('BRATISLAVA SPOTMAP', 14)).toBe(160); // 19 × 8.4 = 159.6
      expect(bannerLineWidth('VIENNA SPOTMAP', 20)).toBe(180); // 15 × 12
      expect(bannerLineWidth(LONGEST_HOUSE_LINE, 14)).toBe(278); // 33 × 8.4 = 277.2
      expect(bannerLineWidth('', 14)).toBe(9); // the cursor alone
    });
  });

  describe('which lines fit', () => {
    it('keeps every line, the longest house line included, on a 320 px phone', () => {
      const lines = [...linesFor('BRATISLAVA SPOTMAP'), LONGEST_HOUSE_LINE];
      expect(fittingBannerLines(lines, PHONE_320_CONTENT_PX)).toEqual(lines);
    });

    it('drops only the lines wider than a narrower row, keeping the rest in order', () => {
      expect(
        fittingBannerLines(
          [...linesFor('BRATISLAVA SPOTMAP'), LONGEST_HOUSE_LINE],
          268,
        ),
      ).toEqual(linesFor('BRATISLAVA SPOTMAP'));
    });

    it('keeps nothing when no line fits', () => {
      expect(fittingBannerLines(linesFor('BRATISLAVA SPOTMAP'), 60)).toEqual(
        [],
      );
    });
  });

  describe('against the rendered banner', () => {
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [AsciiAnimationTextComponent],
      }).compileComponents();
    });

    const cases: [string, number][] = [
      ['SPOTMAP', TOPBAR_BANNER_FONT_PX],
      ['BRATISLAVA SPOTMAP', TOPBAR_BANNER_FONT_PX],
      ['SUPPORTED BY ROLLTROTTEL-VERBAND', HEADER_BANNER_FONT_PX],
    ];
    for (const [line, fontPx] of cases) {
      it(`gives \`${line}\` at ${fontPx} px exactly the width the banner draws it at`, () => {
        const fixture = TestBed.createComponent(AsciiAnimationTextComponent);
        fixture.componentRef.setInput('messages', [line]);
        fixture.componentRef.setInput('fixedFontSize', fontPx);
        fixture.componentRef.setInput('dotGutters', false);
        fixture.detectChanges();
        // The widest the line ever draws: whole, with the typing cursor. Set directly and measured
        // before the first animation frame can replace it.
        fixture.nativeElement.querySelector('.ascii-line').textContent =
          `${line}_`;
        fixture.detectChanges();

        const pre = fixture.nativeElement.querySelector(
          '.ascii-display',
        ) as HTMLElement;
        // The test browser is not served the web font (its file 404s under Karma), so the line
        // draws in the fallback monospace face, which also advances 0.6 em.
        expect(getComputedStyle(pre).fontFamily).toContain('IBM Plex Mono');
        expect(
          Math.abs(pre.scrollWidth - bannerLineWidth(line, fontPx)),
        ).toBeLessThanOrEqual(1);
        fixture.destroy();
      });
    }
  });
});
