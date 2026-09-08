import { getViewer } from "@/lib/auth";
import { hasSameOrigin } from "@/lib/request-security";
import { signedPhotoPutUrl } from "@/lib/r2";
import { createClient } from "@/lib/supabase/server";

type VariantInput = {
  kind: "original" | "display" | "thumbnail";
  contentType: "image/jpeg";
  byteSize: number;
  width: number;
  height: number;
};

type ReservationResult = {
  reservation_id: string;
  asset_id: string;
  expires_at: string;
  variants: Array<{ kind: VariantInput["kind"]; object_key: string; content_type: "image/jpeg" }>;
};

function isVariant(value: unknown): value is VariantInput {
  if (!value || typeof value !== "object") return false;
  const variant = value as Partial<VariantInput>;
  return ["original", "display", "thumbnail"].includes(variant.kind ?? "")
    && variant.contentType === "image/jpeg"
    && Number.isInteger(variant.byteSize) && (variant.byteSize ?? 0) > 0
    && Number.isInteger(variant.width) && (variant.width ?? 0) > 0
    && Number.isInteger(variant.height) && (variant.height ?? 0) > 0;
}
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const viewer = await getViewer();
  if (!viewer || !viewer.schoolId || !viewer.membershipId) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (viewer.role !== "teacher" && viewer.role !== "school_admin") return Response.json({ error: "Photo upload is not allowed." }, { status: 403 });

  let input: { classroomId?: unknown; childIds?: unknown; caption?: unknown; capturedAt?: unknown; variants?: unknown };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Photo details are invalid." }, { status: 400 });
  }
  if (typeof input.classroomId !== "string" || !Array.isArray(input.childIds)
    || input.childIds.length < 1 || input.childIds.length > 50
    || input.childIds.some((id) => typeof id !== "string")
    || !Array.isArray(input.variants) || input.variants.length !== 3 || !input.variants.every(isVariant)
    || (input.caption != null && typeof input.caption !== "string")
    || (input.capturedAt != null && typeof input.capturedAt !== "string")) {
    return Response.json({ error: "Photo details are invalid." }, { status: 400 });
  }

  const manifest = input.variants.map((variant) => ({
    kind: variant.kind,
    content_type: variant.contentType,
    byte_size: variant.byteSize,
    width: variant.width,
    height: variant.height,
  }));
  const { data, error } = await (await createClient()).rpc("reserve_photo_upload", {
    target_classroom_id: input.classroomId,
    target_child_ids: input.childIds as string[],
    variant_manifest: manifest,
    photo_caption: typeof input.caption === "string" ? input.caption : undefined,
    photo_captured_at: typeof input.capturedAt === "string" ? input.capturedAt : undefined,
  });
  if (error || !data) return Response.json({ error: "Photo upload is not available for this selection." }, { status: 403 });

  const reservation = data as unknown as ReservationResult;
  const uploads = await Promise.all(reservation.variants.map(async (variant) => ({
    kind: variant.kind,
    objectKey: variant.object_key,
    contentType: variant.content_type,
    url: await signedPhotoPutUrl(variant.object_key, variant.content_type),
  })));
  return Response.json({ reservationId: reservation.reservation_id, assetId: reservation.asset_id, expiresAt: reservation.expires_at, uploads }, {
    headers: { "Cache-Control": "no-store" },
  });
}
