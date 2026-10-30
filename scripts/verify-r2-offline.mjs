import assert from "node:assert/strict";
import { test } from "node:test";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { createR2Storage, mediaStorageMode, r2Configuration } from "../app/lib/r2.mjs";

const env = {
  R2_ACCOUNT_ID: "a".repeat(32), R2_BUCKET_NAME: "dailyacies",
  R2_ACCESS_KEY_ID: "offline-access-key", R2_SECRET_ACCESS_KEY: "offline-secret-key",
};
test("R2 is opt-in and requires explicit bucket-scoped credentials and the account endpoint", () => {
  assert.equal(mediaStorageMode({}), "database");
  assert.equal(mediaStorageMode({ ACIES_MEDIA_STORAGE: "r2" }), "r2");
  assert.throws(() => mediaStorageMode({ ACIES_MEDIA_STORAGE: "unknown" }), { code: "MEDIA_STORAGE_CONFIGURATION_INVALID" });
  assert.throws(() => r2Configuration({}), { code: "R2_CONFIGURATION_MISSING" });
  assert.throws(() => r2Configuration({ ...env, R2_ENDPOINT: "https://example.invalid" }), { code: "R2_CONFIGURATION_INVALID" });
  assert.throws(() => r2Configuration({ ...env, R2_BUCKET_NAME: "not/a/bucket" }), { code: "R2_CONFIGURATION_INVALID" });
  assert.equal(r2Configuration(env).endpoint, `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
});
test("private uploads, reads, health checks and cleanup use the expected S3 commands", async () => {
  const calls = [], bytes = new Uint8Array([1, 2, 3]);
  const storage = createR2Storage(r2Configuration(env), { async send(command, options) {
    calls.push(command);
    assert.ok(options.abortSignal instanceof AbortSignal);
    return command instanceof GetObjectCommand ? { Body: { async *[Symbol.asyncIterator]() { yield bytes; } } } : {};
  } });
  await storage.check();
  await storage.put("portal/offline-test.webp", bytes, "image/webp");
  assert.deepEqual(await storage.get("portal/offline-test.webp"), bytes);
  await storage.get("portal/offline-test.webp", "previous-bucket");
  await storage.remove("portal/offline-test.webp");
  assert.ok(calls[0] instanceof HeadBucketCommand);
  assert.ok(calls[1] instanceof PutObjectCommand);
  assert.equal(calls[1].input.Bucket, "dailyacies");
  assert.equal(calls[1].input.CacheControl, "private, no-store");
  assert.equal(calls[1].input.ACL, undefined);
  assert.equal(calls[3].input.Bucket, "previous-bucket");
  assert.ok(calls[4] instanceof DeleteObjectCommand);
});
test("invalid object paths cannot trigger requests, and provider failures cannot disclose secrets", async () => {
  let calls = 0;
  const storage = createR2Storage(r2Configuration(env), { async send() { calls++; throw new Error("secret endpoint and credential details"); } });
  await assert.rejects(storage.get("../outside.webp"), { code: "R2_OBJECT_INVALID" });
  assert.equal(calls, 0);
  await assert.rejects(storage.check(), { message: "Private file storage is unavailable.", code: "R2_REQUEST_FAILED" });
  const missingBody = createR2Storage(r2Configuration(env), { async send() { return {}; } });
  await assert.rejects(missingBody.get("portal/offline-test.webp"), { code: "R2_READ_FAILED" });
});
test("direct upload signatures bind type, length and checksum; reads are bounded", async () => {
  const storage = createR2Storage(r2Configuration(env));
  const upload = new URL(await storage.signUpload("pending/offline-test.bin", "image/png", 100, "a".repeat(43) + "="));
  assert.equal(upload.searchParams.get("X-Amz-Expires"), "600");
  const headers = upload.searchParams.get("X-Amz-SignedHeaders").split(";");
  for (const name of ["content-length", "content-type", "x-amz-checksum-sha256"]) assert.ok(headers.includes(name));
  const download = new URL(await storage.signDownload("portal/offline-test.mp4", "dailyacies", "video/mp4", "private.mp4"));
  assert.equal(download.searchParams.get("X-Amz-Expires"), "900");
  const bounded = createR2Storage(r2Configuration(env), { async send() { return { Body: { async *[Symbol.asyncIterator]() { yield Buffer.alloc(10); } } }; } });
  await assert.rejects(bounded.get("pending/offline-test.bin", "dailyacies", 5), { code: "R2_READ_FAILED" });
});
