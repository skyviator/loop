import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { cleanupPendingMedia, MEDIA_CLEANUP_BATCH_SIZE } from "@/lib/media/cleanup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

function authorized(request: Request) {
  const expected = process.env.MEDIA_CLEANUP_WORKER_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || expected.length < 32 || !authorization?.startsWith("Bearer ")) return false;

  const presented = authorization.slice("Bearer ".length);
  const expectedDigest = createHash("sha256").update(expected).digest();
  const presentedDigest = createHash("sha256").update(presented).digest();
  return timingSafeEqual(expectedDigest, presentedDigest);
}

function response(body: { ok: boolean }, status: number) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS });
}

export function GET() {
  return response({ ok: false }, 405);
}

export async function POST(request: Request) {
  if (!authorized(request)) return response({ ok: false }, 401);

  const url = new URL(request.url);
  if (url.search) return response({ ok: false }, 400);
  if (await request.text() !== "{}") return response({ ok: false }, 400);

  try {
    await cleanupPendingMedia(MEDIA_CLEANUP_BATCH_SIZE);
    return response({ ok: true }, 200);
  } catch {
    return response({ ok: false }, 503);
  }
}
