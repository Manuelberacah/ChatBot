import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function AppShellPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <p className="text-sm text-zinc-400">Protected route</p>
        <h1 className="mt-2 text-2xl font-semibold">App shell ready</h1>
        <p className="mt-3 text-zinc-300">
          Signed in as <span className="font-medium">{user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Unknown user"}</span>
        </p>
      </div>
    </main>
  );
}