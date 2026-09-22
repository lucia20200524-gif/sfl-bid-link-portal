// Anonymous browser identity keeps review history separate without an account.
const COOKIE_NAME = "__Host-bid-guest";
function storedGuestId(request: Request): string | null {
  const value = (request.headers.get("cookie") || "").split(";")
    .map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
function newGuestId(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(value => value.toString(16).padStart(2, "0")).join("");
}
export function guestActorId(request: Request): string {
  return `guest:${storedGuestId(request) || newGuestId()}`;
}
export function prepareGuestSession(request: Request): { request: Request; cookie: string | null } {
  if (storedGuestId(request) || (request.headers.get("oai-authenticated-user-id") && request.headers.get("oai-authenticated-user-email"))) return { request, cookie: null };
  const id = newGuestId();
  const headers = new Headers(request.headers);
  const otherCookies = (headers.get("cookie") || "").split(";").map(part => part.trim())
    .filter(part => part && !part.startsWith(`${COOKIE_NAME}=`));
  headers.set("cookie", [...otherCookies, `${COOKIE_NAME}=${id}`].join("; "));
  return {
    request: new Request(request, { headers }),
    cookie: `${COOKIE_NAME}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
  };
}
