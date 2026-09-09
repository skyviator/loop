import assert from "node:assert/strict";
import test from "node:test";

import {
  assertStagingTarget,
  STAGING_R2_BUCKET,
  STAGING_SITE_URL,
  STAGING_SUPABASE_URL,
} from "./staging-target.mjs";

const valid = {
  LOOP_ENV: "staging",
  NEXT_PUBLIC_SUPABASE_URL: STAGING_SUPABASE_URL,
  NEXT_PUBLIC_SITE_URL: STAGING_SITE_URL,
  R2_BUCKET_NAME: STAGING_R2_BUCKET,
  SUPABASE_SECRET_KEY: "sb_secret_test_placeholder",
};

test("accepts only the approved staging target", () => {
  assert.deepEqual(assertStagingTarget(valid), {
    projectRef: "ouotuegvwcgtrcgzdqiu",
    supabaseUrl: STAGING_SUPABASE_URL,
    siteUrl: STAGING_SITE_URL,
    r2Bucket: STAGING_R2_BUCKET,
  });
});

for (const [name, value] of [
  ["LOOP_ENV", "production"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://unknown.supabase.co"],
  ["NEXT_PUBLIC_SITE_URL", "https://example.invalid"],
  ["R2_BUCKET_NAME", "loop-media-dev"],
  ["SUPABASE_SECRET_KEY", "legacy-or-missing"],
]) {
  test(`fails closed when ${name} is missing or mismatched`, () => {
    assert.throws(() => assertStagingTarget({ ...valid, [name]: value }), /Staging seed refused/);
    assert.throws(() => assertStagingTarget({ ...valid, [name]: undefined }), /Staging seed refused/);
  });
}
