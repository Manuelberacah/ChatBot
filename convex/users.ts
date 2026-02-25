export const touchCurrentUserPresence = mutationGeneric({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { lastSeenAt: null };
    }

    let currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      const now = Date.now();

      const name =
        ((identity as { name?: string }).name ?? "User").trim() || "User";
      const email = (identity as { email?: string }).email;
      const imageUrl = (identity as { pictureUrl?: string }).pictureUrl;

      const createdId = await ctx.db.insert("users", {
        clerkId: identity.subject,
        name,
        imageUrl,
        email,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      });

      currentUser = await ctx.db.get(createdId);
      if (!currentUser) {
        return { lastSeenAt: null };
      }
    }

    const now = Date.now();

    await ctx.db.patch(currentUser._id, {
      lastSeenAt: now,
      updatedAt: now,
    });

    return { lastSeenAt: now };
  },
});