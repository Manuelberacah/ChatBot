import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

function buildDmKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

export const getOrCreateDmConversation = mutationGeneric({
  args: {
    otherUserId: v.id("users"),
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
    if (currentUser._id === args.otherUserId) {
      throw new Error("Cannot start a conversation with yourself");
    }

    const otherUser = await ctx.db.get(args.otherUserId);
    if (!otherUser) {
      throw new Error("Selected user does not exist");
    }

    const dmKey = buildDmKey(currentUser._id, args.otherUserId);
    const existingConversation = await ctx.db
      .query("conversations")
      .withIndex("by_dm_key", (q) => q.eq("dmKey", dmKey))
      .unique();
    if (existingConversation) {
      return existingConversation._id;
    }

    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      type: "dm",
      dmKey,
      createdBy: currentUser._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("conversationMembers", {
      conversationId,
      userId: currentUser._id,
      joinedAt: now,
    });
    await ctx.db.insert("conversationMembers", {
      conversationId,
      userId: args.otherUserId,
      joinedAt: now,
    });

    return conversationId;
  },
});

export const getConversationPreview = queryGeneric({
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
      return null;
    }

    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", currentUser._id),
      )
      .unique();
    if (!membership) {
      return null;
    }

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      return null;
    }

    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_id", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();

    const profiles = await Promise.all(
      members.map(async (member) => await ctx.db.get(member.userId)),
    );

    const participants = profiles
      .filter((profile) => profile !== null)
      .map((profile) => ({
        _id: profile._id,
        name: profile.name,
        imageUrl: profile.imageUrl ?? null,
      }));

    const otherParticipant = participants.find(
      (participant) => participant._id !== currentUser._id,
    );

    return {
      _id: conversation._id,
      type: conversation.type,
      title:
        conversation.type === "dm"
          ? otherParticipant?.name ?? "Direct Message"
          : conversation.name ?? "Group",
      participants,
    };
  },
});

export const listMyConversations = queryGeneric({
  args: {},
  handler: async (ctx) => {
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

    const memberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user_id", (q) => q.eq("userId", currentUser._id))
      .collect();

    const conversationRows = await Promise.all(
      memberships.map(async (membership) => {
        const conversation = await ctx.db.get(membership.conversationId);
        if (!conversation) {
          return null;
        }

        const members = await ctx.db
          .query("conversationMembers")
          .withIndex("by_conversation_id", (q) =>
            q.eq("conversationId", conversation._id),
          )
          .collect();

        const profiles = await Promise.all(
          members.map(async (member) => await ctx.db.get(member.userId)),
        );
        const participants = profiles
          .filter((profile) => profile !== null)
          .map((profile) => ({
            _id: profile._id,
            name: profile.name,
            imageUrl: profile.imageUrl ?? null,
          }));

        const otherParticipant = participants.find(
          (participant) => participant._id !== currentUser._id,
        );

        const latestMessage = await ctx.db
          .query("messages")
          .withIndex("by_conversation_id", (q) =>
            q.eq("conversationId", conversation._id),
          )
          .order("desc")
          .first();

        return {
          _id: conversation._id,
          title:
            conversation.type === "dm"
              ? otherParticipant?.name ?? "Direct Message"
              : conversation.name ?? "Group",
          lastMessagePreview: latestMessage?.body ?? "No messages yet",
          lastMessageAt: latestMessage?.createdAt ?? conversation.updatedAt,
          participants,
        };
      }),
    );

    return conversationRows
      .filter((row) => row !== null)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  },
});
