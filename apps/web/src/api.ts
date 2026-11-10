export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

export class Api {
  sessionId = "";
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !(init.body instanceof FormData))
      headers.set("Content-Type", "application/json");
    if (this.sessionId) headers.set("X-Session-Id", this.sessionId);
    let response: Response;
    try {
      response = await fetch(`/api${path}`, {
        ...init,
        headers,
        cache: "no-store",
      });
    } catch {
      throw new ApiError(
        "NETWORK",
        "连接中断，已输入的内容仍在当前页面，请重试",
        true,
      );
    }
    const result = await response.json();
    if (!response.ok)
      throw new ApiError(
        result.code,
        result.message || "请求失败",
        result.retryable,
      );
    return result as T;
  }
  async initialize() {
    const session = await this.request<{ sessionId: string }>("/sessions", {
      method: "POST",
    });
    this.sessionId = session.sessionId;
  }
  dispose() {
    if (this.sessionId)
      void fetch("/api/sessions/current", {
        method: "DELETE",
        headers: { "X-Session-Id": this.sessionId },
        keepalive: true,
      }).catch(() => {});
  }
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("复制失败，请手动选择报告文本复制");
}
