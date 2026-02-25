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
      lastReadAt: now,
    });
    await ctx.db.insert("conversationMembers", {
      conversationId,
      userId: args.otherUserId,
      joinedAt: now,
      lastReadAt: now,
    });

    return conversationId;
  },
});

export const createGroupConversation = mutationGeneric({
  args: {
    name: v.string(),
    memberIds: v.array(v.id("users")),
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

    const cleanedName = args.name.trim();
    if (cleanedName.length < 2) {
      throw new Error("Group name must be at least 2 characters");
    }

    const uniqueMemberIds = [...new Set(args.memberIds)];
    const filteredMemberIds = uniqueMemberIds.filter((id) => id !== currentUser._id);
    if (filteredMemberIds.length < 2) {
      throw new Error("Select at least 2 other users to create a group");
    }

    const existingMembers = await Promise.all(
      filteredMemberIds.map(async (memberId) => await ctx.db.get(memberId)),
    );
    if (existingMembers.some((member) => member === null)) {
      throw new Error("One or more selected users do not exist");
    }

    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      type: "group",
      name: cleanedName,
      createdBy: currentUser._id,
      createdAt: now,
      updatedAt: now,
    });

    const allMemberIds = [currentUser._id, ...filteredMemberIds];
    await Promise.all(
      allMemberIds.map(async (memberId) => {
        await ctx.db.insert("conversationMembers", {
          conversationId,
          userId: memberId,
          joinedAt: now,
          lastReadAt: now,
        });
      }),
    );

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
        lastSeenAt: profile.lastSeenAt,
      }));

    const otherParticipant = participants.find(
      (participant) => participant._id !== currentUser._id,
    );

    return {
      _id: conversation._id,
      memberCount: participants.length,
      type: conversation.type,
      title:
        conversation.type === "dm"
          ? otherParticipant?.name ?? "Direct Message"
          : conversation.name ?? "Group",
      counterpart:
        conversation.type === "dm"
          ? {
              _id: otherParticipant?._id ?? null,
              name: otherParticipant?.name ?? null,
              imageUrl: otherParticipant?.imageUrl ?? null,
              lastSeenAt: otherParticipant?.lastSeenAt ?? null,
            }
          : null,
      participants,
    };
  },
});

export const listMyConversations = queryGeneric({
  args: {},
  handler: async (ctx) => {
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
            lastSeenAt: profile.lastSeenAt,
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

        const membershipLastReadAt = membership.lastReadAt ?? 0;
        const unreadCount = (
          await ctx.db
            .query("messages")
            .withIndex("by_conversation_id", (q) =>
              q.eq("conversationId", conversation._id),
            )
            .collect()
        ).filter(
          (message) =>
            message.senderId !== currentUser._id &&
            message.createdAt > membershipLastReadAt,
        ).length;

        return {
          _id: conversation._id,
          type: conversation.type,
          memberCount: participants.length,
          title:
            conversation.type === "dm"
              ? otherParticipant?.name ?? "Direct Message"
              : conversation.name ?? "Group",
          counterpart:
            conversation.type === "dm"
              ? {
                  _id: otherParticipant?._id ?? null,
                  name: otherParticipant?.name ?? null,
                  imageUrl: otherParticipant?.imageUrl ?? null,
                  lastSeenAt: otherParticipant?.lastSeenAt ?? null,
                }
              : null,
          lastMessagePreview: latestMessage
            ? latestMessage.deletedAt
              ? "This message was deleted"
              : latestMessage.body
            : "No messages yet",
          lastMessageAt: latestMessage?.createdAt ?? conversation.updatedAt,
          unreadCount,
          participants,
        };
      }),
    );

    return conversationRows
      .filter((row) => row !== null)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  },
});

export const markConversationAsRead = mutationGeneric({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { conversationId: args.conversationId, lastReadAt: null };
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!currentUser) {
      return { conversationId: args.conversationId, lastReadAt: null };
    }

    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", currentUser._id),
      )
      .unique();
    if (!membership) {
      return { conversationId: args.conversationId, lastReadAt: null };
    }

    const now = Date.now();
    await ctx.db.patch(membership._id, {
      lastReadAt: now,
    });

    return { conversationId: args.conversationId, lastReadAt: now };
  },
});
