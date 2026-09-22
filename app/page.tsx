import { headers } from "next/headers";
import { chatGPTSignInPath, chatGPTSignOutPath } from "./chatgpt-auth";
import { ApiError } from "@/lib/server-store";
import { workspaceSession } from "@/lib/member-auth";
import BidApp from "./bid-app";
import MemberAccess from "./member-access";
export const dynamic = "force-dynamic";
export default async function Home() {
  const signInUrl = chatGPTSignInPath("/");
  const signOutUrl = chatGPTSignOutPath("/");
  try {
    const initialSession = await workspaceSession(new Request("https://portal.internal/", { headers: await headers() }));
    return <BidApp signInUrl={signInUrl} signOutUrl={signOutUrl} initialSession={initialSession}/>;
  } catch (error) {
    const status = error instanceof ApiError && error.status === 401 ? "signin"
      : error instanceof ApiError && error.status === 403 ? "membership" : "error";
    if (status === "error") console.error("portal membership check failed", error instanceof Error ? error.message : "unknown");
    return <MemberAccess signInUrl={signInUrl} signOutUrl={signOutUrl} status={status} message={error instanceof ApiError ? error.message : undefined}/>;
  }
}
