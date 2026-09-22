import { env } from "cloudflare:workers";
import { ApiError } from "./server-store";

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));
async function key() {
  const value = (env as { PORTAL_CREDENTIAL_ENCRYPTION_KEY?: string }).PORTAL_CREDENTIAL_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/.test(value)) throw new ApiError(503, "会員のログイン情報を保存する設定が完了していません。");
  return crypto.subtle.importKey("raw", Uint8Array.from(value.match(/../g)!, hex => parseInt(hex, 16)), "AES-GCM", false, ["encrypt", "decrypt"]);
}
const context = (accountId: string) => new TextEncoder().encode(`portal-member-password:v1:${accountId}`);
export async function encryptMemberCredential(password: string, accountId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: context(accountId) }, await key(), new TextEncoder().encode(password));
  return `v1.${encode(iv)}.${encode(new Uint8Array(cipher))}`;
}
export async function decryptMemberCredential(cipher: string, accountId: string) {
  const encryptionKey = await key();
  try {
    const [version, iv, data] = cipher.split(".");
    if (version !== "v1") throw new Error();
    const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv), additionalData: context(accountId) }, encryptionKey, decode(data));
    return new TextDecoder().decode(clear);
  } catch { throw new ApiError(503, "パスワードを表示できませんでした。管理者の保存設定を確認してください。"); }
}
