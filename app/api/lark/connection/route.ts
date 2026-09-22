import { ApiError, failure, reply, requireMember } from "@/lib/server-store";
import { LarkClient, larkConfigured } from "@/lib/lark-client";
import { larkTargets } from "@/lib/lark-registration";
import type { PresetMode } from "@/lib/collection-profiles";

export async function GET(request: Request) {
  try {
    const actor = await requireMember(request);
    if (actor.role !== "owner") throw new ApiError(403, "接続の確認は管理者が行ってください。");
    if (!larkConfigured()) return reply({ connected: false, message: "Larkの接続設定がまだ完了していません。", targets: [] });
    const client = await new LarkClient().connect();
    const targets = [];
    for (const mode of Object.keys(larkTargets) as PresetMode[]) {
      await client.fields(mode);
      targets.push({ mode, name: larkTargets[mode].name, fieldsReady: true });
    }
    return reply({ connected: true, message: "3つの登録先とフィールドを確認しました。", targets });
  } catch (error) { return failure(error); }
}
