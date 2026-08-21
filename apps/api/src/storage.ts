import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ServerEnv } from "@dawnlight/config";
import { AuthoringError } from "@dawnlight/database";

export type QuarantineObjectHead = {
  size: number;
  contentType: string | null;
  etag: string | null;
};

export interface QuarantineStorage {
  createUploadUrl(
    objectKey: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string>;
  head(objectKey: string): Promise<QuarantineObjectHead>;
  check(): Promise<void>;
}

export interface PublishedArtifactStorage {
  getPublished(objectKey: string): Promise<AsyncIterable<Uint8Array>>;
}

export type DawnlightObjectStorage = QuarantineStorage &
  PublishedArtifactStorage;

export function createQuarantineStorage(
  env: ServerEnv,
): DawnlightObjectStorage {
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
    async createUploadUrl(objectKey, contentType, expiresInSeconds) {
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          ContentType: contentType,
        }),
        { expiresIn: expiresInSeconds },
      );
    },
    async head(objectKey) {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: objectKey }),
        );
        if (result.ContentLength === undefined) {
          throw new Error("object storage did not return Content-Length");
        }
        return {
          size: result.ContentLength,
          contentType: result.ContentType ?? null,
          etag: result.ETag?.replace(/^\"|\"$/g, "") ?? null,
        };
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } })
          .$metadata?.httpStatusCode;
        if (status === 404) {
          throw new AuthoringError(
            "UploadObjectMissing",
            "隔离区中尚未找到上传对象。",
            409,
          );
        }
        throw error;
      }
    },
    async check() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },
    async getPublished(objectKey) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: publishedBucket, Key: objectKey }),
      );
      if (!result.Body) {
        throw new Error("published object storage returned an empty body");
      }
      return result.Body as AsyncIterable<Uint8Array>;
    },
  };
}
