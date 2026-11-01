/**
 * The settle under reduced motion: the sheet fades out over half of `--dur-fade`, takes its new
 * geometry, and fades back in, so it never travels. It uses the Web Animations API because the global
 * net forces every CSS transition to the full `--dur-fade`.
 */
export class SheetSettleFade {
  private animation: Animation | null = null;
  private takeNewGeometry: (() => void) | null = null;

  constructor(private readonly host: HTMLElement) {}

  /** Whether the sheet is still fading out, so its new geometry has yet to be taken. */
  get goingOut(): boolean {
    return this.takeNewGeometry !== null;
  }

  /**
   * Fades out, calls `takeNewGeometry`, and fades back in. A settle arriving while the fade is still
   * going out only replaces what is taken at its midpoint. One arriving on the way back in starts over.
   */
  run(takeNewGeometry: () => void): void {
    if (this.takeNewGeometry) {
      this.takeNewGeometry = takeNewGeometry;
      return;
    }
    this.animation?.cancel();
    this.takeNewGeometry = takeNewGeometry;
    this.play(1, 0).finished.then(
      () => {
        this.takeNewGeometry?.();
        this.takeNewGeometry = null;
        this.play(0, 1).finished.then(
          () => this.settle(),
          () => undefined,
        );
      },
      () => undefined,
    );
  }

  /** Stops the fade at full opacity: a press has taken the sheet. The drag owns its geometry now. */
  cancel(): void {
    this.takeNewGeometry = null;
    this.animation?.cancel();
    this.animation = null;
  }

  /** Plays half of the fade from `from` to `to`. */
  private play(from: number, to: number): Animation {
    this.animation?.cancel();
    const fade = parseFloat(
      getComputedStyle(this.host).getPropertyValue('--dur-fade'),
    );
    this.animation = this.host.animate(
      { opacity: [from, to] },
      { duration: fade / 2, easing: 'ease-out', fill: 'forwards' },
    );
    return this.animation;
  }

  /** The fade is over: the host keeps no animation. */
  private settle(): void {
    this.animation?.cancel();
    this.animation = null;
  }
}
