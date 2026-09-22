export class BrowserFetchError extends Error {
  constructor(message: string, public pause = false, public status?: number) { super(message); }
}

export function officialHttpError(status: number) {
  return new BrowserFetchError(status === 403
    ? "自動取得が拒否されました（403）。このページは公式サイトでご確認ください。他の確認先の収集は続けます。"
    : status === 404
    ? "リンク先のページが見つかりません（404）。掲載元の公式ページで現在の案内を確認してください。"
    : `公式ページを取得できませんでした（HTTP ${status}）。`, status === 429, status);
}
