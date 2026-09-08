import { getViewer } from "@/lib/auth";
import { hasSameOrigin } from "@/lib/request-security";
import { schedulePushDispatch } from "@/lib/push/schedule";
import { deletePhotoObject, headPhotoObject } from "@/lib/r2";
import { createServerAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, context: { params: Promise<{ reservationId: string }> }) {
  if (!hasSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const viewer = await getViewer();
  if (!viewer || !viewer.schoolId) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (viewer.role !== "teacher" && viewer.role !== "school_admin") return Response.json({ error: "Photo upload is not allowed." }, { status: 403 });
  const { reservationId } = await context.params;
  const userClient = await createClient();
  const owned = await userClient.from("media_upload_reservations").select("id, status, expires_at").eq("id", reservationId).eq("uploader_user_id", viewer.userId).maybeSingle();
  if (!owned.data || owned.data.status !== "reserved" || new Date(owned.data.expires_at) <= new Date()) {
    return Response.json({ error: "The upload reservation is unavailable." }, { status: 404 });
  }

  const admin = createServerAdminClient();
  const asset = await admin.from("media_assets").select("id").eq("reservation_id", reservationId).single();
  const variants = asset.data
    ? await admin.from("media_variants").select("kind, object_key, content_type, byte_size").eq("asset_id", asset.data.id)
    : { data: null, error: asset.error };
  if (variants.error || !variants.data || variants.data.length !== 3) {
    return Response.json({ error: "The upload reservation is incomplete." }, { status: 409 });
  }

  try {
    const actualManifest = await Promise.all(variants.data.map(async (variant) => {
      const head = await headPhotoObject(variant.object_key);
      if (head.ContentType !== variant.content_type || head.ContentLength !== variant.byte_size) throw new Error("Object metadata mismatch.");
      return { kind: variant.kind, object_key: variant.object_key, content_type: head.ContentType, byte_size: head.ContentLength };
    }));
    const finalized = await admin.rpc("finalize_photo_upload", { target_reservation_id: reservationId, actual_manifest: actualManifest });
    if (finalized.error) throw finalized.error;
    schedulePushDispatch();
    return Response.json({ assetId: finalized.data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await Promise.allSettled(variants.data.map((variant) => deletePhotoObject(variant.object_key)));
    await admin.rpc("fail_photo_upload", { target_reservation_id: reservationId });
    return Response.json({ error: "Uploaded photo verification failed. No photo was saved." }, { status: 422 });
  }
}
