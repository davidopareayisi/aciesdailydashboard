// Server-side storage transport, also used by the private maintenance CLI and offline tests.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

export class R2StorageError extends Error {
  constructor(code) { super("Private file storage is unavailable."); this.code = code; }
}
export function mediaStorageMode(env = process.env) {
  const mode = env.ACIES_MEDIA_STORAGE || "database";
  if (!["database", "r2"].includes(mode)) throw new R2StorageError("MEDIA_STORAGE_CONFIGURATION_INVALID");
  return mode;
}
export function r2Configuration(env = process.env) {
  const accountId = env.R2_ACCOUNT_ID?.trim(), bucket = env.R2_BUCKET_NAME?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim(), secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) throw new R2StorageError("R2_CONFIGURATION_MISSING");
  const endpoint = env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`;
  if (!/^[a-f0-9]{32}$/.test(accountId) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || endpoint !== `https://${accountId}.r2.cloudflarestorage.com`) throw new R2StorageError("R2_CONFIGURATION_INVALID");
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}
export function createR2Storage(config, client = new S3Client({
  region: "auto", endpoint: config.endpoint, forcePathStyle: true, maxAttempts: 2,
  credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  // Avoid optional AWS-only trailing checksum behavior on this S3-compatible service.
  requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
})) {
  async function send(command) {
    try { return await client.send(command, { abortSignal: AbortSignal.timeout(15000) }); }
    catch { throw new R2StorageError("R2_REQUEST_FAILED"); }
  }
  function object(key, bucket) {
    if (!/^(portal|_acies-checks)\/[a-zA-Z0-9-]+\.(webp|pdf|mp4|webm|txt)$/.test(key) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new R2StorageError("R2_OBJECT_INVALID");
    return { Bucket: bucket, Key: key };
  }
  return {
    bucket: config.bucket,
    async check() { await send(new HeadBucketCommand({ Bucket: config.bucket })); },
    async put(key, bytes, mime) {
      await send(new PutObjectCommand({ ...object(key, config.bucket), Body: bytes, ContentType: mime, CacheControl: "private, no-store" }));
    },
    async get(key, bucket = config.bucket) {
      const result = await send(new GetObjectCommand(object(key, bucket)));
      try {
        if (!result.Body) throw new Error();
        return await result.Body.transformToByteArray();
      } catch { throw new R2StorageError("R2_READ_FAILED"); }
    },
    async remove(key) { await send(new DeleteObjectCommand(object(key, config.bucket))); },
  };
}
let storage;
export function r2Storage() { return storage ??= createR2Storage(r2Configuration()); }
