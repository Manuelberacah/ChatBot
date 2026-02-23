import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <section className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        <p className="text-sm text-zinc-400">Tars Coding Challenge 2026</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Realtime chat app
        </h1>
        <p className="mt-3 text-zinc-300">
          Next.js + TypeScript + Convex + Clerk starter. Sign in to access the
          protected app shell.
        </p>
        <div className="mt-8">
          <SignedOut>
            <SignInButton forceRedirectUrl="/app">
              <button className="rounded-lg bg-white px-4 py-2 font-medium text-zinc-900 hover:bg-zinc-200">
                Sign in to continue
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link
              href="/app"
              className="inline-flex rounded-lg bg-white px-4 py-2 font-medium text-zinc-900 hover:bg-zinc-200"
            >
              Open app shell
            </Link>
          </SignedIn>
        </div>
      </section>
    </main>
  );
}