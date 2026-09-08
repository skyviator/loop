import { getViewer } from "@/lib/auth";
import { signedPhotoGetUrl } from "@/lib/r2";
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
