"use client";

import { useMutation, useQuery } from "convex/react";
import { anyApi, type FunctionReference } from "convex/server";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type DiscoverableUser = {
  _id: string;
  name: string;
  imageUrl: string | null;
  email: string | null;
  lastSeenAt: number;
};

type ConversationListItem = {
  _id: string;
  type: "dm" | "group";
  memberCount: number;
  title: string;
  lastMessagePreview: string;
  lastMessageAt: number;
  unreadCount: number;
  counterpart: {
    _id: string | null;
    name: string | null;
    imageUrl: string | null;
    lastSeenAt: number | null;
  } | null;
  participants: Array<{
    _id: string;
    name: string;
    imageUrl: string | null;
    lastSeenAt: number;
  }>;
};

type ConversationPreview = {
  _id: string;
  type: "dm" | "group";
  memberCount: number;
  title: string;
  counterpart: {
    _id: string | null;
    name: string | null;
    imageUrl: string | null;
    lastSeenAt: number | null;
  } | null;
  participants: Array<{
    _id: string;
    name: string;
    imageUrl: string | null;
    lastSeenAt: number;
  }>;
};

type ChatMessage = {
  _id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: number;
  isMine: boolean;
  isDeleted: boolean;
  reactions: Array<{
    emoji: string;
    count: number;
    reactedByMe: boolean;
  }>;
};

type TypingUser = {
  userId: string;
  name: string;
  expiresAt: number;
};

const searchUsersRef = anyApi.users
  .searchDiscoverableUsers as FunctionReference<"query">;
const getOrCreateDmConversationRef = anyApi.conversations
  .getOrCreateDmConversation as FunctionReference<"mutation">;
const getConversationPreviewRef = anyApi.conversations
  .getConversationPreview as FunctionReference<"query">;
const listMyConversationsRef = anyApi.conversations
  .listMyConversations as FunctionReference<"query">;
const markConversationAsReadRef = anyApi.conversations
  .markConversationAsRead as FunctionReference<"mutation">;
const createGroupConversationRef = anyApi.conversations
  .createGroupConversation as FunctionReference<"mutation">;
const listConversationMessagesRef = anyApi.messages
  .listConversationMessages as FunctionReference<"query">;
const sendMessageRef = anyApi.messages.sendMessage as FunctionReference<"mutation">;
const deleteOwnMessageRef = anyApi.messages
  .deleteOwnMessage as FunctionReference<"mutation">;
const toggleReactionRef = anyApi.messages
  .toggleReaction as FunctionReference<"mutation">;
const setTypingStateRef = anyApi.typing
  .setTypingState as FunctionReference<"mutation">;
