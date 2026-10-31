import { computed } from '@angular/core';
import { ImageLoadTracker } from './image-load-tracker';

function element(src: string | null, complete = true, naturalWidth = 100) {
  return {
    getAttribute: () => src,
    complete,
    naturalWidth,
  } as unknown as HTMLImageElement;
}

function eventFrom(image: HTMLImageElement): Event {
  return { target: image } as unknown as Event;
}

describe('ImageLoadTracker', () => {
  it('marks the URL the element itself shows, on load and on error', () => {
    const tracker = new ImageLoadTracker();
    tracker.onLoad(eventFrom(element('a.webp')));
    tracker.onError(eventFrom(element('b.webp')));
    expect(tracker.loaded().has('a.webp')).toBeTrue();
    expect(tracker.failed().has('b.webp')).toBeTrue();
    expect(tracker.loaded().has('b.webp')).toBeFalse();
  });

  it('ignores an event from an element without a src', () => {
    const tracker = new ImageLoadTracker();
    tracker.onLoad(eventFrom(element(null)));
    tracker.onError(eventFrom(element(null)));
    expect(tracker.loaded().size).toBe(0);
    expect(tracker.failed().size).toBe(0);
  });

  it('marks a complete image loaded, and instant only when asked', () => {
    const tracker = new ImageLoadTracker();
    tracker.noteComplete(element('a.webp'), { instant: true });
    tracker.noteComplete(element('b.webp'), { instant: false });
    expect(tracker.loaded().has('a.webp')).toBeTrue();
    expect(tracker.instant().has('a.webp')).toBeTrue();
    expect(tracker.loaded().has('b.webp')).toBeTrue();
    expect(tracker.instant().has('b.webp')).toBeFalse();
  });

  it('leaves an unfinished, broken or absent image alone', () => {
    const tracker = new ImageLoadTracker();
    tracker.noteComplete(element('a.webp', false), { instant: true });
    tracker.noteComplete(element('b.webp', true, 0), { instant: true });
    tracker.noteComplete(undefined, { instant: true });
    tracker.noteComplete(null, { instant: true });
    expect(tracker.loaded().size).toBe(0);
    expect(tracker.instant().size).toBe(0);
  });

  it('does not make an already loaded image instant', () => {
    const tracker = new ImageLoadTracker();
    tracker.markLoaded('a.webp');
    tracker.noteComplete(element('a.webp'), { instant: true });
    expect(tracker.instant().has('a.webp')).toBeFalse();
  });

  it('subscribes its caller to the loaded set only for a complete image', () => {
    const tracker = new ImageLoadTracker();
    let runs = 0;
    const probe = computed(() => {
      tracker.noteComplete(element('a.webp', false), { instant: true });
      return ++runs;
    });
    probe();
    tracker.markLoaded('b.webp');
    probe();
    expect(runs).toBe(1);
  });

  it('forgets what was instant and keeps what loaded', () => {
    const tracker = new ImageLoadTracker();
    tracker.noteComplete(element('a.webp'), { instant: true });
    tracker.clearInstant();
    expect(tracker.instant().size).toBe(0);
    expect(tracker.loaded().has('a.webp')).toBeTrue();
  });
});
