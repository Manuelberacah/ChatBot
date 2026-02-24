"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
}

const convex = new ConvexReactClient(convexUrl);

type ConvexClientProviderProps = {
  children: ReactNode;
};

export function ConvexClientProvider({
  children,
}: ConvexClientProviderProps) {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const auth = useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: Boolean(isSignedIn),
      fetchAccessToken: async () => {
        try {
          const token = await getToken({ template: "convex" });
          return token ?? null;
        } catch (error) {
          console.error("Failed to fetch Clerk convex token", error);
          return null;
        }
      },
    }),
    [getToken, isLoaded, isSignedIn],
  );

  return (
    <ConvexProviderWithAuth client={convex} useAuth={() => auth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
