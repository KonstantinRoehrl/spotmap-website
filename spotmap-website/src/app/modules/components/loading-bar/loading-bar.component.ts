import { CommonModule } from '@angular/common';
import { Component, computed, OnDestroy, OnInit, signal } from '@angular/core';
import { GlitchTextDirective } from '../../directives/glitch-text.directive';
import { AsciiAnimationTextComponent } from '../ascii-animation-text/ascii-animation-text.component';

@Component({
  selector: 'app-loading-bar',
  standalone: true,
  imports: [CommonModule, AsciiAnimationTextComponent, GlitchTextDirective],
  templateUrl: './loading-bar.component.html',
  styleUrl: './loading-bar.component.css'
})
export class LoadingBarComponent implements OnInit, OnDestroy {
  columns = signal<string[][]>([]);

  // Compute a circular mask over the square matrix
  private rotation = signal(0); // in degrees

  maskedColumns = computed(() => {
    const rows = this.columns().length;
    if (rows === 0) return [];
    const cols = this.columns()[0].length;

    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);

    const outerRadius = Math.floor(Math.min(cx, cy));
    const thickness = 3;
    const innerRadius = outerRadius - thickness;

    const baseGap = 90;       // angular gap at the middle of the ring
    const arrowSharpness = 2; // controls how pointed the arrow is

    const currentRotation = this.rotation();

    return this.columns().map((row, y) =>
      row.map((char, x) => {
        const dx = x - cx;
        const dy = y - cy;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < innerRadius || distance > outerRadius) return ' ';

        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;

        // radial weight relative to middle radius
        const t = (distance - innerRadius) / (outerRadius - innerRadius); // 0 at inner, 1 at outer
        const innerWeight = Math.pow(1 - t, arrowSharpness); // inner taper
        const outerWeight = Math.pow(t, arrowSharpness);     // outer taper

        // compute gap angular width for inner and outer radius separately
        const innerGap = baseGap * innerWeight;
        const outerGap = baseGap * outerWeight;

        const gapStart = (currentRotation - innerGap) % 360;
        const gapEnd = (currentRotation + outerGap) % 360;

        // angular masking with wrap-around
        if (gapStart < gapEnd) {
          if (angle >= gapStart && angle <= gapEnd) return ' ';
        } else {
          if (angle >= gapStart || angle <= gapEnd) return ' ';
        }

        return char;
      })
    );
  });

  /** With arrow tips */
  maskedColumnsArrow = computed(() => {
    const rows = this.columns().length;
    if (rows === 0) return [];
    const cols = this.columns()[0].length;

    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);

    const outerRadius = Math.floor(Math.min(cx, cy));
    const thickness = 3;
    const innerRadius = outerRadius - thickness;

    const baseGap = 15;      // min angular gap at edges
    const tipGap = 60;       // max angular gap at middle
    const sharpness = 3;     // >1 = sharper arrow, <1 = smoother

    const middleRadius = (innerRadius + outerRadius) / 2;
    const currentRotation = this.rotation();

    return this.columns().map((row, y) =>
      row.map((char, x) => {
        const dx = x - cx;
        const dy = y - cy;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < innerRadius || distance > outerRadius) return ' ';

        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;

        // radial weight relative to middle radius
        let t = 1 - Math.abs(distance - middleRadius) / (thickness / 2);
        t = Math.max(0, t);
        const weight = Math.pow(t, sharpness);

        // interpolate angular gap based on radial weight
        const adjustedGap = baseGap + weight * (tipGap - baseGap);

        // Shift gapStart and gapEnd so that widest point is at middle radius
        const gapStart = (currentRotation - 20 + (adjustedGap / 2)) % 360;
        const gapEnd = (currentRotation + 20 + (adjustedGap / 2)) % 360;

        // angular masking with wrap-around
        if (gapStart < gapEnd) {
          if (angle >= gapStart && angle <= gapEnd) return ' ';
        } else {
          if (angle >= gapStart || angle <= gapEnd) return ' ';
        }

        return char;
      })
    );
  });




  private shiftIntervalId?: number;
  private rotationIntervalId?: number;
  private readonly matrixChars = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()[]{}|;:,.<>?';
  private readonly numColumns = 21; // square
  private readonly charsPerColumn = 21;

  ngOnInit() {
    this.initializeMatrix();
    this.startAnimation();
  }

  ngOnDestroy() {
    if (this.shiftIntervalId) clearInterval(this.shiftIntervalId);
    if (this.rotationIntervalId) clearInterval(this.rotationIntervalId);
  }

  // Initialize the square matrix
  private initializeMatrix() {
    this.columns.set([]); // clear first

    for (let i = 0; i < this.numColumns; i++) {
      const column: string[] = [];
      for (let j = 0; j < this.charsPerColumn; j++) {
        column.push(this.getRandomChar());
      }

      this.columns.update(prev => [...prev, column]);
    }
  }

  private getRandomChar(): string {
    return this.matrixChars[Math.floor(Math.random() * this.matrixChars.length)];
  }

  // Start both timers
  private startAnimation() {
    const time = 50;

    // Shift characters every 50ms
    this.shiftIntervalId = window.setInterval(() => {
      this.shiftCharacters();
    }, time);

    // Rotate 4x as fast (every 12.5ms)
    this.rotationIntervalId = window.setInterval(() => {
      this.increaseRotation();
    }, time / 4);
  }

  // Stop both timers
  private stopAnimation() {
    if (this.shiftIntervalId) clearInterval(this.shiftIntervalId);
    if (this.rotationIntervalId) clearInterval(this.rotationIntervalId);
  }

  // Just update rotation signal
  private increaseRotation() {
    this.rotation.update(prev => (prev + 3) % 360); // keep it in 0–360
  }

  // Shift characters normally
  private shiftCharacters() {
    this.columns.update(prev =>
      prev.map(column => {
        const newColumn = [...column];
        newColumn.shift();
        newColumn.push(this.getRandomChar());
        return newColumn;
      })
    );
  }
}
