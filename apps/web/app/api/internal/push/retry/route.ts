import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { dispatchPendingPush, PUSH_DELIVERY_BATCH_SIZE } from "@/lib/push/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

function authorized(request: Request) {
  const expected = process.env.PUSH_WORKER_SECRET;
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

export async function POST(request: Request) {
  if (!authorized(request)) return response({ ok: false }, 401);

  const url = new URL(request.url);
  if (url.search) return response({ ok: false }, 400);

  const text = await request.text();
  if (text !== "{}") return response({ ok: false }, 400);

  try {
    await dispatchPendingPush(PUSH_DELIVERY_BATCH_SIZE);
    return response({ ok: true }, 200);
  } catch {
    return response({ ok: false }, 503);
  }
}
