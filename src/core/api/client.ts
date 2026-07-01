export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: unknown,
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = "ApiError";
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
}

export interface HttpRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor({ baseUrl, fetcher = fetch }: HttpClientOptions) {
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  async get<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  async post<T>(path: string, body: unknown, options: HttpRequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "POST", body });
  }

  async request<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
    const { body, headers, ...init } = options;
    const requestInit: RequestInit = {
      ...init,
      headers: this.buildHeaders(headers, body),
      body: this.buildBody(body),
    };

    const res = await this.fetcher(this.buildUrl(path), requestInit);
    return this.handleResponse<T>(res);
  }

  private buildUrl(path: string): string {
    const base = this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`;
    return new URL(path.replace(/^\//, ""), base).toString();
  }

  private buildHeaders(headers: HeadersInit | undefined, body: unknown): Headers {
    const result = new Headers(headers);
    if (body !== undefined && !result.has("Content-Type")) {
      result.set("Content-Type", "application/json");
    }
    return result;
  }

  private buildBody(body: unknown): BodyInit | null | undefined {
    if (body === undefined || body === null) return body;
    if (typeof body === "string") return body;
    if (typeof Blob !== "undefined" && body instanceof Blob) return body;
    if (typeof FormData !== "undefined" && body instanceof FormData) return body;
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return body;
    if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
      return body;
    }
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(body)) {
      return body as BodyInit;
    }
    return JSON.stringify(body);
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      throw new ApiError(res.status, res.statusText, await this.readBody(res));
    }

    if (res.status === 204) {
      return undefined as T;
    }

    const body = await this.readBody(res);
    return body as T;
  }

  private async readBody(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return undefined;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
