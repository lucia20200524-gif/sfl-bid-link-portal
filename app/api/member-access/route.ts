import { z } from "zod";
import { checkMutation, failure, jsonBody, reply } from "@/lib/server-store";
import { loginMember, logoutMember, memberCookie } from "@/lib/member-auth";
export async function POST(request: Request) {
  try {
    checkMutation(request);
    const input = await jsonBody(request);
    const { action } = z.object({ action: z.enum(["login", "logout"]) }).parse(input);
    if (action === "logout") {
      await logoutMember(request);
      const response = reply({ ok: true });
      response.headers.set("Set-Cookie", memberCookie("", 0));
      return response;
    }
    const token = await loginMember(request, input);
    const response = reply({ ok: true });
    response.headers.set("Set-Cookie", memberCookie(token));
    return response;
  } catch (error) { return failure(error); }
}
