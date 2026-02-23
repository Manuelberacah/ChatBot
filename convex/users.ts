import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

export const upsertCurrentUser = mutationGeneric({
  args: {
    clerkId: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    if (identity.subject !== args.clerkId) {
      throw new Error("Forbidden: cannot sync another user profile");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        imageUrl: args.imageUrl,
        email: args.email,
        updatedAt: now,
        lastSeenAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      name: args.name,
      imageUrl: args.imageUrl,
      email: args.email,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
  },
});

export const getCurrentUserProfile = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

export const searchDiscoverableUsers = queryGeneric({
  args: {
    searchText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      return [];
    }

    const searchText = (args.searchText ?? "").trim().toLowerCase();
    const users = await ctx.db.query("users").withIndex("by_name").collect();

    return users
      .filter((user) => user._id !== currentUser._id)
      .filter((user) =>
        searchText.length === 0
          ? true
          : user.name.toLowerCase().includes(searchText),
      )
      .slice(0, 50)
      .map((user) => ({
        _id: user._id,
        name: user.name,
        imageUrl: user.imageUrl ?? null,
        email: user.email ?? null,
      }));
  },
});
