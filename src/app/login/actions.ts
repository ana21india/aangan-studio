"use server";

import { redirect } from "next/navigation";
import { findAdmin, LOCK_MINUTES, recordFailure, recordSuccess } from "@/lib/auth/admins";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";

export interface LoginState {
  error?: string;
}

// Same message for "no such admin" and "wrong password", so nobody can probe which emails are admins.
const GENERIC = "That email and password do not match.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const admin = await findAdmin(email);
  if (admin?.lockedUntil && admin.lockedUntil > new Date()) {
    return { error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.` };
  }
  const ok = admin ? await verifyPassword(password, admin.passwordHash) : false;
  if (!admin || !ok) {
    if (admin) await recordFailure(admin.email);
    return { error: GENERIC };
  }
  await recordSuccess(admin.email);
  await createSession(admin.email);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
