export const STAGING_PROJECT_REF = "ouotuegvwcgtrcgzdqiu";
export const STAGING_SUPABASE_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
export const STAGING_SITE_URL = "https://loop-staging-pi.vercel.app";
export const STAGING_R2_BUCKET = "loop-media-staging";

export function assertStagingTarget(env) {
  const failures = [];

  if (env.LOOP_ENV !== "staging") failures.push("LOOP_ENV must be exactly staging");
  if (env.NEXT_PUBLIC_SUPABASE_URL !== STAGING_SUPABASE_URL) failures.push("Supabase URL does not match the approved Loop Staging project");
  if (env.NEXT_PUBLIC_SITE_URL !== STAGING_SITE_URL) failures.push("site URL does not match the approved staging origin");
  if (env.R2_BUCKET_NAME !== STAGING_R2_BUCKET) failures.push("R2 bucket does not match loop-media-staging");
  if (!env.SUPABASE_SECRET_KEY?.startsWith("sb_secret_")) failures.push("a current Supabase staging secret key is required");

  if (failures.length > 0) {
    throw new Error(`Staging seed refused: ${failures.join("; ")}.`);
  }

  return {
    projectRef: STAGING_PROJECT_REF,
    supabaseUrl: STAGING_SUPABASE_URL,
    siteUrl: STAGING_SITE_URL,
    r2Bucket: STAGING_R2_BUCKET,
  };
}
