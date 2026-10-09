import { query } from "../db";
import type { VaaniSession, VaaniSessionStore } from "./vaani";

export class PgVaaniSessions implements VaaniSessionStore {
  async upsertStarted(roomName: string, phone: string | null, at: Date) {
    await query(
      `insert into vaani_sessions (room_name, phone, started_at) values ($1, $2, $3)
       on conflict (room_name) do update set phone = coalesce(excluded.phone, vaani_sessions.phone),
         started_at = coalesce(vaani_sessions.started_at, excluded.started_at), updated_at = now()`,
      [roomName, phone, at.toISOString()]);
  }

  async markTransfer(roomName: string, status: "initiated" | "successful" | "failed", type: string | null, phone: string | null) {
    await query(
      `insert into vaani_sessions (room_name, transfer_status, transfer_type, transfer_phone) values ($1, $2, $3, $4)
       on conflict (room_name) do update set transfer_status = excluded.transfer_status,
         transfer_type = coalesce(excluded.transfer_type, vaani_sessions.transfer_type),
         transfer_phone = coalesce(excluded.transfer_phone, vaani_sessions.transfer_phone), updated_at = now()`,
      [roomName, status, type, phone]);
  }

  async get(roomName: string): Promise<VaaniSession | null> {
    const r = await query<{ room_name: string; phone: string | null; started_at: string | null; transfer_status: VaaniSession["transferStatus"] }>(
      "select room_name, phone, started_at, transfer_status from vaani_sessions where room_name = $1", [roomName]);
    return r[0] ? { roomName: r[0].room_name, phone: r[0].phone, startedAt: r[0].started_at ? new Date(r[0].started_at) : null, transferStatus: r[0].transfer_status } : null;
  }
}

export class MemoryVaaniSessions implements VaaniSessionStore {
  rows = new Map<string, VaaniSession>();
  async upsertStarted(roomName: string, phone: string | null, at: Date) {
    const cur = this.rows.get(roomName);
    this.rows.set(roomName, { roomName, phone: phone ?? cur?.phone ?? null, startedAt: cur?.startedAt ?? at, transferStatus: cur?.transferStatus ?? null });
  }
  async markTransfer(roomName: string, status: "initiated" | "successful" | "failed") {
    const cur = this.rows.get(roomName) ?? { roomName, phone: null, startedAt: null, transferStatus: null };
    this.rows.set(roomName, { ...cur, transferStatus: status });
  }
  async get(roomName: string) { return this.rows.get(roomName) ?? null; }
}
