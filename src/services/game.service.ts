
import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { GeminiService } from './gemini.service';
import { OnlineService } from './online.service';

export interface Player {
  id: number;
  name: string;
  avatarUrl: string;
  position: number;
  hasStarted: boolean;
  color: string;
  skipNextTurn: boolean;
  isLocal: boolean; // UI Flag
  ownerId: string;  // Unique Peer ID (or 'HOST'/'BOT')
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
      // If offline, everyone is local
      if (!this.onlineService.isConnected()) return true;

      const myId = this.onlineService.myPeerId();
      
      // Host Logic
      if (this.onlineService.isHost()) {
          // Host controls 'HOST' players and their own ID
          return player.ownerId === 'HOST' || player.ownerId === myId;
      } 
      
      // Client Logic
      if (myId) {
        return player.ownerId === myId;
      }
      
      return false;
  }
  
  constructor() {
    // Setup Online Listeners
    this.onlineService.onStateReceived = (newState: GameState) => {
        // As a client, we calculate isLocal for UI purposes based on our ID
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
        
        // Check if player already exists (reconnect scenario)
        const exists = this.state().players.find(p => p.ownerId === payload.ownerId);
        if (exists) {
            console.log('Host: Player already exists, ignoring add.');
            // Force broadcast to ensure this reconnected player gets the state
            this.broadcastIfHost(); 
            return;
        }

        this.addPlayer(payload.name, payload.avatarUrl, payload.color, false, payload.ownerId);
    };

    this.onlineService.onNewPeerConnected = (conn: any) => {
        console.log('Host: New Peer Connected. Syncing current state.');
        const s = this.state();
        this.onlineService.sendDirect(conn, s);
    };

    // Host Logic: Receive Actions from Clients
    this.onlineService.onActionReceived = (action: string, data: any, senderId: string) => {
        if (!this.onlineService.isHost()) return;

        if (action === 'ROLL') {
            // VALIDATION: Ensure the sender is actually the current player
            const currentP = this.currentPlayer();
            if (currentP.ownerId !== senderId) {
                console.warn(`Host: REJECTED ROLL. Turn owner: ${currentP.ownerId}. Sender: ${senderId}`);
                // If the client thinks it's their turn but it's not, they are desynced.
                // We broadcast the state to fix them.
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

  // Helper to broadcast if host
  private broadcastIfHost() {
      if (this.onlineService.isHost()) {
          const s = this.state();
          this.onlineService.broadcastState(s);
      }
  }

  // Actions
  addPlayer(name: string, avatarUrl: string, color: string, isLocal = true, specificOwnerId?: string) {
    const myId = this.onlineService.myPeerId();
    // If specificOwnerId is provided (from remote join), use it. 
    // Otherwise, if local, use myId. If offline local, use 'HOST'.
    const ownerId = specificOwnerId || (isLocal ? (myId || 'HOST') : 'BOT');

    // Client Logic: If connected and not host, send request instead of adding locally
    if (this.onlineService.isConnected() && !this.onlineService.isHost() && isLocal) {
        this.onlineService.sendPlayerJoin({ 
            name, 
            avatarUrl, 
            color,
            ownerId: myId // Send my ID so Host knows who I am
        });
        return; 
    }

    // Host/Offline Logic: Add to state
    this.state.update(s => ({
      ...s,
      players: [...s.players, {
        id: s.players.length,
        name,
        avatarUrl,
        position: 0,
        hasStarted: false,
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
    this.state.update(s => ({ ...s, gameStatus: 'playing', logs: ['Game Started!'] }));
    this.broadcastIfHost();
  }

  // UI Trigger: Handled by button click
  async rollDice() {
    const s = this.state();
    const currentP = s.players[s.currentPlayerIndex];
    
    // Check ownership
    const isLocal = this.isPlayerLocal(currentP);

    if (this.onlineService.isConnected()) {
        if (!isLocal) {
            console.warn(`Not your turn! It is ${currentP.name}'s turn. I am ${this.onlineService.myPeerId()}`);
            return;
        }

        // If Client, send action to Host
        if (!this.onlineService.isHost()) {
            this.onlineService.sendAction('ROLL');
            return; 
        }
    }

    // If Host or Local Offline, process immediately
    this.processDiceRoll();
  }

  // Core Game Logic (Executed by Host or Local Offline)
  private processDiceRoll() {
    try {
        const s = this.state();
        if (s.gameStatus !== 'playing') return;
        
        const currentP = s.players[s.currentPlayerIndex];
        console.log(`Processing Roll for ${currentP.name} (Index: ${s.currentPlayerIndex})`);

        // Skip Turn Logic
        if (currentP.skipNextTurn) {
            this.state.update(curr => ({
                ...curr,
                players: curr.players.map(p => p.id === currentP.id ? { ...p, skipNextTurn: false } : p),
                logs: [`${currentP.name} is frozen!`, ...curr.logs]
            }));
            this.passTurn();
            return;
        }

        const roll = Math.floor(Math.random() * 6) + 1;
        let newPosition = currentP.position;
        let hasStarted = currentP.hasStarted;
        let message = '';
        let eventType: 'move' | 'snake' | 'ladder' | 'win' | 'collision' | null = null;
        let eventDetail = '';
        let specialEffect: string | null = null;

        // Game Logic
        if (!hasStarted) {
        if (roll === 6) {
            hasStarted = true;
            newPosition = 1;
            message = `${currentP.name} rolled 6! Enter!`;
        } else {
            message = `${currentP.name} rolled ${roll}. Needs 6.`;
        }
        } else {
        const potentialPos = newPosition + roll;
        if (potentialPos <= 100) {
            newPosition = potentialPos;
            message = `${currentP.name} rolled ${roll} to ${newPosition}.`;
            
            // 1. Check for Snake/Ladder FIRST
            if (LADDERS[newPosition]) {
            newPosition = LADDERS[newPosition];
            message += ` Ladder! -> ${newPosition}.`;
            eventType = 'ladder';
            eventDetail = newPosition.toString();
            } 
            else if (SNAKES[newPosition]) {
            const oldPos = newPosition;
            newPosition = SNAKES[newPosition];
            message += ` Snake! -> ${newPosition}.`;
            eventType = 'snake';
            eventDetail = oldPos.toString();
            }

            // 2. Check for Special Squares
            if (SPECIAL_SQUARES[newPosition]) {
                const effect = SPECIAL_SQUARES[newPosition];
                specialEffect = effect;
                
                switch (effect) {
                    case 'boost':
                        newPosition = Math.min(100, newPosition + 5);
                        message += ` Boost! +5`;
                        break;
                    case 'trap':
                        newPosition = Math.max(1, newPosition - 5);
                        message += ` Trap! -5`;
                        break;
                    case 'freeze':
                        message += ` Frozen next turn!`;
                        break;
                    case 'double':
                        message += ` Roll Again!`;
                        break;
                }
            }

        } else {
            message = `${currentP.name} rolled ${roll}. Too high!`;
        }
        }

        // Collision Check
        const nextPlayers = s.players.map(p => {
            if (p.id === currentP.id) {
                return { 
                    ...p, 
                    position: newPosition, 
                    hasStarted,
                    skipNextTurn: specialEffect === 'freeze' ? true : false
                };
            }
            return p;
        });

        if (newPosition > 0) {
            const otherPlayerIndex = nextPlayers.findIndex(p => p.id !== currentP.id && p.position === newPosition && p.hasStarted);
            if (otherPlayerIndex !== -1) {
                const victim = nextPlayers[otherPlayerIndex];
                nextPlayers[otherPlayerIndex] = { ...victim, position: 0, hasStarted: false };
                message += ` Kicked ${victim.name}!`;
                eventType = 'collision';
            }
        }

        // Win Check
        let winner: Player | null = null;
        let nextStatus: GameState['gameStatus'] = s.gameStatus;
        
        if (newPosition === 100) {
            winner = nextPlayers.find(p => p.id === currentP.id) || null;
            nextStatus = 'finished';
            message = `${currentP.name} WINS!`;
            eventType = 'win';
        }

        // Update State
        this.state.update(current => ({
        ...current,
        players: nextPlayers,
        lastDiceRoll: roll,
        logs: [message, ...current.logs].slice(0, 10),
        gameStatus: nextStatus,
        winner
        }));

        // AI Commentary
        if (eventType) {
            this.geminiService.generateCommentary(currentP.name, eventType, eventDetail).then(comment => {
                if (comment) {
                    this.state.update(curr => ({ ...curr, commentary: comment }));
                    this.broadcastIfHost();
                }
            });
        }

        // Turn Management
        if (nextStatus !== 'finished') {
            const isDoubleRoll = specialEffect === 'double';
            const rolledSix = roll === 6; 
            
            let keepTurn = false;
            
            if (!hasStarted) {
                if (roll === 6) keepTurn = true;
            } else {
                if (rolledSix || isDoubleRoll) keepTurn = true;
            }

            if (!keepTurn) {
                this.passTurn();
            } else {
                this.state.update(curr => ({ ...curr, logs: [`${currentP.name} rolls again!`, ...curr.logs] }));
                this.broadcastIfHost();
            }
        } else {
            this.broadcastIfHost();
        }
    } catch (e) {
        console.error('Critical Error in processDiceRoll', e);
        this.broadcastIfHost(); // Try to sync anyway
    }
  }

  private passTurn() {
    this.state.update(s => {
        const nextIndex = (s.currentPlayerIndex + 1) % s.players.length;
        console.log(`Passing Turn. Old: ${s.currentPlayerIndex} -> New: ${nextIndex}. Players: ${s.players.length}`);
        return {
            ...s,
            currentPlayerIndex: nextIndex
        };
    });
    this.broadcastIfHost();
  }

  restartGame() {
    // Client sends request to host
    if (this.onlineService.isConnected() && !this.onlineService.isHost()) {
        this.onlineService.sendAction('RESTART');
        return;
    }
    this.processRestartGame();
  }

  private processRestartGame() {
    this.state.update(s => ({
      ...s,
      players: s.players.map(p => ({ ...p, position: 0, hasStarted: false, skipNextTurn: false })),
      currentPlayerIndex: 0,
      gameStatus: 'playing',
      lastDiceRoll: null,
      winner: null,
      logs: ['Game Restarted'],
      commentary: 'New game begun!'
    }));
    this.broadcastIfHost();
  }

  resetToSetup() {
      // Setup reset usually drops connection, handled by simple state reset
      this.state.set({
        players: [],
        currentPlayerIndex: 0,
        gameStatus: 'setup',
        lastDiceRoll: null,
        commentary: 'Setup your new game.',
        winner: null,
        logs: []
      });
      // We do not broadcast resetToSetup usually as it kills the game, but if we wanted to:
      this.broadcastIfHost();
  }
}
