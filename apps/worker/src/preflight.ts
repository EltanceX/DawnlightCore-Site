import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import type {
  PreflightDataService,
  PreflightDiagnostic,
  PreflightManifestEntry,
  PreflightResult,
  WorkerUpload,
} from "@dawnlight/database";
import type { ServerEnv } from "@dawnlight/config";
import type { WorkerQuarantineStorage } from "./storage.js";

const allowedExtensions = new Set([
  ".json",
  ".glsl",
  ".vsh",
  ".fsh",
  ".psh",
  ".csh",
  ".comp",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".txt",
  ".properties",
  ".cfg",
  ".mcmeta",
  ".lang",
  ".md",
  ".rgba16f",
]);

export class PreflightRejected extends Error {
  constructor(
    message: string,
    public readonly result: PreflightResult,
  ) {
    super(message);
    this.name = "PreflightRejected";
  }
}

function diagnostic(
  code: string,
  path: string | null,
  message: string,
  severity: "error" | "warning" = "error",
): PreflightDiagnostic {
  return { code, path, message, severity };
}

export function normalizeEntryPath(raw: string): string {
  if (
    !raw ||
    raw.includes("\0") ||
    /^[\\/]/.test(raw) ||
    /^[A-Za-z]:/.test(raw)
  ) {
    throw new Error("path is absolute or contains NUL");
  }
  const segments = raw.replaceAll("\\", "/").split("/");
  const clean: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") throw new Error("path traversal is not allowed");
    clean.push(segment);
  }
  const normalized = clean.join("/");
  if (!normalized || normalized.endsWith("/")) {
    throw new Error("directory entries are not package files");
  }
  return normalized;
}

export function isLinkOrDevice(entry: Entry): boolean {
  const platform = entry.versionMadeBy >> 8;
  if (platform !== 3) return false;
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  const type = mode & 0xf000;
  return (
    type === 0xa000 || type === 0x6000 || type === 0x2000 || type === 0x1000
  );
}

function checkImage(path: string, bytes: Uint8Array, maxPixels: number) {
  let width = 0;
  let height = 0;
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    if (
      bytes.length < 33 ||
      new DataView(bytes.buffer, bytes.byteOffset).getUint32(8) !== 13 ||
      Buffer.from(bytes.subarray(12, 16)).toString() !== "IHDR" ||
      !Buffer.from(bytes).subarray(12).includes(Buffer.from("IEND"))
    ) {
      throw new Error("PNG header/chunk structure is invalid");
    }
    width = new DataView(bytes.buffer, bytes.byteOffset).getUint32(16);
    height = new DataView(bytes.buffer, bytes.byteOffset).getUint32(20);
  } else if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP"
  ) {
    if (
      Buffer.from(bytes.subarray(12, 16)).toString() === "VP8X" &&
      bytes.length >= 30
    ) {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    }
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = 2; i + 9 < bytes.length;) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1]!;
      const size = (bytes[i + 2]! << 8) | bytes[i + 3]!;
      if (size < 2 || i + 2 + size > bytes.length) break;
      if (marker >= 0xc0 && marker <= 0xc3) {
        height = (bytes[i + 5]! << 8) | bytes[i + 6]!;
        width = (bytes[i + 7]! << 8) | bytes[i + 8]!;
        break;
      }
      i += 2 + size;
    }
  }
  if (!width || !height || width * height > maxPixels) {
    throw new Error(`image header is invalid or exceeds ${maxPixels} pixels`);
  }
  return { width, height };
}

function validateJson(value: unknown, maxDepth: number, maxKeys: number) {
  let keys = 0;
  const visit = (node: unknown, depth: number) => {
    if (depth > maxDepth) throw new Error("JSON nesting is too deep");
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
    } else if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        keys++;
        if (keys > maxKeys) throw new Error("JSON has too many keys");
        if (key.length > 256) throw new Error("JSON key is too long");
        visit(child, depth + 1);
      }
    }
  };
  visit(value, 0);
}

