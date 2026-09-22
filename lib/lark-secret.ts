import { env } from "cloudflare:workers";
import { ApiError } from "./server-store";
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
async function encryptionKey() {
  const value = (env as { LARK_CONNECTION_ENCRYPTION_KEY?: string }).LARK_CONNECTION_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/.test(value)) throw new ApiError(503, "Lark接続の保存設定を管理者に確認してください。");
  return crypto.subtle.importKey("raw", Uint8Array.from(value.match(/../g)!, hex => parseInt(hex, 16)), "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptLarkSecret(value: string, userId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) }, await encryptionKey(), new TextEncoder().encode(value));
  return `v1.${encode(iv)}.${encode(new Uint8Array(cipher))}`;
}
export async function decryptLarkSecret(value: string, userId: string) {
  const key = await encryptionKey();
  try {
    const [version, iv, cipher] = value.split(".");
    if (version !== "v1") throw new Error();
    const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv), additionalData: new TextEncoder().encode(userId) }, key, decode(cipher));
    return new TextDecoder().decode(clear);
  } catch { throw new ApiError(503, "保存したLark接続を読み込めません。管理者に再設定を依頼してください。"); }
}
