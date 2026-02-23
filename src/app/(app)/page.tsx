export default function AppShellPage() {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <p className="text-sm text-zinc-400">PR-02 complete</p>
      <h1 className="mt-2 text-2xl font-semibold">Auth shell + user sync ready</h1>
      <p className="mt-3 text-zinc-300">
        Clerk users are now synchronized to Convex on first app load after sign
        in. Next PR will add user discovery and start/create DM conversations.
      </p>
      <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-sm text-zinc-300">
          Upcoming: user list, search, and conversation bootstrap.
        </p>
      </div>
    </section>
  );
}
