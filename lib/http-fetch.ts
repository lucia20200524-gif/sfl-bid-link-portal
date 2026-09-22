// Workers supports manual/follow, but rejects redirect:"error" before sending
// the request. Keep the same no-redirect boundary explicitly, including for
// requests carrying provider credentials.
export async function fetchWithoutRedirects(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(input, { ...init, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error(`取得先の移動を検出したため停止しました（HTTP ${response.status}）。移動先の確認が必要です。`);
  }
  return response;
}
