import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import type { Payload } from "payload";

import { log } from "../log";

/**
 * Domain fonts are served from the asset host to every client domain and to
 * the editor canvas, so browsers need `Access-Control-Allow-Origin`
 * (015-penpot-site-import, research P8). One bucket CORS rule — GET/HEAD
 * from any origin — set at CMS start. Idempotent; verified on Garage v2.3:
 * its website endpoint (what Caddy proxies `assets.` to) applies it.
 * Never blocks boot: a failure is logged.
 */
export const FONT_CORS_RULE = {
  AllowedMethods: ["GET", "HEAD"],
  AllowedOrigins: ["*"],
  AllowedHeaders: ["*"],
  MaxAgeSeconds: 86_400,
};

export async function ensureBucketCors(payload: Payload, client?: S3Client): Promise<void> {
  const endpoint = process.env.S3_ENDPOINT;
  const Bucket = process.env.S3_BUCKET ?? "trefle-assets";
  if (!endpoint && !client) return;
  const s3 =
    client ??
    new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? "garage",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  try {
    const current = await s3
      .send(new GetBucketCorsCommand({ Bucket }))
      .catch(() => ({ CORSRules: [] }));
    const has = (current.CORSRules ?? []).some(
      (r) =>
        r.AllowedOrigins?.includes("*") &&
        ["GET", "HEAD"].every((m) => r.AllowedMethods?.includes(m)),
    );
    if (has) return;
    await s3.send(
      new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: [FONT_CORS_RULE] } }),
    );
    log.info("bucket_cors_set", { bucket: Bucket });
  } catch (e) {
    log.error("bucket_cors_failed", {
      bucket: Bucket,
      errorName: e instanceof Error ? e.name : "Error",
    });
    payload.logger?.warn?.(
      "Could not set the asset bucket CORS rule; domain fonts may not load cross-origin.",
    );
  }
}
