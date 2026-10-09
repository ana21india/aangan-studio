"use server";

import { redirect } from "next/navigation";
import { requireAdmin, setPassword } from "@/lib/auth/admins";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/auth/password";

export interface PasswordState {
  error?: string;
}

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const admin = await requireAdmin({ allowMustChange: true });
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const again = String(formData.get("again") ?? "");

  if (!(await verifyPassword(current, admin.passwordHash))) return { error: "Your current password is not right." };
  if (next.length < MIN_PASSWORD_LENGTH) return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (next !== again) return { error: "The two new passwords do not match." };
  if (next === current) return { error: "Choose a password you have not used before." };

  await setPassword(admin.email, await hashPassword(next), false);
  redirect("/dashboard");
}
