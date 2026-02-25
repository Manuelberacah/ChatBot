"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { anyApi, type FunctionReference } from "convex/server";
import { useEffect, useRef } from "react";

type UpsertCurrentUserArgs = {
  clerkId: string;
  name: string;
  imageUrl?: string;
  email?: string;
};

const upsertCurrentUserRef = anyApi.users
  .upsertCurrentUser as FunctionReference<"mutation">;

export function UserSync() {
  const { isLoaded, user } = useUser();
  const upsertCurrentUser = useMutation(upsertCurrentUserRef);
  const lastSyncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !user) {
      return;
    }
    if (lastSyncedUserIdRef.current === user.id) {
      return;
    }

    const payload: UpsertCurrentUserArgs = {
      clerkId: user.id,
      name:
        user.fullName ??
        ([user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.username ||
          user.primaryEmailAddress?.emailAddress ||
          "User"),
      imageUrl: user.imageUrl ?? undefined,
      email: user.primaryEmailAddress?.emailAddress ?? undefined,
    };

    void upsertCurrentUser(payload)
      .then(() => {
        lastSyncedUserIdRef.current = user.id;
      })
      .catch((error: unknown) => {
        console.error("Failed to sync user profile to Convex", error);
      });
  }, [isLoaded, upsertCurrentUser, user]);

  return null;
}
