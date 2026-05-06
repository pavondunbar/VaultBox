import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { LogoutButton } from "@/components/LogoutButton";
import { ResendVerificationButton } from "@/components/ResendVerificationButton";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }

  const [user] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-ink-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-wide text-mint-400">
              VenCura
            </span>
            <span className="text-xs text-slate-500">dashboard</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/security"
              className="text-sm text-slate-400 hover:text-mint-400"
            >
              Security
            </Link>
            <span className="hidden text-sm text-slate-400 sm:inline">
              {session.email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      {user && !user.emailVerified && (
        <div className="border-b border-amber-600/30 bg-amber-900/20 px-6 py-3">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <p className="text-sm text-amber-200">
              Please verify your email to unlock all features.
            </p>
            <ResendVerificationButton />
          </div>
        </div>
      )}
      <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
    </div>
  );
}
