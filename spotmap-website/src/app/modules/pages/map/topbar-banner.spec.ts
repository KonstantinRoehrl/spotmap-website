import { TestBed } from '@angular/core/testing';
import { SUPPORTED_CITIES } from '../../../models/map/supported-cities';
import { AsciiAnimationTextComponent } from '../../components/ascii-animation-text/ascii-animation-text.component';
import {
  bannerSlotWidth,
  fittingBannerLines,
  HEADER_BANNER_FONT_PX,
  pickerMinWidth,
  RESTING_BANNER_LINE,
  TOPBAR_BANNER_FONT_PX,
  TOPBAR_GAP_PX,
} from './topbar-banner';

/** A 320 px phone's top bar, inside its 16 px padding. */
const PHONE_320_CONTENT_PX = 320 - 2 * 16;

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
    expect(TOPBAR_GAP_PX).toBe(8);
    expect(RESTING_BANNER_LINE).toBe('SPOTMAP');
  });

  describe('the banner’s slot', () => {
    it('is the line and its cursor at 0.6 em a glyph, rounded up to whole pixels', () => {
      expect(bannerSlotWidth('SPOTMAP', 14)).toBe(68); // 8 × 8.4 = 67.2
      expect(bannerSlotWidth('LET`S GO PLAZA', 14)).toBe(126); // 15 × 8.4, exact
      expect(bannerSlotWidth('BRATISLAVA SPOTMAP', 14)).toBe(160); // 19 × 8.4 = 159.6
      expect(bannerSlotWidth('VIENNA SPOTMAP', 20)).toBe(180); // 15 × 12
      expect(bannerSlotWidth('', 14)).toBe(9); // the cursor alone
    });
  });

  describe('the picker’s minimum', () => {
    it('is the label at 13 px, the arrow and 12 px each side', () => {
      expect(pickerMinWidth('Bratislava · SK')).toBe(153); // 117 + 12 + 24
      expect(pickerMinWidth('Vienna · AT')).toBe(122); // 85.8 + 36 = 121.8
    });
  });

  describe('which lines fit', () => {
    it('keeps only the short lines beside Bratislava’s picker on a 320 px phone', () => {
      // 288 − 8 − 153 leaves 127 px: `LET`S GO PLAZA` (126) is the longest that fits.
      expect(
        fittingBannerLines(
          linesFor('BRATISLAVA SPOTMAP'),
          PHONE_320_CONTENT_PX,
          'Bratislava · SK',
        ),
      ).toEqual([RESTING_BANNER_LINE, 'LET`S GO PLAZA']);
    });

    it('keeps the city line and more beside Vienna’s shorter picker', () => {
      // 288 − 8 − 122 leaves 158 px: `ANYONE HAS A PIN?` (152) fits, the 18-glyph line (160) does not.
      expect(
        fittingBannerLines(
          linesFor('VIENNA SPOTMAP'),
          PHONE_320_CONTENT_PX,
          'Vienna · AT',
        ),
      ).toEqual([
        RESTING_BANNER_LINE,
        'VIENNA SPOTMAP',
        'LET`S GO PLAZA',
        'ANYONE HAS A PIN?',
      ]);
    });

    it('lets the longer lines back in on a wider phone', () => {
      // A 390 px phone: 358 − 8 − 153 leaves 197 px.
      expect(
        fittingBannerLines(
          linesFor('BRATISLAVA SPOTMAP'),
          390 - 32,
          'Bratislava · SK',
        ),
      ).toEqual(linesFor('BRATISLAVA SPOTMAP'));
    });

    it('always keeps the resting line at 320 px, whichever city is chosen', () => {
      for (const entry of Object.values(SUPPORTED_CITIES)) {
        const label = `${entry.city} · ${entry.countryCode}`;
        expect(
          fittingBannerLines(
            [RESTING_BANNER_LINE],
            PHONE_320_CONTENT_PX,
            label,
          ),
        )
          .withContext(label)
          .toEqual([RESTING_BANNER_LINE]);
      }
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
        fixture.componentInstance.baseText.set(`${line}_`);
        fixture.detectChanges();

        const pre = fixture.nativeElement.querySelector(
          '.ascii-display',
        ) as HTMLElement;
        // The test browser is not served the web font (its file 404s under Karma), so the line
        // draws in the fallback monospace face, which also advances 0.6 em.
        expect(getComputedStyle(pre).fontFamily).toContain('IBM Plex Mono');
        expect(
          Math.abs(pre.scrollWidth - bannerSlotWidth(line, fontPx)),
        ).toBeLessThanOrEqual(1);
        fixture.destroy();
      });
    }
  });
});
