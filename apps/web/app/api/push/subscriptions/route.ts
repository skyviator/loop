import { requiredText } from "@loop/validation";

import { getViewer } from "@/lib/auth";
import { hasSameOrigin } from "@/lib/request-security";
import { createClient } from "@/lib/supabase/server";

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return errorResponse("Request origin is not allowed.", 403);
  const viewer = await getViewer();
  if (!viewer?.membershipId || viewer.role === "super_admin") return errorResponse("An active school membership is required.", 403);
  try {
    const input = await request.json() as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    const endpoint = requiredText(input.endpoint, "Push endpoint", 2048);
    const p256dh = requiredText(input.keys?.p256dh, "Push key", 512);
    const auth = requiredText(input.keys?.auth, "Push authentication key", 256);
    const { error } = await (await createClient()).rpc("register_push_subscription", {
      subscription_endpoint: endpoint,
      subscription_p256dh: p256dh,
      subscription_auth: auth,
    });
    if (error) return errorResponse("This device could not be registered.", 409);
    return Response.json({ registered: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("Push subscription is invalid.", 400);
  }
}

export async function DELETE(request: Request) {
  if (!hasSameOrigin(request)) return errorResponse("Request origin is not allowed.", 403);
  const viewer = await getViewer();
  if (!viewer?.membershipId || viewer.role === "super_admin") return errorResponse("An active school membership is required.", 403);
  try {
    const input = await request.json() as { endpoint?: unknown };
    const endpoint = requiredText(input.endpoint, "Push endpoint", 2048);
    const { error } = await (await createClient()).rpc("deactivate_push_subscription", { subscription_endpoint: endpoint });
    if (error) return errorResponse("This device could not be deactivated.", 409);
    return Response.json({ deactivated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("Push subscription is invalid.", 400);
  }
}
