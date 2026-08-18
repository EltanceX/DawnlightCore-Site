import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ServerEnv } from "@dawnlight/config";

export interface WorkerQuarantineStorage {
  get(objectKey: string): Promise<AsyncIterable<Uint8Array>>;
  delete(objectKey: string): Promise<void>;
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
    async check() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },
  };
}
