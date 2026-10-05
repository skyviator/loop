import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  hasSameOrigin: vi.fn(),
  rpc: vi.fn(),
  scheduleMediaCleanup: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getViewer: mocks.getViewer }));
vi.mock("@/lib/media/schedule", () => ({ scheduleMediaCleanup: mocks.scheduleMediaCleanup }));
vi.mock("@/lib/request-security", () => ({ hasSameOrigin: mocks.hasSameOrigin }));
vi.mock("@/lib/r2", () => ({ signedPhotoGetUrl: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));

import { DELETE } from "./route";

const context = { params: Promise.resolve({ assetId: "a0000000-0000-0000-0000-000000000102" }) };

function request() {
  return new Request("https://loop.test/api/media/a0000000-0000-0000-0000-000000000102/url", {
    method: "DELETE",
    headers: { origin: "https://loop.test" },
  });
}

describe("photo removal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSameOrigin.mockReturnValue(true);
  });

  it("rejects cross-origin, anonymous, and Guardian removal before database mutation", async () => {
    mocks.hasSameOrigin.mockReturnValueOnce(false);
    expect((await DELETE(request(), context)).status).toBe(403);

    mocks.getViewer.mockResolvedValueOnce(null);
    expect((await DELETE(request(), context)).status).toBe(401);

    mocks.getViewer.mockResolvedValueOnce({ role: "guardian" });
    expect((await DELETE(request(), context)).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["teacher", "school_admin"])("lets an authorized %s request database-enforced withdrawal", async (role) => {
    mocks.getViewer.mockResolvedValueOnce({ role });
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });

    const result = await DELETE(request(), context);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ removed: true });
    expect(mocks.rpc).toHaveBeenCalledWith("withdraw_media_asset", { target_asset_id: "a0000000-0000-0000-0000-000000000102" });
    expect(mocks.scheduleMediaCleanup).toHaveBeenCalledOnce();
  });

  it("returns a generic not-found response for cross-tenant or unauthorized IDs", async () => {
    mocks.getViewer.mockResolvedValueOnce({ role: "teacher" });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private authorization detail" } });

    const result = await DELETE(request(), context);
    expect(result.status).toBe(404);
    expect(await result.json()).toEqual({ error: "Photo removal is not available." });
    expect(mocks.scheduleMediaCleanup).not.toHaveBeenCalled();
  });
});
