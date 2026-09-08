import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_TTL_SECONDS = 300;
const MIN_TTL_SECONDS = 30;
const MAX_TTL_SECONDS = 900;

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Server media configuration is incomplete: ${name}.`);
  return value;
}

function validatedR2Endpoint(value: string) {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname.endsWith(".r2.cloudflarestorage.com") ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw new Error("Server media configuration has an invalid R2 endpoint.");
  }
  return parsed.origin;
}

function configuration() {
  const ttlValue = Number(process.env.R2_PRESIGN_TTL_SECONDS ?? DEFAULT_TTL_SECONDS);
  return {
    endpoint: validatedR2Endpoint(requiredEnvironment("R2_ENDPOINT")),
    bucket: requiredEnvironment("R2_BUCKET_NAME"),
    region: requiredEnvironment("R2_REGION"),
    accessKeyId: requiredEnvironment("R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironment("R2_SECRET_ACCESS_KEY"),
    ttlSeconds: Number.isInteger(ttlValue)
      ? Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, ttlValue))
      : DEFAULT_TTL_SECONDS,
  };
}

let client: S3Client | undefined;

export function r2Client() {
  if (client) return client;
  const config = configuration();
  client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return client;
}

export async function signedPhotoPutUrl(objectKey: string, contentType: "image/jpeg") {
  const config = configuration();
  return getSignedUrl(
    r2Client(),
    new PutObjectCommand({ Bucket: config.bucket, Key: objectKey, ContentType: contentType }),
    { expiresIn: config.ttlSeconds },
  );
}

export async function signedPhotoGetUrl(objectKey: string) {
  const config = configuration();
  return getSignedUrl(
    r2Client(),
    new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    { expiresIn: config.ttlSeconds },
  );
}

export async function headPhotoObject(objectKey: string) {
  const config = configuration();
  return r2Client().send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
}

export async function deletePhotoObject(objectKey: string) {
  const config = configuration();
  return r2Client().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
}
