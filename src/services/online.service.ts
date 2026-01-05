
import { Injectable, signal, OnDestroy } from '@angular/core';
import { Peer, DataConnection } from 'peerjs';

export interface NetworkPacket {
  type: 'STATE_SYNC' | 'PLAYER_JOIN' | 'CHAT' | 'GAME_ACTION' | 'PING';
  payload: any;
}

@Injectable({
  providedIn: 'root'
})
export class OnlineService implements OnDestroy {
  private peer: Peer | null = null;
  // Map peerId -> Connection. 
  private connections = new Map<string, DataConnection>();
  private hostConnection: DataConnection | null = null; // For Client
  private heartbeatInterval: any;
  
  // State
  isHost = signal(false);
  isConnected = signal(false);
  roomCode = signal<string | null>(null);
  myPeerId = signal<string | null>(null);
  error = signal<string | null>(null);

  // Callbacks
  onStateReceived: ((state: any) => void) | null = null;
  onPlayerJoined: ((player: any) => void) | null = null;
  onNewPeerConnected: ((conn: DataConnection) => void) | null = null;
  onActionReceived: ((action: string, data: any, senderId: string) => void) | null = null;

  constructor() {}

  ngOnDestroy() {
      this.cleanup();
  }

  private cleanup() {
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      this.connections.forEach(c => c.close());
      this.connections.clear();
      this.peer?.destroy();
  }

  // Generate or retrieve persistent ID.
  // CRITICAL FIX: Use sessionStorage so separate tabs (players) have unique IDs on the same machine.
  private getPersistentId(): string {
      const key = 'gemini_snake_peer_id_v2'; 
      let id = sessionStorage.getItem(key);
      if (!id) {
          id = 'user-' + Math.random().toString(36).substr(2, 9);
          sessionStorage.setItem(key, id);
      }
      return id;
  }

  initPeer(forceNewId = false): Promise<string> {
    return new Promise((resolve, reject) => {
      // For Host: Random code. For Client: Persistent ID.
      const peerId = forceNewId ? this.generateRoomCode() : this.getPersistentId();
      
      console.log('Initializing Peer with ID:', peerId);

      try {
        if (this.peer) {
            this.peer.destroy();
        }

        this.peer = new Peer(peerId, {
            debug: 1,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });
      } catch (e) {
        this.error.set('Failed to initialize P2P network.');
        reject(e);
        return;
      }

      this.peer.on('open', (id) => {
        console.log('Peer Open. My ID:', id);
        this.myPeerId.set(id);
        this.roomCode.set(id); 
        this.isConnected.set(true);
        this.error.set(null);
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.handleIncomingConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('Peer Error:', err.type, err);
        
        // Auto-reconnect on network issues
        if (err.type === 'network' || err.type === 'peer-unavailable' || err.type === 'server-error') {
             console.log('Attempting auto-reconnect...');
             if (this.peer && !this.peer.destroyed) {
                 setTimeout(() => this.peer?.reconnect(), 1000);
             }
        } else if (err.type === 'unavailable-id') {
             this.error.set('ID Collision. Try refreshing.');
        } else {
             this.error.set('Connection Error: ' + err.type);
        }
      });
      
      this.peer.on('disconnected', () => {
          console.warn('Peer disconnected from signaling server. Reconnecting...');
          if (this.peer && !this.peer.destroyed) {
              this.peer.reconnect();
          }
      });
    });
  }

  // Host Logic
  async createRoom(): Promise<string> {
    this.isHost.set(true);
    // Host gets a random short code, not persistent, to ensure fresh room
    // Force new ID for Host to prevent latching onto old session ID
    const id = await this.initPeer(true); 
    
    // Start Heartbeat
    this.startHeartbeat();
    
    return id;
  }

