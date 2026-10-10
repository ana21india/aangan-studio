import { redirect } from "next/navigation";
import { isPublicDemo } from "@/lib/auth/demo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Aangan Studio" };
export const dynamic = "force-dynamic"; // read the demo-mode switch at request time, not at build time

export default function LoginPage() {
  if (isPublicDemo()) redirect("/dashboard"); // no sign-in needed in public demo mode
  return (
    <main className="viz-root min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-semibold text-ink">Aangan Studio</h1>
        <p className="mt-1 mb-6 text-sm text-ink2">Enquiry agent dashboard. Admins only.</p>
        <LoginForm />
      </div>
    </main>
  );
}
