import { Room } from './room';

export interface RoomStore {
  get(id: string): Room | undefined;
  create(id: string, players: number | undefined, weather: boolean, weatherChance: number, onEmpty: (id: string) => void): Room;
  delete(id: string): void;
  size(): number;
}

class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  create(id: string, players: number | undefined, weather: boolean, weatherChance: number, onEmpty: (id: string) => void): Room {
    const room = new Room(id, players, weather, weatherChance, onEmpty);
    this.rooms.set(id, room);
    return room;
  }

  delete(id: string): void {
    const room = this.rooms.get(id);
    if (room) {
      room.dispose();
      this.rooms.delete(id);
    }
  }

  size(): number {
    return this.rooms.size;
  }
}

export class Hub {
  private readonly store: RoomStore;
  private readonly maxRooms: number;

  constructor(store: RoomStore = new MemoryRoomStore(), maxRooms = Number(process.env.MAX_ROOMS ?? 1000)) {
    this.store = store;
    this.maxRooms = maxRooms;
  }

  obtain(id: string, players: number | undefined, weather = false, weatherChance = 0.28): Room | null {
    const existing = this.store.get(id);
    if (existing) return existing; // 房间已存在：沿用建房时的设置（人数/天气/频率均建房即定，之后由房主大厅调）
    if (this.store.size() >= this.maxRooms) return null;
    return this.store.create(id, players, weather, weatherChance, (rid) => this.store.delete(rid));
  }

  find(id: string): Room | undefined {
    return this.store.get(id);
  }

  count(): number {
    return this.store.size();
  }
}
