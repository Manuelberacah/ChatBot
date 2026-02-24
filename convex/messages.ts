import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮", "😢"] as const;

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
        q.eq("conversationId", args.conversationId),
      )
      .filter((q) => q.eq(q.field("userId"), currentUser._id))
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

export const deleteOwnMessage = mutationGeneric({
  args: {
    messageId: v.id("messages"),
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

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }
    if (message.senderId !== currentUser._id) {
      throw new Error("Forbidden: you can delete only your own messages");
    }
    if (message.deletedAt) {
      return args.messageId;
    }

    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", message.conversationId),
      )
      .filter((q) => q.eq(q.field("userId"), currentUser._id))
      .unique();
    if (!membership) {
      throw new Error("Forbidden: conversation membership required");
    }

    const now = Date.now();
    await ctx.db.patch(args.messageId, {
      deletedAt: now,
      deletedBy: currentUser._id,
      body: "",
    });

    await ctx.db.patch(message.conversationId, {
      updatedAt: now,
    });

    return args.messageId;
  },
});

export const toggleReaction = mutationGeneric({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    if (!ALLOWED_REACTIONS.includes(args.emoji as (typeof ALLOWED_REACTIONS)[number])) {
      throw new Error("Unsupported reaction");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!currentUser) {
      throw new Error("User profile not found. Please refresh the app.");
    }

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", message.conversationId),
      )
      .filter((q) => q.eq(q.field("userId"), currentUser._id))
      .unique();
    if (!membership) {
      throw new Error("Forbidden: conversation membership required");
    }

    const existingReaction = (
      await ctx.db
        .query("messageReactions")
        .withIndex("by_message_user_emoji", (q) => q.eq("messageId", args.messageId))
        .filter((q) =>
          q.and(
            q.eq(q.field("userId"), currentUser._id),
            q.eq(q.field("emoji"), args.emoji),
          ),
        )
        .collect()
    )[0];

    if (existingReaction) {
      await ctx.db.delete(existingReaction._id);
      return { removed: true };
    }

    await ctx.db.insert("messageReactions", {
      messageId: args.messageId,
      userId: currentUser._id,
      emoji: args.emoji,
      createdAt: Date.now(),
    });
    return { removed: false };
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
        q.eq("conversationId", args.conversationId),
      )
      .filter((q) => q.eq(q.field("userId"), currentUser._id))
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

    return await Promise.all(
      messages.map(async (message) => {
        const reactions = await ctx.db
          .query("messageReactions")
          .withIndex("by_message_id", (q) => q.eq("messageId", message._id))
          .collect();

        const reactionMap = new Map<string, { emoji: string; count: number; reactedByMe: boolean }>();
        for (const reaction of reactions) {
          const existing = reactionMap.get(reaction.emoji);
          if (existing) {
            existing.count += 1;
            if (reaction.userId === currentUser._id) {
              existing.reactedByMe = true;
            }
          } else {
            reactionMap.set(reaction.emoji, {
              emoji: reaction.emoji,
              count: 1,
              reactedByMe: reaction.userId === currentUser._id,
            });
          }
        }

        return {
          _id: message._id,
          senderId: message.senderId,
          senderName: senderNameById.get(message.senderId) ?? "Unknown user",
          body: message.body,
          createdAt: message.createdAt,
          isMine: message.senderId === currentUser._id,
          isDeleted: Boolean(message.deletedAt),
          reactions: ALLOWED_REACTIONS.map((emoji) => {
            const reaction = reactionMap.get(emoji);
            return {
              emoji,
              count: reaction?.count ?? 0,
              reactedByMe: reaction?.reactedByMe ?? false,
            };
          }),
        };
      }),
    );
  },
});