const getTypingUsersRef = anyApi.typing.getTypingUsers as FunctionReference<"query">;

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatChallengeTimestamp(timestamp: number) {
  const now = new Date();
  const date = new Date(timestamp);

  if (isSameCalendarDay(date, now)) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

const ONLINE_THRESHOLD_MS = 30_000;
const AUTO_SCROLL_THRESHOLD_PX = 80;

function isOnline(lastSeenAt: number, now: number) {
  return now - lastSeenAt <= ONLINE_THRESHOLD_MS;
}

function isNearBottom(container: HTMLDivElement) {
  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  return distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX;
}

export function ChatWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchText, setSearchText] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [startingConversationWith, setStartingConversationWith] =
    useState<string | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showNewMessagesButton, setShowNewMessagesButton] = useState(false);
  const [userIsNearBottom, setUserIsNearBottom] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedMessageDraft, setFailedMessageDraft] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedConversationId = searchParams.get("conversationId");
  const isMobileChatOpen = Boolean(selectedConversationId);
  const users = useQuery(searchUsersRef, {
    searchText,
  }) as DiscoverableUser[] | undefined;
  const conversations = useQuery(
    listMyConversationsRef,
    {},
  ) as ConversationListItem[] | undefined;
  const selectedConversation = useQuery(
    getConversationPreviewRef,
    selectedConversationId ? { conversationId: selectedConversationId } : "skip",
  ) as ConversationPreview | undefined | null;
  const messages = useQuery(
    listConversationMessagesRef,
    selectedConversationId ? { conversationId: selectedConversationId } : "skip",
  ) as ChatMessage[] | undefined;
  const typingUsers = useQuery(
    getTypingUsersRef,
    selectedConversationId ? { conversationId: selectedConversationId } : "skip",
  ) as TypingUser[] | undefined;
  const latestMessageId =
    messages && messages.length > 0 ? messages[messages.length - 1]._id : null;

  const getOrCreateDmConversation = useMutation(getOrCreateDmConversationRef);
  const createGroupConversation = useMutation(createGroupConversationRef);
  const sendMessage = useMutation(sendMessageRef);
  const deleteOwnMessage = useMutation(deleteOwnMessageRef);
  const toggleReaction = useMutation(toggleReactionRef);
  const markConversationAsRead = useMutation(markConversationAsReadRef);
  const setTypingState = useMutation(setTypingStateRef);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    const trimmedDraft = draft.trim();
    if (!trimmedDraft) {
      void setTypingState({
        conversationId: selectedConversationId,
        isTyping: false,
      });
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void setTypingState({
        conversationId: selectedConversationId,
        isTyping: true,
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [draft, selectedConversationId, setTypingState]);

  useEffect(() => {
    if (!selectedConversationId || messages === undefined) {
      return;
    }

    void markConversationAsRead({
      conversationId: selectedConversationId,
    });
  }, [latestMessageId, markConversationAsRead, messages, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setShowNewMessagesButton(false);
      setUserIsNearBottom(true);
      return;
    }

    setShowNewMessagesButton(false);
    setUserIsNearBottom(true);
    const timeoutId = window.setTimeout(() => {
      const container = messagesContainerRef.current;
      if (!container) {
        return;
      }
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "auto",
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [selectedConversationId]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || messages === undefined) {
      return;
    }

    if (userIsNearBottom) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
      setShowNewMessagesButton(false);
      return;
    }

    if (messages.length > 0) {
      setShowNewMessagesButton(true);
    }
  }, [latestMessageId, messages, userIsNearBottom]);

  useEffect(() => {
    return () => {
      if (!selectedConversationId) {
        return;
      }
      void setTypingState({
        conversationId: selectedConversationId,
        isTyping: false,
      });
    };
  }, [selectedConversationId, setTypingState]);

  const usersWithExistingConversation = useMemo(() => {
    if (!conversations) {
      return new Set<string>();
    }
    return new Set(
      conversations
        .map((conversation) => conversation.counterpart?._id)
        .filter((id): id is string => Boolean(id)),
    );
  }, [conversations]);

  const activeTypingUsers = useMemo(
    () =>
      (typingUsers ?? []).filter((typingUser) => typingUser.expiresAt > now),
    [typingUsers, now],
  );

  function scrollMessagesToBottom() {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
    setShowNewMessagesButton(false);
    setUserIsNearBottom(true);
  }

  function handleMessagesScroll() {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }
    const nearBottom = isNearBottom(container);
    setUserIsNearBottom(nearBottom);
    if (nearBottom) {
      setShowNewMessagesButton(false);
    }
  }

  async function handleStartConversation(otherUserId: string) {
    if (startingConversationWith) {
      return;
    }

    try {
      setErrorMessage(null);
      setStartingConversationWith(otherUserId);
      const conversationId = await getOrCreateDmConversation({ otherUserId });
      router.push(`/app?conversationId=${conversationId}`);
    } catch (error) {
      console.error("Failed to open conversation", error);
      setErrorMessage("Could not open conversation. Please try again.");
    } finally {
      setStartingConversationWith(null);
    }
  }

  function toggleGroupMember(userId: string) {
    setGroupMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  async function handleCreateGroupConversation() {
    if (isCreatingGroup) {
      return;
    }

    const cleanedName = groupName.trim();
    if (!cleanedName) {
      setErrorMessage("Please provide a group name.");
      return;
    }
    if (groupMemberIds.length < 2) {
      setErrorMessage("Select at least 2 users to create a group.");
      return;
    }

    try {
      setErrorMessage(null);
      setIsCreatingGroup(true);
      const conversationId = await createGroupConversation({
        name: cleanedName,
        memberIds: groupMemberIds,
      });
      setGroupName("");
      setGroupMemberIds([]);
      router.push(`/app?conversationId=${conversationId}`);
    } catch (error) {
      console.error("Failed to create group conversation", error);
      setErrorMessage("Could not create group conversation. Please try again.");
    } finally {
      setIsCreatingGroup(false);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversationId || isSending) {
      return;
    }

    const body = draft.trim();
    if (!body) {
      return;
    }

    try {
      setErrorMessage(null);
      setFailedMessageDraft(null);
      setIsSending(true);
      await sendMessage({
        conversationId: selectedConversationId,
        body,
      });
      await setTypingState({
        conversationId: selectedConversationId,
        isTyping: false,
      });
      setDraft("");
    } catch (error) {
      console.error("Failed to send message", error);
      setFailedMessageDraft(body);
      setErrorMessage("Message failed to send.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    try {
      setErrorMessage(null);
      await deleteOwnMessage({ messageId });
    } catch (error) {
      console.error("Failed to delete message", error);
      setErrorMessage("Could not delete message. Please try again.");
    }
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    try {
      setErrorMessage(null);
      await toggleReaction({ messageId, emoji });
    } catch (error) {
      console.error("Failed to toggle reaction", error);
      setErrorMessage("Could not update reaction. Please try again.");
    }
  }

  async function handleRetryFailedMessage() {
    if (!selectedConversationId || !failedMessageDraft || isSending) {
      return;
    }

    try {
      setErrorMessage(null);
      setIsSending(true);
      await sendMessage({
        conversationId: selectedConversationId,
        body: failedMessageDraft,
      });
      await setTypingState({
        conversationId: selectedConversationId,
        isTyping: false,
      });
      setFailedMessageDraft(null);
      setDraft("");
    } catch (error) {
      console.error("Failed to retry message", error);
      setErrorMessage("Retry failed. Check connection and try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="grid gap-6 md:grid-cols-[340px_1fr]">
      <aside
        className={`space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 ${
          isMobileChatOpen ? "hidden md:block" : "block"
        }`}
      >
        <div>
          <h2 className="text-lg font-semibold">Conversations</h2>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {conversations === undefined ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`conversation-skeleton-${index}`}
                    className="h-12 animate-pulse rounded-lg border border-zinc-800 bg-zinc-800/50"
                  />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No conversations yet. Start one from the user list.
              </p>
            ) : (
              conversations.map((conversation) => {
                const isActive = selectedConversationId === conversation._id;
                const otherUserIsOnline =
                  conversation.counterpart?.lastSeenAt !== null &&
                  conversation.counterpart?.lastSeenAt !== undefined
                    ? isOnline(conversation.counterpart.lastSeenAt, now)
                  : false;
                return (
                  <button
                    key={conversation._id}
                    type="button"
                    onClick={() =>
                      router.push(`/app?conversationId=${conversation._id}`)
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      isActive
                        ? "border-zinc-500 bg-zinc-800"
                        : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-zinc-100">
                        {conversation.type === "dm" ? (
                          <span
                            className={`inline-block size-2 shrink-0 rounded-full ${
                              otherUserIsOnline ? "bg-emerald-400" : "bg-zinc-600"
                            }`}
                          />
                        ) : (
                          <span className="inline-block shrink-0 text-[10px] text-zinc-400">
                            grp
                          </span>
                        )}
                        <span className="truncate">{conversation.title}</span>
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        {conversation.unreadCount > 0 ? (
                          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-950">
                            {conversation.unreadCount}
                          </span>
                        ) : null}
                        <span className="text-[10px] text-zinc-500">
                          {formatChallengeTimestamp(conversation.lastMessageAt)}
                        </span>
                      </div>
                    </div>
                    {conversation.type === "group" ? (
                      <p className="mt-1 text-[10px] text-zinc-500">
                        {conversation.memberCount} members
                      </p>
                    ) : null}
                    <p className="mt-1 truncate text-xs text-zinc-400">
                      {conversation.lastMessagePreview}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <h2 className="text-lg font-semibold">People</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Search users and start a direct conversation.
          </p>
          <label className="mt-3 block">
            <span className="sr-only">Search users</span>
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search by name..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-zinc-500 focus:ring-2"
            />
          </label>
          <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
            {users === undefined ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`user-skeleton-${index}`}
                    className="h-11 animate-pulse rounded-lg border border-zinc-800 bg-zinc-800/50"
                  />
                ))}
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-zinc-400">
                {searchText.trim()
                  ? "No search results. Try another name."
                  : "No other users found yet. Ask another user to sign in."}
              </p>
            ) : (
              users.map((user) => {
                const isStarting = startingConversationWith === user._id;
                return (
                  <button
                    key={user._id}
                    type="button"
                    onClick={() => handleStartConversation(user._id)}
                    disabled={Boolean(startingConversationWith)}
                    className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left transition hover:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span
                          className={`inline-block size-2 rounded-full ${
                            isOnline(user.lastSeenAt, now)
                              ? "bg-emerald-400"
                              : "bg-zinc-600"
                          }`}
                        />
                        <span className="truncate text-sm font-medium text-zinc-100">
                          {user.name}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-zinc-400">
                        {user.email ?? "No email"}
                      </span>
                    </span>
                    <span className="ml-3 text-xs text-zinc-400">
                      {isStarting
                        ? "Opening..."
                        : usersWithExistingConversation.has(user._id)
                          ? "Open"
                          : "Chat"}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-sm font-medium text-zinc-100">Create group chat</p>
            <p className="mt-1 text-xs text-zinc-400">
              Pick at least 2 users and give your group a name.
            </p>
            <input
              type="text"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Group name..."
              className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none ring-zinc-500 focus:ring-2"
            />
            <div className="mt-3 max-h-36 space-y-1 overflow-y-auto pr-1">
              {(users ?? []).map((user) => {
                const selected = groupMemberIds.includes(user._id);
                return (
                  <button
                    key={`group-${user._id}`}
                    type="button"
                    onClick={() => toggleGroupMember(user._id)}
                    className={`flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs ${
                      selected
                        ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                        : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    <span className="truncate">{user.name}</span>
                    <span>{selected ? "Selected" : "Select"}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleCreateGroupConversation}
              disabled={isCreatingGroup}
              className="mt-3 w-full rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingGroup
                ? "Creating group..."
                : `Create group (${groupMemberIds.length} selected)`}
            </button>
          </div>
        </div>
      </aside>

      <div
        className={`min-h-[620px] flex-col rounded-2xl border border-zinc-800 bg-zinc-900 ${
          isMobileChatOpen ? "flex" : "hidden md:flex"
        }`}
      >
        {errorMessage ? (
          <div className="mx-4 mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            <div className="flex items-center justify-between gap-3">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="rounded border border-red-300/30 px-2 py-0.5 text-xs hover:bg-red-500/20"
              >
                Dismiss
              </button>
            </div>
            {failedMessageDraft ? (
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRetryFailedMessage}
                  className="rounded border border-red-300/40 bg-red-500/20 px-2 py-1 text-xs hover:bg-red-500/30"
                >
                  Retry send
                </button>
                <span className="truncate text-xs opacity-90">
                  {failedMessageDraft}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {!selectedConversationId ? (
          <div className="p-6">
            <p className="text-sm text-zinc-400">No conversation selected</p>
            <h3 className="mt-2 text-2xl font-semibold">
              Select a conversation to view messages
            </h3>
            <p className="mt-3 text-zinc-300">
              This panel updates in real time when new messages are sent.
            </p>
          </div>
        ) : selectedConversation === undefined ? (
          <p className="p-6 text-sm text-zinc-400">Loading conversation...</p>
        ) : selectedConversation === null ? (
          <p className="p-6 text-sm text-red-300">
            You do not have access to this conversation.
          </p>
        ) : (
          <>
            <div className="border-b border-zinc-800 px-6 py-4">
              <button
                type="button"
                onClick={() => router.push("/app")}
                className="mb-3 inline-flex rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800 md:hidden"
              >
                Back
              </button>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                {selectedConversation.type === "group"
                  ? "Group Chat"
                  : "Direct Message"}
              </p>
              <h3 className="mt-1 text-xl font-semibold">
                {selectedConversation.title}
              </h3>
              {selectedConversation.type === "group" ? (
                <p className="mt-2 text-xs text-zinc-400">
                  {selectedConversation.memberCount} members
                </p>
              ) : selectedConversation.counterpart ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                  <span
                    className={`inline-block size-2 rounded-full ${
                      selectedConversation.counterpart?.lastSeenAt !== null &&
                      selectedConversation.counterpart?.lastSeenAt !== undefined &&
                      isOnline(selectedConversation.counterpart.lastSeenAt, now)
                        ? "bg-emerald-400"
                        : "bg-zinc-600"
                    }`}
                  />
                  {selectedConversation.counterpart?.lastSeenAt !== null &&
                  selectedConversation.counterpart?.lastSeenAt !== undefined &&
                  isOnline(selectedConversation.counterpart.lastSeenAt, now)
                    ? "Online"
                    : "Offline"}
                </p>
              ) : null}
            </div>

            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              className="flex-1 space-y-3 overflow-y-auto px-6 py-4"
            >
              {messages === undefined ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={`message-skeleton-${index}`}
                      className={`h-14 animate-pulse rounded-xl bg-zinc-800/70 ${
                        index % 2 === 0 ? "ml-auto w-2/3" : "w-3/4"
                      }`}
                    />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <p className="text-sm text-zinc-400">
                  No messages yet. Send the first message.
                </p>
              ) : (
                messages.map((message) => (
                  <div
                    key={message._id}
                    className={`group relative max-w-[80%] rounded-xl px-3 py-2 ${
                      message.isMine
                        ? "ml-auto bg-zinc-100 text-zinc-900"
                        : "bg-zinc-800 text-zinc-100"
                    }`}
                  >
                    {message.isMine && !message.isDeleted ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(message._id)}
                        className="absolute -top-2 -left-2 hidden rounded-full border border-zinc-500 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-100 hover:bg-zinc-800 group-hover:block"
                      >
                        Delete
                      </button>
                    ) : null}
                    <p className="text-[11px] opacity-70">{message.senderName}</p>
                    {message.isDeleted ? (
                      <p className="mt-1 text-sm italic opacity-80">
                        This message was deleted
                      </p>
                    ) : (
                      <p className="mt-1 text-sm">{message.body}</p>
                    )}
                    <p className="mt-1 text-[11px] opacity-70">
                      {formatChallengeTimestamp(message.createdAt)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {message.reactions.map((reaction) => (
                        <button
                          key={`${message._id}-${reaction.emoji}`}
                          type="button"
                          onClick={() =>
                            handleToggleReaction(message._id, reaction.emoji)
                          }
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${
                            reaction.reactedByMe
                              ? "border-emerald-400 bg-emerald-100 text-zinc-900"
                              : message.isMine
                                ? "border-zinc-400 bg-white/70 text-zinc-900"
                                : "border-zinc-600 bg-zinc-700 text-zinc-100"
                          }`}
                        >
                          {reaction.emoji} {reaction.count > 0 ? reaction.count : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-6">
              {showNewMessagesButton ? (
                <button
                  type="button"
                  onClick={scrollMessagesToBottom}
                  className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-700"
                >
                  New messages ↓
                </button>
              ) : null}
            </div>

            <div className="px-6 pb-2">
              {activeTypingUsers.length > 0 ? (
                <p className="text-xs text-zinc-400">
                  {activeTypingUsers.map((typingUser) => typingUser.name).join(", ")}{" "}
                  {activeTypingUsers.length > 1 ? "are typing..." : "is typing..."}
                </p>
              ) : (
                <p className="text-xs text-transparent">typing</p>
              )}
            </div>

            <form
              onSubmit={handleSendMessage}
              className="border-t border-zinc-800 p-4"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-zinc-500 focus:ring-2"
                />
                <button
                  type="submit"
                  disabled={isSending || draft.trim().length === 0}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </section>
  );
}

