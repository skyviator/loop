import "server-only";

import { deletePhotoObject } from "@/lib/r2";
import { createServerAdminClient } from "@/lib/supabase/admin";

export const MEDIA_CLEANUP_BATCH_SIZE = 10;

type CleanupClaim = {
  cleanup_id: string;
  asset_id: string;
  cleanup_scope: "asset" | "original";
  object_keys: string[];
};

export async function cleanupPendingMedia(batchSize = MEDIA_CLEANUP_BATCH_SIZE) {
  const admin = createServerAdminClient();
  const claimed = await admin.rpc("claim_media_cleanup_jobs", { batch_size: batchSize });
  if (claimed.error) throw new Error("Media cleanup claim failed.");

  const jobs = (claimed.data as CleanupClaim[] | null) ?? [];
  const results = await Promise.all(jobs.map(async (job) => {
    const deletions = await Promise.allSettled(job.object_keys.map((objectKey) => deletePhotoObject(objectKey)));
    const failed = deletions.some((result) => result.status === "rejected");
    const completed = await admin.rpc("complete_media_cleanup_job", {
      target_cleanup_id: job.cleanup_id,
      outcome: failed ? "temporary_failure" : "success",
      failure_class: failed ? "provider" : undefined,
    });
    if (completed.error) throw new Error("Media cleanup completion failed.");
    return failed ? "retry" : "completed";
  }));

  return {
    claimed: results.length,
    completed: results.filter((result) => result === "completed").length,
    retries: results.filter((result) => result === "retry").length,
  };
}
