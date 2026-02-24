import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function SignInPage() {
  const { userId } = await auth();
  console.log("[sign-in page] userId:", userId);
  if (userId) {
    console.log("[sign-in page] already authenticated; redirecting to /app");
    redirect("/app");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <SignIn forceRedirectUrl="/app" />
    </main>
  );
}
