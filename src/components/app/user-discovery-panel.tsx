"use client";

import { useMutation, useQuery } from "convex/react";
import { anyApi, type FunctionReference } from "convex/server";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

type DiscoverableUser = {
  _id: string;
  name: string;
  imageUrl: string | null;
  email: string | null;
};

type ConversationPreview = {
  _id: string;
  type: "dm" | "group";
  title: string;
  participants: Array<{
    _id: string;
    name: string;
    imageUrl: string | null;
  }>;
};

const searchUsersRef = anyApi.users
  .searchDiscoverableUsers as FunctionReference<"query">;
const getOrCreateDmConversationRef = anyApi.conversations
  .getOrCreateDmConversation as FunctionReference<"mutation">;
const getConversationPreviewRef = anyApi.conversations
  .getConversationPreview as FunctionReference<"query">;

export function UserDiscoveryPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchText, setSearchText] = useState("");
  const [startingConversationWith, setStartingConversationWith] =
    useState<string | null>(null);

  const selectedConversationId = searchParams.get("conversationId");
  const users = useQuery(searchUsersRef, {
    searchText,
  }) as DiscoverableUser[] | undefined;
  const selectedConversation = useQuery(
    getConversationPreviewRef,
    selectedConversationId ? { conversationId: selectedConversationId } : "skip",
  ) as ConversationPreview | undefined | null;
  const getOrCreateDmConversation = useMutation(getOrCreateDmConversationRef);

  const selectedConversationParticipantIds = useMemo(() => {
    if (!selectedConversation) {
      return new Set<string>();
    }
    return new Set(selectedConversation.participants.map((user) => user._id));
  }, [selectedConversation]);

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

  return (
    <section className="grid gap-6 md:grid-cols-[340px_1fr]">
      <aside className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">People</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Find users and open a direct conversation.
        </p>
        <label className="mt-4 block">
          <span className="sr-only">Search users</span>
          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search by name..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-zinc-500 focus:ring-2"
          />
        </label>

        <div className="mt-4 space-y-2">
          {users === undefined ? (
            <p className="text-sm text-zinc-400">Loading users...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No users found. Ask another user to sign in first.
            </p>
          ) : (
            users.map((user) => {
              const isStartingConversation = startingConversationWith === user._id;
              return (
                <button
                  key={user._id}
                  type="button"
                  onClick={() => handleStartConversation(user._id)}
                  disabled={Boolean(startingConversationWith)}
                  className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left transition hover:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-zinc-100">
                      {user.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-400">
                      {user.email ?? "No email"}
                    </span>
                  </span>
                  <span className="ml-3 text-xs text-zinc-400">
                    {isStartingConversation
                      ? "Opening..."
                      : selectedConversationParticipantIds.has(user._id)
                        ? "Opened"
                        : "Chat"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        {!selectedConversationId ? (
          <>
            <p className="text-sm text-zinc-400">No conversation selected</p>
            <h3 className="mt-2 text-2xl font-semibold">
              Select a user to start chatting
            </h3>
            <p className="mt-3 text-zinc-300">
              Clicking any user creates a DM if needed, or opens the existing one.
            </p>
          </>
        ) : selectedConversation === undefined ? (
          <p className="text-sm text-zinc-400">Loading conversation...</p>
        ) : selectedConversation === null ? (
          <p className="text-sm text-red-300">
            You do not have access to this conversation.
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-400">Conversation ready</p>
            <h3 className="mt-2 text-2xl font-semibold">
              {selectedConversation.title}
            </h3>
            <p className="mt-3 text-zinc-300">
              PR-03 scope complete: user discovery, search, and create/open DM
              flow.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
