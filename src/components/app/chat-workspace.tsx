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
const listConversationMessagesRef = anyApi.messages
  .listConversationMessages as FunctionReference<"query">;
const sendMessageRef = anyApi.messages.sendMessage as FunctionReference<"mutation">;
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
  const [draft, setDraft] = useState("");
  const [startingConversationWith, setStartingConversationWith] =
    useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showNewMessagesButton, setShowNewMessagesButton] = useState(false);
  const [userIsNearBottom, setUserIsNearBottom] = useState(true);
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
  const sendMessage = useMutation(sendMessageRef);
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
      setStartingConversationWith(otherUserId);
      const conversationId = await getOrCreateDmConversation({ otherUserId });
      router.push(`/app?conversationId=${conversationId}`);
    } catch (error) {
      console.error("Failed to open conversation", error);
    } finally {
      setStartingConversationWith(null);
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
              <p className="text-sm text-zinc-400">Loading conversations...</p>
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
                        <span
                          className={`inline-block size-2 shrink-0 rounded-full ${
                            otherUserIsOnline ? "bg-emerald-400" : "bg-zinc-600"
                          }`}
                        />
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
              <p className="text-sm text-zinc-400">Loading users...</p>
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
        </div>
      </aside>

      <div
        className={`min-h-[620px] flex-col rounded-2xl border border-zinc-800 bg-zinc-900 ${
          isMobileChatOpen ? "flex" : "hidden md:flex"
        }`}
      >
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
                Direct Message
              </p>
              <h3 className="mt-1 text-xl font-semibold">
                {selectedConversation.title}
              </h3>
              {selectedConversation.counterpart ? (
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
                <p className="text-sm text-zinc-400">Loading messages...</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-zinc-400">
                  No messages yet. Send the first message.
                </p>
              ) : (
                messages.map((message) => (
                  <div
                    key={message._id}
                    className={`max-w-[80%] rounded-xl px-3 py-2 ${
                      message.isMine
                        ? "ml-auto bg-zinc-100 text-zinc-900"
                        : "bg-zinc-800 text-zinc-100"
                    }`}
                  >
                    <p className="text-[11px] opacity-70">{message.senderName}</p>
                    <p className="mt-1 text-sm">{message.body}</p>
                    <p className="mt-1 text-[11px] opacity-70">
                      {formatChallengeTimestamp(message.createdAt)}
                    </p>
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

