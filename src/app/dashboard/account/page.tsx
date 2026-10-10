import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admins";
import { isPublicDemo } from "@/lib/auth/demo";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  if (isPublicDemo()) redirect("/dashboard"); // no accounts in public demo mode
  const admin = await requireAdmin({ allowMustChange: true });
  return (
    <section>
      <h1 className="text-xl font-semibold text-ink">Your account</h1>
      <p className="mt-1 mb-6 text-sm text-ink2">Signed in as {admin.email}.</p>
      {admin.mustChange && (
        <p className="mb-6 card text-sm text-ink">
          Please choose your own password before you continue. The temporary one you were given only works for this step.
        </p>
      )}
      <PasswordForm />
    </section>
  );
}
