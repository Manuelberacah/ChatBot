import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

function decodePublishableKeyDomain(publishableKey: string | undefined) {
  if (!publishableKey) return null;
  const parts = publishableKey.split("_");
  if (parts.length < 3) return null;
  const encoded = parts.slice(2).join("_");
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return decoded.endsWith("$") ? decoded.slice(0, -1) : decoded;
  } catch {
    return null;
  }
}

export async function GET() {
  const { userId } = await auth();
  const hdrs = await headers();
  const cookieHeader = hdrs.get("cookie") ?? "";

  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const issuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN ?? null;
  const decodedDomain = decodePublishableKeyDomain(publishableKey);

  return NextResponse.json({
    auth: {
      userId,
      hasCookieHeader: cookieHeader.length > 0,
      hasSessionCookieHint:
        cookieHeader.includes("__session") ||
        cookieHeader.includes("__client"),
    },
    env: {
      hasPublishableKey: Boolean(publishableKey),
      hasSecretKey: Boolean(process.env.CLERK_SECRET_KEY),
      issuerDomain,
      publishableKeyDecodedDomain: decodedDomain,
      domainMatch:
        Boolean(issuerDomain && decodedDomain) &&
        issuerDomain === `https://${decodedDomain}`,
    },
  });
}
