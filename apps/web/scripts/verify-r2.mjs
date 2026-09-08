import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const names = ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_REGION", "R2_PRESIGN_TTL_SECONDS"];
for (const name of names) {
  if (!process.env[name]?.trim()) throw new Error(`Missing ${name}.`);
}

const endpoint = process.env.R2_ENDPOINT.trim();
const parsedEndpoint = new URL(endpoint);
if (
  parsedEndpoint.protocol !== "https:" ||
  !parsedEndpoint.hostname.endsWith(".r2.cloudflarestorage.com") ||
  parsedEndpoint.pathname !== "/" ||
  parsedEndpoint.search ||
  parsedEndpoint.hash ||
  parsedEndpoint.username ||
  parsedEndpoint.password ||
  parsedEndpoint.port
) {
  throw new Error("R2_ENDPOINT is not a valid Cloudflare R2 S3 endpoint.");
}
const bucket = process.env.R2_BUCKET_NAME;
const ttl = Math.min(900, Math.max(30, Number(process.env.R2_PRESIGN_TTL_SECONDS) || 300));
const client = new S3Client({
  endpoint: parsedEndpoint.origin,
  region: process.env.R2_REGION,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const key = `verification/${randomUUID()}.jpg`;
const body = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

let created = false;
try {
  const putUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: "image/jpeg" }), { expiresIn: ttl });
  const expiry = Number(new URL(putUrl).searchParams.get("X-Amz-Expires"));
  if (expiry !== ttl || expiry > 900) throw new Error("Presigned URL expiry is outside the configured short limit.");

  const preflight = await fetch(putUrl, {
    method: "OPTIONS",
    headers: { Origin: "http://127.0.0.1:3000", "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" },
  });
  const allowedOrigin = preflight.headers.get("access-control-allow-origin");
  if (!preflight.ok || (allowedOrigin !== "http://127.0.0.1:3000" && allowedOrigin !== "*")) throw new Error("R2 browser-upload CORS is not enabled for http://127.0.0.1:3000.");

  const upload = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg", Origin: "http://127.0.0.1:3000" }, body });
  if (!upload.ok) throw new Error("Presigned PUT failed.");
  created = true;
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  if (head.ContentLength !== body.byteLength || head.ContentType !== "image/jpeg") throw new Error("HEAD verification did not match the uploaded object.");

  const getUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttl });
  const download = await fetch(getUrl);
  if (!download.ok || (await download.arrayBuffer()).byteLength !== body.byteLength) throw new Error("Presigned GET failed.");

  const unsigned = await fetch(`${parsedEndpoint.origin}/${encodeURIComponent(bucket)}/${key}`);
  if (unsigned.ok) throw new Error("The verification object was anonymously readable.");
  console.log("R2 verification passed: PUT, HEAD, short signed GET, CORS, and anonymous denial.");
} finally {
  if (created) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    throw new Error("R2 verification cleanup failed.");
  } catch (error) {
    if (error?.$metadata?.httpStatusCode !== 404) throw error;
  }
}
