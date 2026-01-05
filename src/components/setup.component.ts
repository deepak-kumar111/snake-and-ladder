
import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../services/game.service';
import { GeminiService } from '../services/gemini.service';
import { OnlineService } from '../services/online.service';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-3xl mx-auto p-6 bg-slate-800 rounded-xl shadow-2xl border border-slate-700">
      <h2 class="text-3xl font-bold mb-6 text-center bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent">
        Game Setup
      </h2>

      <!-- Mode Tabs -->
      <div class="flex mb-6 border-b border-slate-600">
        <button 
            (click)="mode.set('local')" 
            class="flex-1 py-3 font-bold transition-colors"
            [class.text-violet-400]="mode() === 'local'"
            [class.border-b-2]="mode() === 'local'"
            [class.border-violet-400]="mode() === 'local'"
            [class.text-slate-400]="mode() !== 'local'"
        >
            Local Multiplayer
        </button>
        <button 
            (click)="mode.set('online')" 
            class="flex-1 py-3 font-bold transition-colors"
            [class.text-green-400]="mode() === 'online'"
            [class.border-b-2]="mode() === 'online'"
            [class.border-green-400]="mode() === 'online'"
            [class.text-slate-400]="mode() !== 'online'"
        >
            Online Room
        </button>
      </div>

      <!-- Online Room UI -->
      @if (mode() === 'online') {
        <div class="mb-8 p-6 bg-slate-750 rounded-lg border border-slate-600 shadow-inner bg-slate-900/50">
            @if (!onlineService.isConnected()) {
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                    <!-- Divider for desktop -->
                    <div class="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-slate-600 -translate-x-1/2"></div>
                    
                    <!-- Host Section -->
                    <div class="flex flex-col items-center justify-center space-y-4">
                         <div class="text-center">
                            <h3 class="text-xl font-bold text-white">Host a Game</h3>
                            <p class="text-slate-400 text-sm mt-1">Create a room and invite friends.</p>
                         </div>
                         <button (click)="createRoom()" class="w-full max-w-[200px] py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-bold shadow-lg transition-transform active:scale-95">
                            Create Room
                         </button>
                    </div>

                    <!-- Join Section -->
                    <div class="flex flex-col items-center justify-center space-y-4">
                         <div class="text-center">
                            <h3 class="text-xl font-bold text-white">Join a Game</h3>
                            <p class="text-slate-400 text-sm mt-1">Enter code from your friend.</p>
                         </div>
                         <div class="w-full max-w-[240px] flex flex-col gap-2">
                             <input 
                                [(ngModel)]="joinCode" 
                                placeholder="e.g. 123456" 
                                class="w-full p-3 bg-slate-800 border border-slate-600 rounded text-center text-white font-mono uppercase tracking-widest focus:border-green-500 focus:outline-none placeholder:normal-case placeholder:tracking-normal"
                             >
                             <button 
                                (click)="joinRoom()" 
                                [disabled]="!joinCode" 
                                class="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-transform active:scale-95"
                            >
                                Join Room
                             </button>
                         </div>
                    </div>
                </div>
                
                @if (onlineService.error()) {
                    <div class="mt-4 p-3 bg-red-900/50 border border-red-500/50 rounded text-center text-red-200 text-sm">
                        {{ onlineService.error() }}
                    </div>
                }
            } @else {
                <!-- Connected View -->
                <div class="text-center p-6 bg-green-900/20 border border-green-500/30 rounded-xl relative overflow-hidden">
                    <div class="absolute inset-0 bg-green-500/5 pointer-events-none"></div>
                    
                    <p class="text-green-400 font-bold mb-4 tracking-wider text-sm uppercase">Connection Established</p>
                    
                    @if (onlineService.isHost()) {
                        <div class="flex flex-col items-center gap-4">
                            <div>
                                <p class="text-slate-300 mb-1">Room Code</p>
                                <div class="text-4xl md:text-5xl font-black text-white tracking-widest font-mono bg-slate-900/50 px-6 py-2 rounded-xl border border-slate-700/50 shadow-inner inline-block select-all">
                                    {{ onlineService.roomCode() }}
                                </div>
                            </div>

                            <button 
                                (click)="copyRoomCode()"
                                class="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full text-sm font-semibold transition-colors border border-slate-600 active:bg-slate-500"
                            >
                                <span class="text-lg">📋</span>
                                {{ linkCopied() ? 'Copied!' : 'Copy Code' }}
                            </button>

                            <p class="text-xs text-slate-500 mt-2">Share this code with your friends so they can join!</p>
                            @if (gameService.state().players.length < 2) {
                                <p class="text-xs text-slate-500 animate-pulse">Waiting for players to join...</p>
                            } @else {
                                <p class="text-xs text-green-400 font-bold">Players ready! Click START below.</p>
                            }
                        </div>
                    } @else {
                        <div class="flex flex-col items-center">
                            <p class="text-slate-300">Connected to Room:</p>
                            <span class="text-2xl font-mono font-bold text-white my-2">{{ onlineService.roomCode() }}</span>
                            <div class="h-px w-16 bg-slate-600 my-3"></div>
                            
                            @if (!isMyPlayerInLobby()) {
                                <p class="text-lg font-bold text-yellow-400 animate-pulse">👇 Please Join the Lobby Below 👇</p>
                            } @else {
                                <p class="text-sm text-green-400">You are in the lobby!</p>
                                <p class="text-xs text-slate-500 mt-1">Waiting for host to start...</p>
                            }
                        </div>
                    }
                </div>
            }
        </div>
      }

      <!-- Player Input -->
      @if (shouldShowPlayerInput()) {
        <div class="mb-8 p-4 bg-slate-700 rounded-lg ring-2 ring-violet-500/50 shadow-lg">
            <h3 class="text-lg font-bold text-white mb-4 border-b border-slate-600 pb-2">Create Your Character</h3>
            
          <label class="block text-sm font-medium text-slate-300 mb-2">Player Name</label>
          <input 
            type="text" 
            [(ngModel)]="newName" 
            placeholder="Enter name"
            class="w-full p-3 rounded bg-slate-900 border border-slate-600 focus:border-violet-500 focus:outline-none text-white mb-4"
          >

          <label class="block text-sm font-medium text-slate-300 mb-2">Avatar Description</label>
          <div class="flex gap-2 mb-4">
            <input 
              type="text" 
              [(ngModel)]="avatarPrompt" 
              placeholder="e.g. A cool wolf wearing sunglasses"
              class="flex-1 p-3 rounded bg-slate-900 border border-slate-600 focus:border-violet-500 focus:outline-none text-white"
            >
            <button 
              (click)="generateAvatar()" 
              [disabled]="isGenerating() || !avatarPrompt"
              class="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded font-semibold transition-colors flex items-center"
            >
              @if (isGenerating()) {
                <span class="animate-spin mr-2">⟳</span>
              }
              Generate AI
            </button>
          </div>

          @if (generatedAvatar()) {
            <div class="mb-4 flex justify-center">
              <img [src]="generatedAvatar()" class="w-24 h-24 rounded-full border-4 border-violet-500 shadow-lg object-cover">
            </div>
          }

          <div class="flex gap-2 overflow-x-auto pb-2 mb-4">
             <span class="text-xs text-gray-400 self-center mr-2">Or pick:</span>
             @for (url of presets; track url) {
                 <img [src]="url" (click)="selectPreset(url)" class="w-10 h-10 rounded-full cursor-pointer hover:scale-110 transition-transform border border-slate-500">
             }
          </div>

          <label class="block text-sm font-medium text-slate-300 mb-2">Player Color</label>
          <div class="flex gap-3 mb-6">
            @for (color of colors; track color) {
              <button 
                (click)="selectedColor = color"
                [class.ring-2]="selectedColor === color"
                [style.backgroundColor]="color"
                class="w-8 h-8 rounded-full ring-white ring-offset-2 ring-offset-slate-800 transition-all hover:scale-110"
              ></button>
            }
          </div>

          <button 
            (click)="addPlayer()" 
            [disabled]="!newName || !generatedAvatar() || isJoining()"
            class="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 rounded-lg font-bold text-lg transition-colors shadow-lg animate-pulse"
          >
            @if (mode() === 'online' && !onlineService.isHost()) {
                {{ isJoining() ? 'Sending Request...' : 'Join Lobby (Click Me)' }}
            } @else {
                Add Player
            }
          </button>
        </div>
      } 
      
      @if (gameService.state().players.length >= 4 && mode() === 'local') {
        <div class="p-4 bg-yellow-900/50 border border-yellow-700 text-yellow-200 rounded mb-6 text-center">
          Maximum 4 players reached.
        </div>
      }

      <div class="space-y-3 mb-8">
        <h3 class="text-xl font-semibold text-slate-300">Ready Players</h3>
        @if (gameService.state().players.length === 0) {
            <p class="text-slate-500 italic">No players joined yet.</p>
        }
        @for (player of gameService.state().players; track player.id) {
          <div class="flex items-center gap-4 p-3 bg-slate-700/50 rounded border border-slate-600">
            <img [src]="player.avatarUrl" class="w-12 h-12 rounded-full bg-slate-800 object-cover">
            <div class="flex-1">
              <div class="font-bold text-white flex items-center gap-2">
                  <span [style.color]="player.color">{{ player.name }}</span>
                  @if (player.isLocal) {
                      <span class="text-xs bg-slate-500/50 px-1 rounded text-slate-300">(You)</span>
                  }
              </div>
            </div>
             @if (!player.isLocal) {
                 <span class="text-xs bg-blue-600 px-2 py-1 rounded text-white">Remote</span>
             }
          </div>
        }
      </div>

      @if (canStartGame()) {
          <button 
            (click)="gameService.startGame()" 
            class="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl font-bold text-2xl shadow-xl transition-all transform active:scale-95"
          >
            START GAME
          </button>
      }
    </div>
  `
})
export class SetupComponent implements OnInit {
  gameService = inject(GameService);
  geminiService = inject(GeminiService);
  onlineService = inject(OnlineService);

  mode = signal<'local' | 'online'>('local');
  joinCode = '';
  linkCopied = signal(false);
  
  newName = '';
  avatarPrompt = '';
  generatedAvatar = signal<string>('https://picsum.photos/seed/dice/100/100');
  isGenerating = signal(false);
  isJoining = signal(false);
  selectedColor = '#ef4444'; // default red

  colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899'];
  presets = [
      'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix',
      'https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka',
      'https://api.dicebear.com/7.x/bottts/svg?seed=Robot',
      'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Smile'
  ];

  // Computed helper to check if I am already in the game list
  isMyPlayerInLobby = computed(() => {
     if (!this.onlineService.isConnected()) return false;
     const players = this.gameService.state().players;
     // The 'isLocal' flag is now reliably computed in GameService based on ownerId
     return players.some(p => p.isLocal);
  });

  ngOnInit() {
      // Auto-detect invite link (Keep logic in case they deploy to real domain)
      const hash = window.location.hash;
      if (hash && hash.includes('room=')) {
          const code = hash.split('room=')[1];
          if (code) {
              this.mode.set('online');
              this.joinCode = code;
          }
      }
  }

  shouldShowPlayerInput() {
      if (this.mode() === 'local') return this.gameService.state().players.length < 4;
      
      // Online Logic
      if (this.onlineService.isConnected()) {
          // If I am NOT in the lobby list yet, show the input form so I can join
          return !this.isMyPlayerInLobby();
      }
      return false;
  }

  canStartGame() {
      if (this.mode() === 'online' && !this.onlineService.isHost()) return false;
      return this.gameService.state().players.length >= 2;
  }

  async createRoom() {
      await this.onlineService.createRoom();
  }

  async joinRoom() {
      if (this.joinCode) {
          await this.onlineService.joinRoom(this.joinCode.trim());
      }
  }

  copyRoomCode() {
      const code = this.onlineService.roomCode();
      if (!code) return;
      
      const textToShare = `Join me in Snake & Ladders! Room Code: ${code}`;
      
      navigator.clipboard.writeText(textToShare).then(() => {
          this.linkCopied.set(true);
          setTimeout(() => this.linkCopied.set(false), 2000);
      }).catch(err => {
          console.error('Failed to copy', err);
          // Fallback if clipboard fails (sometimes focus related)
          alert('Room Code: ' + code);
      });
  }

  async generateAvatar() {
    if (!this.avatarPrompt) return;
    this.isGenerating.set(true);
    try {
      const url = await this.geminiService.generateAvatar(this.avatarPrompt);
      this.generatedAvatar.set(url);
    } finally {
      this.isGenerating.set(false);
    }
  }

  selectPreset(url: string) {
      this.generatedAvatar.set(url);
  }

  addPlayer() {
    if (this.newName && this.generatedAvatar()) {
      // In online mode, check isLocal
      if (this.mode() === 'online' && !this.onlineService.isHost()) {
          this.isJoining.set(true);
      }

      // GameService will handle sending the Join Request if I am a client.
      this.gameService.addPlayer(this.newName, this.generatedAvatar(), this.selectedColor, true);
      
      // If local, reset form immediately. If online, we wait for state sync to hide form.
      if (this.mode() === 'local' || this.onlineService.isHost()) {
          this.newName = '';
          this.avatarPrompt = '';
          this.generatedAvatar.set('https://picsum.photos/seed/' + Math.random() + '/100/100');
          const currentIndex = this.colors.indexOf(this.selectedColor);
          this.selectedColor = this.colors[(currentIndex + 1) % this.colors.length];
      }
    }
  }
}
