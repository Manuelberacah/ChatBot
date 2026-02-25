"use client";

import { useMutation } from "convex/react";
import { anyApi, type FunctionReference } from "convex/server";
import { useEffect } from "react";

const touchCurrentUserPresenceRef = anyApi.users
  .touchCurrentUserPresence as FunctionReference<"mutation">;

const HEARTBEAT_INTERVAL_MS = 15_000;

export function PresenceHeartbeat() {
  const touchCurrentUserPresence = useMutation(touchCurrentUserPresenceRef);

  useEffect(() => {
    let isMounted = true;

    async function beat() {
      if (!isMounted) {
        return;
      }
      try {
        await touchCurrentUserPresence({});
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes("Unauthorized") ||
          message.includes("network") ||
          message.includes("disconnected")
        ) {
          return;
        }
        console.error("Presence heartbeat failed", error);
      }
    }

    void beat();
    const intervalId = window.setInterval(() => {
      void beat();
    }, HEARTBEAT_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void beat();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [touchCurrentUserPresence]);

  return null;
}
