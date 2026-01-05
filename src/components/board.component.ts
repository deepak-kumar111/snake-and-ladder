
import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService, SNAKES, LADDERS, SPECIAL_SQUARES } from '../services/game.service';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Main Board Container: Scales to fit viewport while staying square -->
    <div class="relative w-[95vmin] h-[95vmin] bg-yellow-400 rounded-lg shadow-2xl border-8 border-yellow-700 overflow-hidden mx-auto font-sans">
        
        <!-- Base Camp (Waiting Area) -->
        <div class="absolute top-1 left-1 z-20 flex flex-col gap-1 pointer-events-none">
             @for (player of playersInBase(); track player.id) {
                 <div 
                    class="w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-white shadow-lg relative animate-bounce"
                    [style.backgroundColor]="player.color"
                 >
                    <img [src]="player.avatarUrl" class="w-full h-full rounded-full object-cover">
                    <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[8px] bg-black/80 text-white px-1 rounded font-bold whitespace-nowrap">WAIT</div>
                 </div>
             }
        </div>

        <!-- Grid -->
        <div class="board-grid h-full w-full">
            @for (cell of cells; track cell) {
            <div 
                class="relative border border-black/10 flex items-start justify-start p-1"
                [style.backgroundColor]="getCellColor(cell)"
            >
                <!-- Number -->
                <span class="text-[12px] md:text-lg font-black text-black/70 z-0 leading-none">{{ cell }}</span>
                
                <!-- Special Squares Icons -->
                @if (specialSquare(cell); as type) {
                    <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                        <div class="bg-white/30 backdrop-blur-sm rounded-full p-1 md:p-2 shadow-inner">
                            <span class="text-xl md:text-3xl filter drop-shadow-md">
                                @switch (type) {
                                    @case ('boost') { ⚡ }
                                    @case ('trap') { 💣 }
                                    @case ('freeze') { ❄️ }
                                    @case ('double') { 🎲 }
                                }
                            </span>
                        </div>
                    </div>
                }
            </div>
            }
        </div>

        <!-- Snakes and Ladders SVGs -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
                <!-- Gradients for Snakes -->
                <linearGradient id="snakeGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#16a34a;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#d9f99d;stop-opacity:1" />
                </linearGradient>
                <linearGradient id="snakeGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#dc2626;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#fca5a5;stop-opacity:1" />
                </linearGradient>
                <linearGradient id="snakeGradient3" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#7c3aed;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#c4b5fd;stop-opacity:1" />
                </linearGradient>
                <linearGradient id="snakeGradient4" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#93c5fd;stop-opacity:1" />
                </linearGradient>

                <filter id="shadow">
                    <feDropShadow dx="0.5" dy="0.5" stdDeviation="0.5" flood-opacity="0.5"/>
                </filter>
            </defs>

            <!-- LADDERS: Rendered directly to avoid innerHTML sanitization issues -->
            @for (ladder of laddersWithGeometry; track $index) {
                <!-- Rails -->
                @for (rail of ladder.rails; track $index) {
                     <line 
                        [attr.x1]="rail.x1" 
                        [attr.y1]="rail.y1" 
                        [attr.x2]="rail.x2" 
                        [attr.y2]="rail.y2" 
                        stroke="#713f12" 
                        stroke-width="1.0" 
                        stroke-linecap="round"
                    />
                }
                <!-- Rungs -->
                @for (rung of ladder.rungs; track $index) {
                    <line 
                        [attr.x1]="rung.x1" 
                        [attr.y1]="rung.y1" 
                        [attr.x2]="rung.x2" 
                        [attr.y2]="rung.y2" 
                        stroke="#854d0e" 
                        stroke-width="0.8" 
                        stroke-linecap="round"
                    />
                }
            }

            <!-- SNAKES -->
            @for (snake of snakesList; track snake.start; let i = $index) {
                <!-- Snake Body -->
                <path 
                    [attr.d]="generateSnakePath(snake.start, snake.end)" 
                    fill="none" 
                    [attr.stroke]="getSnakeColor(i)"
                    stroke-width="2.5" 
                    stroke-linecap="round"
                    filter="url(#shadow)"
                />
                <!-- Snake Pattern (Stripes) -->
                <path 
                    [attr.d]="generateSnakePath(snake.start, snake.end)" 
                    fill="none" 
                    stroke="rgba(255,255,255,0.3)" 
                    stroke-width="0.5" 
                    stroke-dasharray="0.5 0.5"
                    stroke-linecap="round"
                />
                <!-- Head (Circle for now, maybe add eyes if time) -->
                <circle [attr.cx]="getCoord(snake.start).x" [attr.cy]="getCoord(snake.start).y" r="1.5" [attr.fill]="getSnakeColor(i)" filter="url(#shadow)" />
                <circle [attr.cx]="getCoord(snake.start).x - 0.5" [attr.cy]="getCoord(snake.start).y - 0.5" r="0.4" fill="white" />
                <circle [attr.cx]="getCoord(snake.start).x + 0.5" [attr.cy]="getCoord(snake.start).y - 0.5" r="0.4" fill="white" />
                <circle [attr.cx]="getCoord(snake.start).x - 0.5" [attr.cy]="getCoord(snake.start).y - 0.5" r="0.1" fill="black" />
                <circle [attr.cx]="getCoord(snake.start).x + 0.5" [attr.cy]="getCoord(snake.start).y - 0.5" r="0.1" fill="black" />
                
                <!-- Tongue -->
                 <path 
                    [attr.d]="'M ' + getCoord(snake.start).x + ' ' + (getCoord(snake.start).y + 1) + ' l -0.5 1 l 1 -1 l 0.5 1'" 
                    stroke="red" 
                    stroke-width="0.3" 
                    fill="none" 
                 />
            }

        </svg>

        <!-- Players -->
        @for (player of gameService.state().players; track player.id) {
            @if (player.hasStarted) {
                <div 
                class="absolute w-[8%] h-[8%] transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1) z-30 flex items-center justify-center pointer-events-none"
                [style.left]="(getCoord(player.position).x - 4) + '%'"
                [style.top]="(getCoord(player.position).y - 4) + '%'"
                >
                <div 
                    class="w-full h-full rounded-full border-2 shadow-2xl relative transform transition-transform"
                    [class.scale-125]="gameService.state().currentPlayerIndex === $index"
                    [class.z-40]="gameService.state().currentPlayerIndex === $index"
                    [style.borderColor]="player.color"
                    [style.boxShadow]="'0 0 10px ' + player.color"
                    [style.backgroundColor]="'white'"
                >
                    <img [src]="player.avatarUrl" class="w-full h-full rounded-full object-cover">
                    <!-- Nametag -->
                    <div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-black/80 text-[6px] md:text-[8px] text-white px-1 rounded whitespace-nowrap border border-white/20">
                        {{ player.name }}
                    </div>
                </div>
                </div>
            }
        }
    </div>
  `
})
export class BoardComponent {
  gameService = inject(GameService);
  
  playersInBase = computed(() => this.gameService.state().players.filter(p => !p.hasStarted));

  // Colorful Grid Logic
  get cells() {
    const arr = [];
    for (let row = 9; row >= 0; row--) {
      const rowCells = [];
      const start = row * 10 + 1;
      const end = (row + 1) * 10;
      for (let i = start; i <= end; i++) {
        rowCells.push(i);
      }
      if (row % 2 !== 0) rowCells.reverse();
      arr.push(...rowCells);
    }
    return arr;
  }

  getCellColor(cell: number): string {
      const row = Math.floor((cell - 1) / 10);
      const col = (cell - 1) % 10;
      // Checkerboard pattern with Red, Orange, Yellow
      if ((row + col) % 3 === 0) return '#fca5a5'; // Red-ish
      if ((row + col) % 3 === 1) return '#fcd34d'; // Yellow-ish
      return '#fdba74'; // Orange-ish
  }
  
  // Coordinate System (0-100% for SVG)
  getCoord(num: number) {
     if (num <= 0) return { x: -5, y: 105 };
     const row0Indexed = Math.floor((num - 1) / 10);
     const col0Indexed = (num - 1) % 10;
     
     // Visual Row (9 is top, 0 is bottom in standard grid, but we draw top down)
     const visualRow = 9 - row0Indexed;
     
     // Visual Column (Alternating)
     let visualCol = col0Indexed;
     if (row0Indexed % 2 !== 0) {
        visualCol = 9 - col0Indexed;
     }

     // Center of cell in %
     const x = visualCol * 10 + 5;
     const y = visualRow * 10 + 5;
     return { x, y };
  }

  snakesList = Object.entries(SNAKES).map(([start, end]) => ({ start: +start, end: +end }));
  laddersList = Object.entries(LADDERS).map(([start, end]) => ({ start: +start, end: +end }));

  isSnakeHead(num: number) { return !!SNAKES[num]; }
  isLadderStart(num: number) { return !!LADDERS[num]; }
  specialSquare(num: number) { return SPECIAL_SQUARES[num]; }

  // Snake SVG Generator
  generateSnakePath(start: number, end: number): string {
    const s = this.getCoord(start);
    const e = this.getCoord(end);
    
    // Calculate control points for S-curve
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    // Midpoints 1/3 and 2/3
    const m1x = s.x + dx * 0.33;
    const m1y = s.y + dy * 0.33;
    const m2x = s.x + dx * 0.66;
    const m2y = s.y + dy * 0.66;

    // Normal vector for wiggle
    // If snake is vertical, wiggle horizontal. If horizontal, wiggle vertical.
    // Simple perpendicular vector: (-dy, dx) normalized
    let nx = -dy / dist;
    let ny = dx / dist;

    // Amplitude of wiggle
    const amp = 5; 

    const cp1x = m1x + nx * amp;
    const cp1y = m1y + ny * amp;
    const cp2x = m2x - nx * amp;
    const cp2y = m2y - ny * amp;

    return `M ${s.x} ${s.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${e.x} ${e.y}`;
  }

  getSnakeColor(index: number) {
      const gradients = ['url(#snakeGradient1)', 'url(#snakeGradient2)', 'url(#snakeGradient3)', 'url(#snakeGradient4)'];
      return gradients[index % gradients.length];
  }

  // Pre-calculate Ladder Geometry so template can render lines safely
  get laddersWithGeometry() {
    return this.laddersList.map(l => {
        const s = this.getCoord(l.start);
        const e = this.getCoord(l.end);
        
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // Unit Perpendicular Vector for width
        const nx = (-dy / dist) * 1.5; 
        const ny = (dx / dist) * 1.5;

        const rail1 = { x1: s.x - nx, y1: s.y - ny, x2: e.x - nx, y2: e.y - ny };
        const rail2 = { x1: s.x + nx, y1: s.y + ny, x2: e.x + nx, y2: e.y + ny };

        const rungs = [];
        const steps = Math.floor(dist / 3); 
        for(let i=1; i<steps; i++) {
            const ratio = i / steps;
            const rx1 = rail1.x1 + (rail1.x2 - rail1.x1) * ratio;
            const ry1 = rail1.y1 + (rail1.y2 - rail1.y1) * ratio;
            const rx2 = rail2.x1 + (rail2.x2 - rail2.x1) * ratio;
            const ry2 = rail2.y1 + (rail2.y2 - rail2.y1) * ratio;
            rungs.push({ x1: rx1, y1: ry1, x2: rx2, y2: ry2 });
        }
        
        return { rails: [rail1, rail2], rungs };
    });
  }
}
