import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";

// OWASP's 16 MiB scrypt profile fits the Workers memory limit. Keep the
// parameters versioned; never silently accept a cheaper stored work factor.
const prefix = "scrypt$16384$8$5";
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
export async function hashMemberPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${prefix}$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyMemberPassword(password: string, encoded: string | null) {
  const parts = encoded?.split("$");
  const valid = parts?.length === 6 && parts.slice(0, 4).join("$") === prefix && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{64}$/.test(parts[5]);
  // Unknown IDs and disabled accounts still perform the same password work.
  const actual = await derive(password, valid ? parts![4] : "00000000000000000000000000000000");
  const expected = Buffer.from(valid ? parts![5] : "00".repeat(32), "hex");
  return timingSafeEqual(actual, expected) && !!valid;
}
export const randomMemberToken = () => randomBytes(32).toString("hex");
export const memberTokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
