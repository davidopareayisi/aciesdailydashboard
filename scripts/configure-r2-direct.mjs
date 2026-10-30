import { S3Client, GetBucketCorsCommand, PutBucketCorsCommand, GetBucketLifecycleConfigurationCommand, PutBucketLifecycleConfigurationCommand } from "@aws-sdk/client-s3";
import { r2Configuration } from "../app/lib/r2.mjs";
process.loadEnvFile(".env.local");
const config = r2Configuration();
const client = new S3Client({ region: "auto", endpoint: config.endpoint, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
const Bucket = config.bucket;
try {
  let CORSRules = [];
  try { CORSRules = (await client.send(new GetBucketCorsCommand({ Bucket }))).CORSRules || []; } catch (error) { if (!["NoSuchCORSConfiguration", "NoSuchCORS"].includes(error.name)) throw error; }
  const rule = { ID: "acies-direct-uploads", AllowedOrigins: ["https://apply.acies.store", "http://127.0.0.1:3107"], AllowedMethods: ["PUT", "GET", "HEAD"], AllowedHeaders: ["content-type", "x-amz-checksum-sha256", "range"], ExposeHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"], MaxAgeSeconds: 600 };
  await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: [...CORSRules.filter(item => item.ID !== rule.ID), rule] } }));
  let Rules = [];
  try { Rules = (await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket }))).Rules || []; } catch (error) { if (error.name !== "NoSuchLifecycleConfiguration") throw error; }
  const cleanup = { ID: "acies-pending-expiry", Status: "Enabled", Filter: { Prefix: "pending/" }, Expiration: { Days: 1 } };
  await client.send(new PutBucketLifecycleConfigurationCommand({ Bucket, LifecycleConfiguration: { Rules: [...Rules.filter(item => item.ID !== cleanup.ID), cleanup] } }));
  console.log(JSON.stringify({ corsConfigured: true, pendingExpiryDays: 1, existingRulesPreserved: true }));
} catch (error) { console.error(JSON.stringify({ configured: false, code: error.name })); process.exitCode = 1; }
