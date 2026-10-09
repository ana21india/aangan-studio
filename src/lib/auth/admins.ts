import { redirect } from "next/navigation";
import { query } from "../db";
import { sessionEmail } from "./session";

export interface Admin {
  email: string;
  name: string | null;
  passwordHash: string | null;
  mustChange: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
}

type Row = { email: string; name: string | null; password_hash: string | null; must_change: boolean; failed_attempts: number; locked_until: string | null };
const map = (r: Row): Admin => ({
  email: r.email, name: r.name, passwordHash: r.password_hash, mustChange: r.must_change,
  failedAttempts: r.failed_attempts, lockedUntil: r.locked_until ? new Date(r.locked_until) : null,
});

export async function findAdmin(email: string): Promise<Admin | null> {
  const r = await query<Row>("select * from admins where email = $1", [email.trim().toLowerCase()]);
  return r[0] ? map(r[0]) : null;
}

// Five wrong passwords lock the account for 15 minutes.
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

export async function recordFailure(email: string) {
  await query(
    `update admins set failed_attempts = failed_attempts + 1,
       locked_until = case when failed_attempts + 1 >= $2 then now() + ($3 || ' minutes')::interval else locked_until end
     where email = $1`, [email, MAX_FAILURES, String(LOCK_MINUTES)]);
}

export async function recordSuccess(email: string) {
  await query("update admins set failed_attempts = 0, locked_until = null, last_login_at = now() where email = $1", [email]);
}

export async function setPassword(email: string, hash: string, mustChange: boolean) {
  await query("update admins set password_hash = $2, must_change = $3, failed_attempts = 0, locked_until = null where email = $1", [email, hash, mustChange]);
}

// Every dashboard page calls this first. Not signed in (or removed from the admin list) means back to the login page.
export async function requireAdmin(opts: { allowMustChange?: boolean } = {}): Promise<Admin> {
  const email = await sessionEmail();
  const admin = email ? await findAdmin(email) : null;
  if (!admin || !admin.passwordHash) redirect("/login");
  if (admin.mustChange && !opts.allowMustChange) redirect("/dashboard/account?first=1");
  return admin;
}
