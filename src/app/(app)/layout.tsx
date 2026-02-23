import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { UserSync } from "@/components/app/user-sync";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();
  const displayName =
    user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Unknown user";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <UserSync />
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Tars Chat
            </p>
            <p className="text-sm text-zinc-200">
              Signed in as <span className="font-semibold">{displayName}</span>
            </p>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
