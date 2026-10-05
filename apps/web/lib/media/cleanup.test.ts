import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deletePhotoObject: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/r2", () => ({ deletePhotoObject: mocks.deletePhotoObject }));
vi.mock("@/lib/supabase/admin", () => ({ createServerAdminClient: () => ({ rpc: mocks.rpc }) }));

import { cleanupPendingMedia } from "./cleanup";

const claim = {
  cleanup_id: "cleanup-id",
  asset_id: "asset-id",
  cleanup_scope: "asset",
  object_keys: ["originals/school/asset/one.jpg", "display/school/asset/two.jpg", "thumbs/school/asset/three.jpg"],
};

describe("media cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deletePhotoObject.mockResolvedValue({});
  });

  it("deletes every claimed variant and completes the job once", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [claim], error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(cleanupPendingMedia()).resolves.toEqual({ claimed: 1, completed: 1, retries: 0 });
    expect(mocks.deletePhotoObject).toHaveBeenCalledTimes(3);
    expect(mocks.rpc).toHaveBeenLastCalledWith("complete_media_cleanup_job", {
      target_cleanup_id: claim.cleanup_id,
      outcome: "success",
      failure_class: undefined,
    });
  });

  it("records a retry without leaking an object key when provider cleanup fails", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [claim], error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.deletePhotoObject.mockRejectedValueOnce(new Error("private provider response"));

    await expect(cleanupPendingMedia()).resolves.toEqual({ claimed: 1, completed: 0, retries: 1 });
    expect(mocks.rpc).toHaveBeenLastCalledWith("complete_media_cleanup_job", {
      target_cleanup_id: claim.cleanup_id,
      outcome: "temporary_failure",
      failure_class: "provider",
    });
  });

  it("treats an already-missing object as an idempotent successful delete", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ ...claim, object_keys: [] }], error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(cleanupPendingMedia()).resolves.toEqual({ claimed: 1, completed: 1, retries: 0 });
    expect(mocks.deletePhotoObject).not.toHaveBeenCalled();
  });

  it("surfaces claim and completion failures for worker retry", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private claim detail" } });
    await expect(cleanupPendingMedia()).rejects.toThrow("Media cleanup claim failed");

    mocks.rpc
      .mockResolvedValueOnce({ data: [claim], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "private completion detail" } });
    await expect(cleanupPendingMedia()).rejects.toThrow("Media cleanup completion failed");
  });
});