async function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: true }, (error, file) => {
      if (error || !file) reject(error ?? new Error("cannot open zip"));
      else resolve(file);
    });
  });
}

async function readEntry(file: ZipFile, entry: Entry): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    file.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("cannot read zip entry"));
        return;
      }
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.once("error", reject);
      stream.once("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

async function inspectZip(
  zipPath: string,
  env: ServerEnv,
): Promise<{
  fileCount: number;
  extractedSize: number;
  manifest: PreflightManifestEntry[];
  diagnostics: PreflightDiagnostic[];
}> {
  const file = await openZip(zipPath);
  const seen = new Set<string>();
  const seenDirectories = new Set<string>();
  const manifest: PreflightManifestEntry[] = [];
  const diagnostics: PreflightDiagnostic[] = [];
  let fileCount = 0;
  let extractedSize = 0;
  let settled = false;
  const fail = (code: string, path: string | null, message: string): never => {
    diagnostics.push(diagnostic(code, path, message));
    throw new PreflightRejected("package rejected", {
      inputSha256: "0".repeat(64),
      inputSize: 0,
      fileCount,
      extractedSize,
      manifest: manifest.sort((a, b) => a.path.localeCompare(b.path)),
      diagnostics,
    });
  };
  return new Promise((resolve, reject) => {
    file.on("entry", async (entry) => {
      if (settled) return;
      try {
        if (entry.fileName.endsWith("/")) {
          let directoryPath: string;
          try {
            directoryPath = normalizeEntryPath(entry.fileName.slice(0, -1));
          } catch (error) {
            fail("PathUnsafe", entry.fileName, (error as Error).message);
          }
          if (isLinkOrDevice(entry))
            fail(
              "LinkOrDevice",
              directoryPath!,
              "symbolic links and device entries are not allowed",
            );
          const canonicalDirectory = directoryPath!.toLocaleLowerCase("en-US");
          if (
            seen.has(canonicalDirectory) ||
            seenDirectories.has(canonicalDirectory)
          )
            fail("DuplicatePath", directoryPath!, "duplicate canonical path");
          seenDirectories.add(canonicalDirectory);
          file.readEntry();
          return;
        }
        let path: string;
        try {
          path = normalizeEntryPath(entry.fileName);
        } catch (error) {
          fail("PathUnsafe", entry.fileName, (error as Error).message);
        }
        if (isLinkOrDevice(entry))
          fail(
            "LinkOrDevice",
            path!,
            "symbolic links and device entries are not allowed",
          );
        const canonical = path!.toLocaleLowerCase("en-US");
        if (seen.has(canonical) || seenDirectories.has(canonical))
          fail("DuplicatePath", path!, "duplicate canonical path");
        seen.add(canonical);
        fileCount++;
        if (fileCount > env.PREFLIGHT_MAX_FILES)
          fail("FileCountExceeded", path!, "too many files");
        const extension = path!.slice(path!.lastIndexOf(".")).toLowerCase();
        if (!allowedExtensions.has(extension))
          fail("ExtensionNotAllowed", path!, "file extension is not allowed");
        const size = Number(entry.uncompressedSize);
        const compressedSize = Number(entry.compressedSize);
        extractedSize += size;
        if (
          size > env.PREFLIGHT_MAX_EXTRACTED_BYTES ||
          extractedSize > env.PREFLIGHT_MAX_EXTRACTED_BYTES
        ) {
          fail("ExtractedSizeExceeded", path!, "extracted size limit exceeded");
        }
        if (
          (size > 0 && compressedSize === 0) ||
          (size > 0 &&
            size / Math.max(compressedSize, 1) >
              env.PREFLIGHT_MAX_COMPRESSION_RATIO)
        ) {
          fail(
            "CompressionRatioExceeded",
            path!,
            "compression ratio is unsafe",
          );
        }
        const bytes = await readEntry(file, entry);
        if (bytes.length !== size)
          fail(
            "EntrySizeMismatch",
            path!,
            "entry size does not match ZIP metadata",
          );
        if (extension === ".json" || extension === ".mcmeta") {
          if (bytes.length > env.PREFLIGHT_MAX_JSON_BYTES)
            fail("JsonTooLarge", path!, "JSON entry exceeds size limit");
          try {
            validateJson(
              JSON.parse(Buffer.from(bytes).toString("utf8")),
              32,
              10_000,
            );
          } catch (error) {
            fail("JsonInvalid", path!, (error as Error).message);
          }
        }
        if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
          if (bytes.length > env.PREFLIGHT_MAX_IMAGE_BYTES)
            fail("ImageTooLarge", path!, "image exceeds byte limit");
          try {
            checkImage(path!, bytes, env.PREFLIGHT_MAX_IMAGE_PIXELS);
          } catch (error) {
            fail("ImageInvalid", path!, (error as Error).message);
          }
        }
        manifest.push({
          path: path!,
          size,
          compressedSize,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
        file.readEntry();
      } catch (error) {
        settled = true;
        reject(error);
      }
    });
    file.once("end", () => {
      if (settled) return;
      settled = true;
      resolve({
        fileCount,
        extractedSize,
        manifest: manifest.sort((a, b) => a.path.localeCompare(b.path)),
        diagnostics,
      });
    });
    file.once("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    file.readEntry();
  });
}

async function downloadToFile(
  body: AsyncIterable<Uint8Array>,
  target: string,
  maxBytes: number,
): Promise<{ size: number; sha256: string }> {
  const output = createWriteStream(target, { flags: "wx", mode: 0o600 });
  const hash = createHash("sha256");
  let size = 0;
  try {
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > maxBytes) throw new Error("archive exceeds upload size limit");
      hash.update(chunk);
      if (!output.write(Buffer.from(chunk))) await once(output, "drain");
    }
    output.end();
    await once(output, "close");
    return { size, sha256: hash.digest("hex") };
  } catch (error) {
    output.destroy();
    throw error;
  }
}

export async function runPreflight(
  upload: WorkerUpload,
  storage: WorkerQuarantineStorage,
  env: ServerEnv,
): Promise<PreflightResult> {
  const root = await mkdtemp(join(tmpdir(), "dawnlight-preflight-"), {
    encoding: "utf8",
  });
  const archive = join(root, "archive.zip");
  try {
    const downloaded = await downloadToFile(
      await storage.get(upload.objectKey),
      archive,
      env.UPLOAD_MAX_BYTES,
    );
    if (downloaded.size !== upload.expectedSize) {
      throw new PreflightRejected("object size changed after completion", {
        inputSha256: downloaded.sha256,
        inputSize: downloaded.size,
        fileCount: 0,
        extractedSize: 0,
        manifest: [],
        diagnostics: [
          diagnostic(
            "ObjectSizeChanged",
            null,
            "object size changed after HEAD completion",
          ),
        ],
      });
    }
    const inspected = await inspectZip(archive, env).catch((error) => {
      if (error instanceof PreflightRejected) {
        return {
          ...error.result,
          inputSha256: downloaded.sha256,
          inputSize: downloaded.size,
        };
      }
      throw new PreflightRejected("archive is invalid", {
        inputSha256: downloaded.sha256,
        inputSize: downloaded.size,
        fileCount: 0,
        extractedSize: 0,
        manifest: [],
        diagnostics: [
          diagnostic(
            /path/i.test(error instanceof Error ? error.message : "")
              ? "PathUnsafe"
              : "ArchiveInvalid",
            null,
            error instanceof Error
              ? error.message
              : "archive could not be inspected",
          ),
        ],
      });
    });
    const diagnostics = inspected.diagnostics;
    const result = {
      inputSha256: downloaded.sha256,
      inputSize: downloaded.size,
      fileCount: inspected.fileCount,
      extractedSize: inspected.extractedSize,
      manifest: inspected.manifest,
      diagnostics,
    } satisfies PreflightResult;
    if (diagnostics.some((item) => item.severity === "error")) {
      throw new PreflightRejected("package rejected", result);
    }
    return result;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
