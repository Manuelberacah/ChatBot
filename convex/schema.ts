import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_name", ["name"]),
  conversations: defineTable({
    type: v.union(v.literal("dm"), v.literal("group")),
    dmKey: v.optional(v.string()),
    name: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_dm_key", ["dmKey"])
    .index("by_updated_at", ["updatedAt"]),
  conversationMembers: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    joinedAt: v.number(),
    lastReadAt: v.number(),
  })
    .index("by_conversation_id", ["conversationId"])
    .index("by_user_id", ["userId"])
    .index("by_conversation_and_user", ["conversationId", "userId"]),
  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_conversation_id", ["conversationId", "createdAt"])
    .index("by_sender_id", ["senderId"]),
  typingEvents: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    expiresAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversation_id", ["conversationId"])
    .index("by_user_id", ["userId"])
    .index("by_conversation_and_user", ["conversationId", "userId"]),
  messageReactions: defineTable({
    messageId: v.id("messages"),
    userId: v.id("users"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_message_id", ["messageId"])
    .index("by_message_user_emoji", ["messageId", "userId", "emoji"]),
});
