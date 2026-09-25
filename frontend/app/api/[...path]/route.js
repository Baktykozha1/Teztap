import { NextResponse } from "next/server";
import { backendUrl, SESSION_COOKIE } from "../../../lib/server-access";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function hasTrustedMutationOrigin(request, origin) {
  if (!origin) return false;
  if (origin === request.nextUrl.origin) return true;
  if (process.env.NODE_ENV === "production") return false;

  try {
    const candidate = new URL(origin);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
    return candidate.protocol === request.nextUrl.protocol &&
      candidate.port === request.nextUrl.port &&
      localHosts.has(candidate.hostname) &&
      localHosts.has(request.nextUrl.hostname);
  } catch {
    return false;
  }
}

async function handle(request, context) {
  const { path } = await context.params;
  if (path.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part))) return NextResponse.json({ error: "Invalid API path" }, { status: 400 });
  const endpoint = path.join("/");
  const read = request.method === "GET" || request.method === "HEAD";
  const origin = request.headers.get("origin");
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!read && ((origin && !hasTrustedMutationOrigin(request, origin)) ||
      request.headers.get("sec-fetch-site") === "cross-site" || (!origin && token))) {
    return NextResponse.json({ error: "Same-origin request required", code: "INVALID_ORIGIN" }, { status: 403 });
  }
  const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 604800 };
  if (endpoint === "auth/logout" && request.method === "POST") {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  }
  const migration = endpoint === "auth/session" && request.method === "POST";
  const headers = new Headers();
  const authorization = token ? `Bearer ${token}` : request.headers.get("authorization");
  if (authorization) headers.set("Authorization", authorization);
  if (request.headers.has("content-type")) headers.set("Content-Type", request.headers.get("content-type"));
  try {
    const upstream = await fetch(`${backendUrl()}/api/${migration ? "me" : endpoint}${request.nextUrl.search}`, {
      method: migration ? "GET" : request.method,
      headers,
      body: read || migration ? undefined : await request.arrayBuffer(),
      cache: "no-store", redirect: "manual", signal: request.signal
    });
    const auth = request.method === "POST" && ["auth/login", "auth/register"].includes(endpoint);
    if ((auth || migration) && upstream.ok) {
      const data = await upstream.json();
      const sessionToken = migration ? authorization?.replace(/^Bearer /, "") : data.token;
      if (!sessionToken) return NextResponse.json({ error: "Invalid session" }, { status: 502 });
      const response = NextResponse.json({ user: data.user }, { status: upstream.status });
      response.cookies.set(SESSION_COOKIE, sessionToken, cookieOptions);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(upstream.headers.has("retry-after") ? { "Retry-After": upstream.headers.get("retry-after") } : {})
      }
    });
  } catch {
    return NextResponse.json({ error: "API is temporarily unavailable", code: "API_UNAVAILABLE" }, { status: 503 });
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE, handle as PUT, handle as HEAD };
