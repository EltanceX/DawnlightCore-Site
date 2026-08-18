import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ServerEnv } from "@dawnlight/config";

export interface WorkerQuarantineStorage {
  get(objectKey: string): Promise<AsyncIterable<Uint8Array>>;
  delete(objectKey: string): Promise<void>;
  copyToPublished(
    sourceObjectKey: string,
    targetObjectKey: string,
    sha256: string,
  ): Promise<void>;
  headPublished(
    objectKey: string,
  ): Promise<{ size: number; etag: string | null; sha256: string | null }>;
  check(): Promise<void>;
}

export function createWorkerQuarantineStorage(
  env: ServerEnv,
): WorkerQuarantineStorage {
  const client = new S3Client({
    endpoint: env.OBJECT_STORAGE_ENDPOINT,
    region: env.OBJECT_STORAGE_REGION,
    credentials: {
      accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY,
      secretAccessKey: env.OBJECT_STORAGE_SECRET_KEY,
    },
    forcePathStyle: true,
  });
  const bucket = env.OBJECT_STORAGE_BUCKET_QUARANTINE;
  const publishedBucket = env.OBJECT_STORAGE_BUCKET_PUBLISHED;
  return {
    async get(objectKey) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
      if (!result.Body)
        throw new Error("object storage returned an empty body");
      return result.Body as AsyncIterable<Uint8Array>;
    },
    async delete(objectKey) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
    },
    async copyToPublished(sourceObjectKey, targetObjectKey, sha256) {
      const copySource = `${bucket}/${sourceObjectKey
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      await client.send(
        new CopyObjectCommand({
          Bucket: publishedBucket,
          Key: targetObjectKey,
          CopySource: copySource,
          MetadataDirective: "REPLACE",
          Metadata: { sha256 },
          ContentType: "application/zip",
        }),
      );
    },
    async headPublished(objectKey) {
      const result = await client.send(
        new HeadObjectCommand({ Bucket: publishedBucket, Key: objectKey }),
      );
      if (result.ContentLength === undefined) {
        throw new Error(
          "published object storage did not return Content-Length",
        );
      }
      return {
        size: result.ContentLength,
        etag: result.ETag?.replace(/^\"|\"$/g, "") ?? null,
        sha256: result.Metadata?.sha256 ?? null,
      };
    },
    async check() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },
  };
}
