import { getViewer } from "@/lib/auth";
import { scheduleMediaCleanup } from "@/lib/media/schedule";
import { signedPhotoGetUrl } from "@/lib/r2";
import { hasSameOrigin } from "@/lib/request-security";
import { createClient } from "@/lib/supabase/server";

const allowedVariants = new Set(["original", "display", "thumbnail"]);

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { assetId } = await context.params;
  const variant = new URL(request.url).searchParams.get("variant") ?? "display";
  if (!allowedVariants.has(variant)) return Response.json({ error: "Photo size is invalid." }, { status: 400 });
  const result = await (await createClient()).from("media_variants").select("object_key").eq("asset_id", assetId).eq("kind", variant as "original" | "display" | "thumbnail").eq("status", "ready").maybeSingle();
  if (!result.data) return Response.json({ error: "Photo is unavailable." }, { status: 404 });
  return Response.json({ url: await signedPhotoGetUrl(result.data.object_key) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: Request, context: { params: Promise<{ assetId: string }> }) {
  if (!hasSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (viewer.role !== "teacher" && viewer.role !== "school_admin") {
    return Response.json({ error: "Photo removal is not allowed." }, { status: 403 });
  }

  const { assetId } = await context.params;
  const result = await (await createClient()).rpc("withdraw_media_asset", { target_asset_id: assetId });
  if (result.error) return Response.json({ error: "Photo removal is not available." }, { status: 404 });

  scheduleMediaCleanup();
  return Response.json({ removed: true }, { headers: { "Cache-Control": "no-store" } });
}
