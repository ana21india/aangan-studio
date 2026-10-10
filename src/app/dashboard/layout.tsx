import Link from "next/link";
import { logout } from "@/app/login/actions";
import { requireAdmin } from "@/lib/auth/admins";
import { isPublicDemo } from "@/lib/auth/demo";

const NAV = [
  ["/dashboard", "Overview"],
  ["/dashboard/calls", "Calls"],
  ["/dashboard/followups", "Follow-ups"],
  ["/dashboard/costs", "Costs"],
  ["/dashboard/account", "Account"],
] as const;

export const metadata = { title: "Aangan Studio · Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Chrome only. Each page checks access again (and enforces the first-time password change).
  const admin = await requireAdmin({ allowMustChange: true });
  const demo = isPublicDemo();
  return (
    <div className="min-h-screen">
      {demo && (
        <p className="bg-ink px-4 py-2 text-center text-sm text-surface" role="note">
          Public demo view: read-only, sample calls only, phone numbers hidden.
        </p>
      )}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="font-semibold text-ink">Aangan Studio</span>
            <nav aria-label="Main" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {NAV.filter(([href]) => !(demo && href === "/dashboard/account")).map(([href, label]) => (
                <Link key={href} href={href} className="text-ink2 hover:text-ink">{label}</Link>
              ))}
            </nav>
          </div>
          {!demo && (
            <form action={logout} className="flex items-center gap-3 text-sm text-ink2">
              <span className="hidden sm:inline">{admin.email}</span>
              <button type="submit" className="chip">Sign out</button>
            </form>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
