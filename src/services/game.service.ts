
import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { GeminiService } from './gemini.service';
import { OnlineService } from './online.service';

export interface Player {
  id: number;
  name: string;
  avatarUrl: string;
  position: number;
  hasStarted: boolean;
  reachedTop: boolean; // New flag for the return trip
  color: string;
  skipNextTurn: boolean;
  isLocal: boolean; 
  ownerId: string;  
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  gameStatus: 'setup' | 'playing' | 'finished';
  lastDiceRoll: number | null;
  commentary: string;
  winner: Player | null;
  logs: string[];
}

export const SNAKES: Record<number, number> = {
  16: 6,
  47: 26,
  49: 11,
  56: 53,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  98: 78
};

export const LADDERS: Record<number, number> = {
  1: 38,
  4: 14,
  9: 31,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 100
};

export const SPECIAL_SQUARES: Record<number, 'boost' | 'trap' | 'freeze' | 'double'> = {
  2: 'boost',
  15: 'trap',
  22: 'double',
  37: 'freeze',
  50: 'boost',
  68: 'trap',
  79: 'double',
  88: 'freeze'
};

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private geminiService = inject(GeminiService);
  onlineService = inject(OnlineService);

  // State Signals
  state = signal<GameState>({
    players: [],
    currentPlayerIndex: 0,
    gameStatus: 'setup',
    lastDiceRoll: null,
    commentary: 'Welcome! Setup your players to begin.',
    winner: null,
    logs: []
  });

  // Computed
  currentPlayer = computed(() => this.state().players[this.state().currentPlayerIndex]);
  
  // Helper to determine if the current device controls this player
  isPlayerLocal(player: Player): boolean {
      if (!this.onlineService.isConnected()) return true;
      const myId = this.onlineService.myPeerId();
      if (this.onlineService.isHost()) {
          return player.ownerId === 'HOST' || player.ownerId === myId;
      } 
      if (myId) {
        return player.ownerId === myId;
      }
      return false;
  }
  
  constructor() {
    // Setup Online Listeners
    this.onlineService.onStateReceived = (newState: GameState) => {
        const myId = this.onlineService.myPeerId();
        const playersWithLocalFlag = newState.players.map(p => ({
            ...p,
            isLocal: p.ownerId === myId
        }));

        this.state.set({
            ...newState,
            players: playersWithLocalFlag
        });
    };

    this.onlineService.onPlayerJoined = (payload: { name: string, avatarUrl: string, color: string, ownerId: string }) => {
        console.log('Host: Adding remote player:', payload.name, payload.ownerId);
        const exists = this.state().players.find(p => p.ownerId === payload.ownerId);
        if (exists) {
            this.broadcastIfHost(); 
            return;
        }
        this.addPlayer(payload.name, payload.avatarUrl, payload.color, false, payload.ownerId);
    };

    this.onlineService.onNewPeerConnected = (conn: any) => {
        const s = this.state();
        this.onlineService.sendDirect(conn, s);
    };

    this.onlineService.onActionReceived = (action: string, data: any, senderId: string) => {
        if (!this.onlineService.isHost()) return;

        if (action === 'ROLL') {
            const currentP = this.currentPlayer();
            if (currentP.ownerId !== senderId) {
                this.broadcastIfHost();
                return;
            }
            this.processDiceRoll();
        }
        if (action === 'RESTART') {
            this.processRestartGame();
        }
    };
  }

  private broadcastIfHost() {
      if (this.onlineService.isHost()) {
          const s = this.state();
          this.onlineService.broadcastState(s);
      }
  }

  addPlayer(name: string, avatarUrl: string, color: string, isLocal = true, specificOwnerId?: string) {
    const myId = this.onlineService.myPeerId();
    const ownerId = specificOwnerId || (isLocal ? (myId || 'HOST') : 'BOT');

    if (this.onlineService.isConnected() && !this.onlineService.isHost() && isLocal) {
        this.onlineService.sendPlayerJoin({ 
            name, 
            avatarUrl, 
            color,
            ownerId: myId
        });
        return; 
    }

    this.state.update(s => ({
      ...s,
      players: [...s.players, {
        id: s.players.length,
        name,
        avatarUrl,
        position: 0,
        hasStarted: false,
        reachedTop: false,
        color,
        skipNextTurn: false,
        isLocal: isLocal, 
        ownerId
      }]
    }));

    this.broadcastIfHost();
  }

  startGame() {
    if (this.state().players.length < 2) return;
    this.state.update(s => ({ ...s, gameStatus: 'playing', logs: ['Game Started! Reach 100 then back to 1!'] }));
    this.broadcastIfHost();
  }

  async rollDice() {
    const s = this.state();
    const currentP = s.players[s.currentPlayerIndex];
    const isLocal = this.isPlayerLocal(currentP);

    if (this.onlineService.isConnected()) {
        if (!isLocal) return;
        if (!this.onlineService.isHost()) {
            this.onlineService.sendAction('ROLL');
            return; 
        }
    }
    this.processDiceRoll();
  }

  private async processDiceRoll() {
    try {
        const s = this.state();
        if (s.gameStatus !== 'playing') return;
        
        const currentP = s.players[s.currentPlayerIndex];

        // Skip Turn Check
        if (currentP.skipNextTurn) {
            this.state.update(curr => ({
                ...curr,
                players: curr.players.map(p => p.id === currentP.id ? { ...p, skipNextTurn: false } : p),
                logs: [`${currentP.name} is frozen and skips!`, ...curr.logs]
            }));
            this.passTurn();
            return;
        }

        const roll = Math.floor(Math.random() * 6) + 1;
        let newPosition = currentP.position;
        let hasStarted = currentP.hasStarted;
        let reachedTop = currentP.reachedTop;
        let message = '';
        
        // 1. Initial Move Calculation
        if (!hasStarted) {
            if (roll === 6) {
                hasStarted = true;
                newPosition = 1;
                message = `${currentP.name} rolled 6! Entered the board.`;
            } else {
                message = `${currentP.name} rolled ${roll}. Needs 6 to start.`;
            }
        } else {
            // Direction Logic: +1 if going up, -1 if going down (after reaching 100)
            const direction = reachedTop ? -1 : 1;
            let potentialPos = newPosition + (roll * direction);

            // Handle Turning Point (100)
            if (!reachedTop) {
                if (potentialPos >= 100) {
                    const excess = potentialPos - 100;
                    potentialPos = 100 - excess; // Bounce back immediately implies turning around
                    reachedTop = true;
                    message = `${currentP.name} Hit 100! Turning back to 1!`;
                } else {
                     message = `${currentP.name} rolled ${roll} to ${potentialPos}.`;
                }
            } else {
                // Going Down
                message = `${currentP.name} rolled ${roll} (returning) to ${potentialPos}.`;
            }
            
            newPosition = potentialPos;
        }

        // 2. Commit the Physical Move (Step 1)
        // We update state here so the piece moves to the tile BEFORE resolving snakes/ladders
        this.updatePlayerState(currentP.id, { position: newPosition, hasStarted, reachedTop });
        this.updateLogs(message, roll);
        this.broadcastIfHost(); // Show movement to tile

        // If not started or standard move, checks happen now
        if (!hasStarted) {
             if (roll === 6) { /* Keep turn */ } else { this.passTurn(); return; }
        }

        // Wait for animation frame of landing on the tile
        await new Promise(resolve => setTimeout(resolve, 600));

        // 3. Check Interactions (Snakes/Ladders/Special)
        let eventType: 'move' | 'snake' | 'ladder' | 'win' | 'collision' | null = null;
        let eventDetail = '';
        let specialEffect: string | null = null;
        let finalPosition = newPosition;

        // Snake / Ladder Check
        // Note: Ladders move you UP (index increases), Snakes move you DOWN (index decreases)
        // This applies regardless of player direction.
        // If returning (going down), a Ladder is BAD (moves you back up to 100).
        // If returning, a Snake is GOOD (moves you down to 1).
        
        if (LADDERS[newPosition]) {
            finalPosition = LADDERS[newPosition];
            message = ` LADDER! Climbing to ${finalPosition}.`;
            eventType = 'ladder';
            eventDetail = finalPosition.toString();
        } else if (SNAKES[newPosition]) {
            const oldPos = finalPosition;
            finalPosition = SNAKES[newPosition];
            message = ` SNAKE! Sliding to ${finalPosition}.`;
            eventType = 'snake';
            eventDetail = oldPos.toString();
        }

        // If interaction occurred, Animate it
        if (finalPosition !== newPosition) {
            this.updatePlayerState(currentP.id, { position: finalPosition });
            this.updateLogs(message, null);
            this.broadcastIfHost();
            // Wait for snake/ladder animation
            await new Promise(resolve => setTimeout(resolve, 800));
        }

        // Special Squares
        if (SPECIAL_SQUARES[finalPosition]) {
            specialEffect = SPECIAL_SQUARES[finalPosition];
             switch (specialEffect) {
                case 'boost':
                    // Boost moves towards 100 if going up, towards 1 if going down?
                    // Let's keep it simple: Boost always +5 index (Up), Trap always -5 index (Down).
                    // Or contextual? Let's make it index based to avoid confusion.
                    // Boost = Index + 5. (Good for going up, Bad for going down).
                    finalPosition = Math.min(100, finalPosition + 5);
                    message = ` BOOST! (+5) -> ${finalPosition}`;
                    break;
                case 'trap':
                    finalPosition = Math.max(1, finalPosition - 5);
                    message = ` TRAP! (-5) -> ${finalPosition}`;
                    break;
                case 'freeze':
                    message = ` FROZEN! Skip next turn.`;
                    break;
                case 'double':
                    message = ` LUCKY! Roll again.`;
                    break;
            }
            if (finalPosition !== newPosition) {
                this.updatePlayerState(currentP.id, { position: finalPosition });
                this.updateLogs(message, null);
                this.broadcastIfHost();
            }
        }

        // 4. Collision Check
        // If we land on another player, send them to start.
        // New Rule: They go to 1, and hasStarted = true.
        const currentState = this.state();
        const victims = currentState.players.filter(p => p.id !== currentP.id && p.position === finalPosition && p.hasStarted && finalPosition !== 0 && finalPosition !== 100);
        
        if (victims.length > 0) {
            const updatedPlayers = currentState.players.map(p => {
                if (victims.find(v => v.id === p.id)) {
                    return { 
                        ...p, 
                        position: 1, 
                        hasStarted: true, // Don't need 6
                        reachedTop: false, // Reset trip
                        skipNextTurn: false 
                    };
                }
                if (p.id === currentP.id) {
                     return { 
                        ...p, 
                        skipNextTurn: specialEffect === 'freeze' ? true : false 
                    };
                }
                return p;
            });
            
            message = ` CRASH! Sent ${victims.map(v => v.name).join(', ')} back to 1!`;
            this.state.update(s => ({ ...s, players: updatedPlayers, logs: [message, ...s.logs].slice(0, 15) }));
            this.broadcastIfHost();
            eventType = 'collision';
        } else {
            // Just update skip flag if no collision logic overrode it
            if (specialEffect === 'freeze') {
                 this.updatePlayerState(currentP.id, { skipNextTurn: true });
            }
        }

        // 5. Win Condition
        // Must return to 1.
        if (reachedTop && finalPosition <= 1) {
            this.state.update(s => ({
                ...s,
                gameStatus: 'finished',
                winner: currentP,
                logs: [`${currentP.name} RETURNED TO 1 AND WON!`, ...s.logs]
            }));
            this.geminiService.generateCommentary(currentP.name, 'win', '1').then(c => this.updateCommentary(c));
            this.broadcastIfHost();
            return;
        }

        // 6. Turn Management
        if (eventType && eventType !== 'move') {
             this.geminiService.generateCommentary(currentP.name, eventType, eventDetail).then(c => this.updateCommentary(c));
        }

        const isDoubleRoll = specialEffect === 'double';
        const rolledSix = roll === 6; 
        
        let keepTurn = false;
        
        // Classic rule: Roll 6 = extra turn. Double square = extra turn.
        if (hasStarted && (rolledSix || isDoubleRoll)) keepTurn = true;
        // If just started with 6, keep turn
        if (!hasStarted && roll === 6) keepTurn = true;

        if (!keepTurn) {
            this.passTurn();
        } else {
            this.updateLogs(`${currentP.name} rolls again!`, null);
            this.broadcastIfHost();
        }

    } catch (e) {
        console.error('Critical Error in processDiceRoll', e);
        this.broadcastIfHost(); 
    }
  }

  // Helpers
  private updatePlayerState(playerId: number, changes: Partial<Player>) {
      this.state.update(s => ({
          ...s,
          players: s.players.map(p => p.id === playerId ? { ...p, ...changes } : p)
      }));
  }

  private updateLogs(msg: string, roll: number | null) {
      this.state.update(s => ({
          ...s,
          logs: [msg, ...s.logs].slice(0, 15),
          lastDiceRoll: roll !== null ? roll : s.lastDiceRoll
      }));
  }

  private updateCommentary(c: string) {
      if(c) {
          this.state.update(s => ({ ...s, commentary: c }));
          this.broadcastIfHost();
      }
  }

  private passTurn() {
    this.state.update(s => {
        const nextIndex = (s.currentPlayerIndex + 1) % s.players.length;
        return { ...s, currentPlayerIndex: nextIndex };
    });
    this.broadcastIfHost();
  }

  private processRestartGame() {
    this.state.update(s => ({
      ...s,
      players: s.players.map(p => ({ 
          ...p, 
          position: 0, 
          hasStarted: false, 
          reachedTop: false, 
          skipNextTurn: false 
      })),
      currentPlayerIndex: 0,
      gameStatus: 'playing',
      lastDiceRoll: null,
      winner: null,
      logs: ['Game Restarted'],
      commentary: 'New game begun!'
    }));
    this.broadcastIfHost();
  }
}
