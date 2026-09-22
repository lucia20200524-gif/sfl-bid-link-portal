/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { scheduledCollection } from "../lib/discovery-collector";
import { prepareGuestSession } from "../lib/guest-session";
import { prepareSavedSearch } from "../lib/discovery-search-index";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async scheduled(_event: unknown, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduledCollection());
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const session = url.pathname === "/" || url.pathname.startsWith("/api/")
      ? prepareGuestSession(request) : { request, cookie: null };
    const response = await handler.fetch(session.request, env, ctx);
    // Upgrade saved search metadata after an authorized successful search,
    // without extending its response or fetching external websites.
    if(url.pathname==="/api/discovery"&&request.method==="GET"&&response.ok){
      ctx.waitUntil(prepareSavedSearch().catch(error=>console.error("saved-search preparation failed",error instanceof Error?error.message:String(error))));
    }
    // Keep browser-specific review history and optional account details uncached.
    if (url.pathname === "/" || url.pathname.startsWith("/api/")) {
      const protectedHeaders = new Headers(response.headers);
      if (session.cookie) protectedHeaders.append("Set-Cookie", session.cookie);
      protectedHeaders.set("Cache-Control", "private, no-store, max-age=0");
      protectedHeaders.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      const vary = new Set((protectedHeaders.get("Vary") || "").split(",").map(value => value.trim()).filter(Boolean));
      for (const value of ["Cookie", "oai-authenticated-user-id", "oai-authenticated-user-email"]) vary.add(value);
      protectedHeaders.set("Vary", [...vary].join(", "));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: protectedHeaders });
    }
    return response;
  },
};

export default worker;