  // Client Logic
  async joinRoom(code: string): Promise<void> {
    this.isHost.set(false);
    // Client uses persistent ID
    await this.initPeer(false); 
    
    if (!this.peer) return;

    console.log(`Attempting to connect to Host: ${code}`);

    const conn = this.peer.connect(code, {
        reliable: true,
        serialization: 'json'
    });
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (!conn.open) {
                this.error.set('Connection timed out. Check room code.');
                reject('Timeout');
            }
        }, 8000); 

        conn.on('open', () => {
            clearTimeout(timeout);
            this.hostConnection = conn;
            this.setupDataListeners(conn);
            this.roomCode.set(code);
            console.log('Connected to host:', code);
            this.error.set(null);
            resolve();
        });
        
        conn.on('error', (err) => {
            clearTimeout(timeout);
            this.error.set('Could not connect to room: ' + code);
            reject(err);
        });
        
        conn.on('close', () => {
             console.warn('Host connection closed.');
             this.error.set('Disconnected from Host.');
             this.hostConnection = null;
        });
    });
  }

  private handleIncomingConnection(conn: DataConnection) {
    if (this.isHost()) {
        conn.on('open', () => {
            console.log('Host: Incoming connection from', conn.peer);
            this.addConnection(conn);
            this.setupDataListeners(conn);
            
            // Trigger sync immediately for this specific peer
            if (this.onNewPeerConnected) {
                this.onNewPeerConnected(conn);
            }
        });
    }
  }

  private addConnection(conn: DataConnection) {
      const peerId = conn.peer;
      const existing = this.connections.get(peerId);

      if (existing) {
          if (existing === conn) return; 
          
          // If we have an existing open connection for this ID, it might be a zombie or a refresh.
          // We prioritize the NEW connection.
          console.warn(`Host: Replacing connection for ${peerId}`);
          if (existing.open) existing.close();
      }
      
      this.connections.set(peerId, conn);
      console.log(`Host: Connection Map Size: ${this.connections.size}`);
  }

  private setupDataListeners(conn: DataConnection) {
    conn.removeAllListeners('data');
    conn.removeAllListeners('close');
    conn.removeAllListeners('error');

    conn.on('data', (data: any) => {
        const packet = data as NetworkPacket;
        if (packet.type === 'PING') return; // Ignore heartbeat

        const senderId = conn.peer;

        if (packet.type === 'STATE_SYNC' && this.onStateReceived) {
            this.onStateReceived(packet.payload);
        }
        if (packet.type === 'PLAYER_JOIN' && this.onPlayerJoined) {
            const payload = { ...packet.payload, ownerId: senderId };
            console.log('Host: Received PLAYER_JOIN from', senderId);
            this.onPlayerJoined(payload);
        }
        if (packet.type === 'GAME_ACTION' && this.onActionReceived) {
             console.log(`Host: Received ACTION ${packet.payload.action} from ${senderId}`);
             this.onActionReceived(packet.payload.action, packet.payload.data, senderId);
        }
    });

    conn.on('close', () => {
        console.log('Connection closed:', conn.peer);
        this.connections.delete(conn.peer);
    });
    
    conn.on('error', (err) => {
        console.error('Connection Error for:', conn.peer, err);
        // We generally leave it to 'close' event to clean up, unless it's critical
    });
  }

  private startHeartbeat() {
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      
      this.heartbeatInterval = setInterval(() => {
          if (this.isHost()) {
              this.connections.forEach((conn, peerId) => {
                  if (conn.open) {
                      try {
                          conn.send({ type: 'PING', payload: Date.now() });
                      } catch (e) {
                          console.warn('Heartbeat failed for', peerId);
                      }
                  } else {
                      this.connections.delete(peerId);
                  }
              });
          }
      }, 3000); 
  }

  broadcastState(state: any) {
    if (this.isHost()) {
        if (this.connections.size === 0) return;
        
        // Broadcast to all active connections
        this.connections.forEach((conn, peerId) => {
            if (conn.open) {
                try {
                    conn.send({ type: 'STATE_SYNC', payload: state });
                } catch(err) {
                    console.error('Broadcast failed to', peerId, err);
                }
            }
        });
    }
  }

  sendDirect(conn: DataConnection, state: any) {
      if (conn && conn.open) {
          try {
            conn.send({ type: 'STATE_SYNC', payload: state });
          } catch (e) {
              console.error('Direct send failed', e);
          }
      }
  }

  sendPlayerJoin(player: any) {
    if (this.hostConnection && this.hostConnection.open) {
        this.hostConnection.send({ type: 'PLAYER_JOIN', payload: player });
    } else {
        console.warn('Cannot join: Not connected to host.');
        this.error.set('Disconnected. Try rejoining.');
    }
  }

  sendAction(action: string, data?: any) {
      if (this.hostConnection && this.hostConnection.open) {
          this.hostConnection.send({ 
              type: 'GAME_ACTION', 
              payload: { action, data } 
          });
      } else {
          console.error('Cannot send action. Connection lost.');
      }
  }

  private generateRoomCode() {
     if (this.isHost()) {
         return Math.floor(100000 + Math.random() * 900000).toString();
     }
     return 'user-' + Math.random().toString(36).substr(2, 9);
  }
}
