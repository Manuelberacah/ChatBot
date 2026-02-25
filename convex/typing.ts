import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

const TYPING_TTL_MS = 2_000;

export const setTypingState = mutationGeneric({
  args: {
    conversationId: v.id("conversations"),
    isTyping: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!currentUser) {
      return null;
    }

    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .filter((q) => q.eq(q.field("userId"), currentUser._id))
      .unique();
    if (!membership) {
      throw new Error("Forbidden: you are not a member of this conversation");
    }

    const now = Date.now();
    const expiresAt = args.isTyping ? now + TYPING_TTL_MS : now;

    const existingTypingEvent = await ctx.db
      .query("typingEvents")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .filter((q) => q.eq(q.field("userId"), currentUser._id))
      .unique();

    if (existingTypingEvent) {
      await ctx.db.patch(existingTypingEvent._id, {
        expiresAt,
        updatedAt: now,
      });
      return existingTypingEvent._id;
    }

    return await ctx.db.insert("typingEvents", {
      conversationId: args.conversationId,
      userId: currentUser._id,
      expiresAt,
      updatedAt: now,
    });
  },
});

export const getTypingUsers = queryGeneric({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!currentUser) {
      return [];
    }

    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .filter((q) => q.eq(q.field("userId"), currentUser._id))
      .unique();
    if (!membership) {
      return [];
    }

    const typingEvents = await ctx.db
      .query("typingEvents")
      .withIndex("by_conversation_id", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();

    const now = Date.now();
    const activeTypingEvents = typingEvents.filter(
      (event) => event.userId !== currentUser._id && event.expiresAt > now,
    );

    const users = await Promise.all(
      activeTypingEvents.map(async (event) => {
        const user = await ctx.db.get(event.userId);
        if (!user) {
          return null;
        }
        return {
          userId: user._id,
          name: user.name,
          expiresAt: event.expiresAt,
        };
      }),
    );

    return users.filter((user) => user !== null);
  },
});
