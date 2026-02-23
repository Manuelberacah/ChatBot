import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

export const sendMessage = mutationGeneric({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
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
      throw new Error("User profile not found. Please refresh the app.");
    }

    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", currentUser._id),
      )
      .unique();
    if (!membership) {
      throw new Error("Forbidden: you are not a member of this conversation");
    }

    const body = args.body.trim();
    if (!body) {
      throw new Error("Message body is required");
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: currentUser._id,
      body,
      createdAt: now,
    });

    await ctx.db.patch(args.conversationId, {
      updatedAt: now,
    });

    return messageId;
  },
});

export const listConversationMessages = queryGeneric({
  args: {
    conversationId: v.id("conversations"),
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

    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", currentUser._id),
      )
      .unique();
    if (!membership) {
      return [];
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_id", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();

    const senderIds = [...new Set(messages.map((message) => message.senderId))];
    const senders = await Promise.all(
      senderIds.map(async (senderId) => {
        const sender = await ctx.db.get(senderId);
        if (!sender) {
          return null;
        }
        return {
          _id: sender._id,
          name: sender.name,
        };
      }),
    );
    const senderNameById = new Map(
      senders
        .filter((sender) => sender !== null)
        .map((sender) => [sender._id, sender.name]),
    );

    return messages.map((message) => ({
      _id: message._id,
      senderId: message.senderId,
      senderName: senderNameById.get(message.senderId) ?? "Unknown user",
      body: message.body,
      createdAt: message.createdAt,
      isMine: message.senderId === currentUser._id,
    }));
  },
});
