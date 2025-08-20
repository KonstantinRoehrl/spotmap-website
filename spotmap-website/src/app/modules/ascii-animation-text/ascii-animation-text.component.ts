// ascii-animation-text.component.ts
import { Component, input, signal, OnInit, Output, EventEmitter, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-ascii-animation-text',
  standalone: true,
  templateUrl: './ascii-animation-text.component.html',
  styleUrls: ['./ascii-animation-text.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class AsciiAnimationTextComponent implements OnInit {
  public text = input.required<string>();

  public displayText = signal('');
  public finished = signal(false);

  private chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*()[]{}<>?/\\|~!^+-_=.,:;\'"`';

  @Output() animationFinished = new EventEmitter<void>();

  ngOnInit() {
    const originalLines = this.text().split('\n').map(line => line.split(''));
    const { targetLines, currentLines } = this.scaleTextToViewport(originalLines);
    this.displayText.set(this.formatLines(currentLines));

    this.startPhase(targetLines, currentLines);
  }

  private scaleTextToViewport(originalLines: string[][]): { targetLines: string[][], currentLines: string[][] } {
    // Calculate desired dimensions based on viewport
    const charWidth = 12; // approximate character width in pixels
    const charHeight = 16; // approximate character height in pixels
    const targetCols = Math.floor(window.innerWidth / charWidth);
    const targetRows = Math.floor(window.innerHeight / charHeight);

    // Find original dimensions
    const originalRows = originalLines.length;
    const originalCols = Math.max(...originalLines.map(line => line.length));

    // Calculate padding needed to center the original text
    const padTop = Math.floor((targetRows - originalRows) / 2);
    const padLeft = Math.floor((targetCols - originalCols) / 2);

    // Create the scaled grid
    const targetLines: string[][] = [];
    const currentLines: string[][] = [];

    for (let row = 0; row < targetRows; row++) {
      const targetRow: string[] = [];
      const currentRow: string[] = [];

      for (let col = 0; col < targetCols; col++) {
        const originalRow = row - padTop;
        const originalCol = col - padLeft;

        if (originalRow >= 0 && originalRow < originalRows && 
            originalCol >= 0 && originalCol < originalLines[originalRow].length) {
          targetRow.push(originalLines[originalRow][originalCol]);
        } else {
          targetRow.push(' ');
        }
        currentRow.push(' ');
      }

      targetLines.push(targetRow);
      currentLines.push(currentRow);
    }

    return { targetLines, currentLines };
  }

  private randomChar(): string {
    return this.chars.charAt(Math.floor(Math.random() * this.chars.length));
  }

  private formatLines(lines: string[][]): string {
    return lines.map(row => row.join('')).join('\n');
  }

  private getNeighbors(row: number, col: number, lines: string[][]): Array<{r: number, c: number}> {
    const neighbors = [];
    const directions = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
    
    for (const [dr, dc] of directions) {
      const newR = row + dr;
      const newC = col + dc;
      if (newR >= 0 && newR < lines.length && newC >= 0 && newC < lines[newR].length) {
        neighbors.push({r: newR, c: newC});
      }
    }
    return neighbors;
  }

  /** Phase 1: Start phase (~3s) */
  private startPhase(target: string[][], current: string[][]) {
    const duration = 2000;
    const start = Date.now();

    const interval = setInterval(() => {
      const progress = Math.min(1, (Date.now() - start) / duration);
      const newLines = current.map(row => [...row]);

      // Count current non-space characters (including padding areas)
      let totalNonSpaces = 0;
      let totalSpaces = current.length * current[0].length;
      
      for (let i = 0; i < current.length; i++) {
        for (let j = 0; j < current[i].length; j++) {
          if (current[i][j] !== ' ') totalNonSpaces++;
        }
      }

      const populationProgress = totalNonSpaces / totalSpaces;

      // Random character spawning for ALL positions (including padding)
      for (let i = 0; i < current.length; i++) {
        for (let j = 0; j < current[i].length; j++) {
          if (current[i][j] === ' ') {
            // Different spawn rates for target vs padding areas
            const isTargetArea = target[i][j] !== ' ';
            const baseSpawnRate = isTargetArea ? 0.012 : 0.008;
            const progressBoost = progress * (isTargetArea ? 0.020 : 0.015);
            
            if (Math.random() < baseSpawnRate + progressBoost) {
              newLines[i][j] = this.randomChar();
            }
          } else if (current[i][j] !== ' ') {
            // Game of Life-like spreading for all non-space characters
            if (populationProgress < 0.7) {
              const neighbors = this.getNeighbors(i, j, current);
              for (const {r, c} of neighbors) {
                if (current[r][c] === ' ' && Math.random() < 0.06) {
                  newLines[r][c] = this.randomChar();
                }
              }
            }
            
            // All non-whitespace characters keep switching
            if (Math.random() < 0.1) {
              newLines[i][j] = this.randomChar();
            }
            
            // VERY small chance to find correct character (only during later part)
            if (target[i][j] !== ' ' && progress > 0.6 && Math.random() < 0.008) {
              newLines[i][j] = target[i][j];
            }
            
            // Correct characters can switch again
            if (current[i][j] === target[i][j] && Math.random() < 0.3) {
              newLines[i][j] = this.randomChar();
            }
          }
        }
      }

      this.displayText.set(this.formatLines(newLines));

      // Update current state
      for (let i = 0; i < current.length; i++) {
        for (let j = 0; j < current[i].length; j++) {
          current[i][j] = newLines[i][j];
        }
      }

      if (Date.now() - start > duration) {
        clearInterval(interval);
        
        // DON'T force correct characters yet - let main phase handle it
        // Just ensure all positions have some character
        /*for (let i = 0; i < current.length; i++) {
          for (let j = 0; j < current[i].length; j++) {
            if (current[i][j] === ' ') {
              current[i][j] = this.randomChar();
            }
          }
        }*/
        this.displayText.set(this.formatLines(current));
        
        this.mainPhase(target, current);
      }
    }, 100);
  }

  /** Phase 2: Main phase (~2s) */
  private mainPhase(target: string[][], current: string[][]) {
    const duration = 3000;
    const start = Date.now();

    const interval = setInterval(() => {
      const progress = Math.min(1, (Date.now() - start) / duration);
      const newLines = current.map((row, i) =>
        row.map((c, j) => {
          // For target text areas
          if (target[i][j] !== ' ') {
            if (c !== target[i][j]) {
              // Gradually increase chance to find correct character
              return Math.random() < 0.15 + (progress * 0.25) ? target[i][j] : this.randomChar();
            } else {
              // Very small chance for correct characters to glitch
              if (Math.random() < 0.0001) return this.randomChar();
              return c;
            }
          } 
          // For padding areas - keep them random but slowly fade them
          else {
            if (progress > 0.3 && Math.random() < (progress - 0.3) * 0.8) {
              return ' '; // Gradually clear padding areas
            }
            // Keep switching random characters in padding
            if (Math.random() < 0.3) {
              return this.randomChar();
            }
            return c;
          }
        })
      );

      this.displayText.set(this.formatLines(newLines));

      // Update current state
      for (let i = 0; i < current.length; i++) {
        for (let j = 0; j < current[i].length; j++) {
          current[i][j] = newLines[i][j];
        }
      }

      if (Date.now() - start > duration) {
        clearInterval(interval);
        this.endPhase(target, current);
      }
    }, 100);
  }

  /** Phase 3: End phase (~3s) */
  private endPhase(target: string[][], current: string[][]) {
    const duration = 2000;
    const start = Date.now();

    const interval = setInterval(() => {
      const progress = Math.min(1, (Date.now() - start) / duration);
      const newLines = current.map(row => [...row]);

      // Phase 1: Characters become random (first 60% of duration)
      if (progress < 0.6) {
        const randomProgress = progress / 0.6; // 0 to 1 over first 60%
        
        for (let i = 0; i < current.length; i++) {
          for (let j = 0; j < current[i].length; j++) {
            // Randomize ALL non-space characters (including padding areas)
            if (current[i][j] !== ' ' && Math.random() < randomProgress * 0.35) {
              newLines[i][j] = this.randomChar();
            }
          }
        }
      } else {
        // Phase 2: Characters become whitespace (last 40%)
        const holeProgress = (progress - 0.6) / 0.4; // 0 to 1 over last 40%

        // Create holes and spread them more gradually
        for (let i = 0; i < current.length; i++) {
          for (let j = 0; j < current[i].length; j++) {
            // Create initial holes randomly but slowly (for ALL areas)
            if (current[i][j] !== ' ' && Math.random() < holeProgress * 0.025) {
              newLines[i][j] = ' ';
            }
            
            // Spread holes to neighbors more gradually
            if (current[i][j] === ' ') {
              const neighbors = this.getNeighbors(i, j, current);
              for (const {r, c} of neighbors) {
                if (current[r][c] !== ' ' && Math.random() < holeProgress * 0.08) {
                  newLines[r][c] = ' ';
                }
              }
            }
            
            // Characters not near holes still randomize
            if (current[i][j] !== ' ') {
              const neighbors = this.getNeighbors(i, j, current);
              const hasSpaceNeighbor = neighbors.some(({r, c}) => current[r][c] === ' ');
              
              if (!hasSpaceNeighbor && Math.random() < 0.25) {
                newLines[i][j] = this.randomChar();
              }
            }
          }
        }

        // Faster depopulation for padding areas in later stage
        if (holeProgress > 0.3) {
          for (let i = 0; i < current.length; i++) {
            for (let j = 0; j < current[i].length; j++) {
              if (current[i][j] !== ' ' && target[i][j] === ' ' && Math.random() < (holeProgress - 0.3) * 0.4) {
                newLines[i][j] = ' ';
              }
            }
          }
        }
      }

      this.displayText.set(this.formatLines(newLines));

      // Update current state
      for (let i = 0; i < current.length; i++) {
        for (let j = 0; j < current[i].length; j++) {
          current[i][j] = newLines[i][j];
        }
      }

      if (progress >= 1) {
        clearInterval(interval);
        
        // Final state: all whitespace
        const finalLines = current.map(row => row.map(() => ' '));
        this.displayText.set(this.formatLines(finalLines));
        
        this.finished.set(true);
        this.animationFinished.emit();
      }
    }, 120);
  }
}