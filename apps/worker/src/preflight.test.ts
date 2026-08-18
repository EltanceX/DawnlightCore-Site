import { describe, expect, it } from "vitest";
// @ts-expect-error yazl has no bundled declarations; test-only dependency.
import yazl from "yazl";
import { parseServerEnv } from "@dawnlight/config";
import { runPreflight, PreflightRejected } from "./preflight.js";
import type { WorkerQuarantineStorage } from "./storage.js";

async function zip(entries: Array<[string, Uint8Array | string]>) {
  const archive = new yazl.ZipFile();
  for (const [name, data] of entries) {
    archive.addBuffer(Buffer.from(data), name);
  }
  archive.end();
  const chunks: Buffer[] = [];
  for await (const chunk of archive.outputStream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function rawZip(entries: Array<[string, string, number?]>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, value, externalAttributes = 0] of entries) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(value);
    const local = Buffer.alloc(30 + nameBytes.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    data.copy(local, 30 + nameBytes.length);
    locals.push(local);
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(externalAttributes, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

function storage(buffer: Buffer): WorkerQuarantineStorage {
  return {
    async get() {
      return (async function* () {
        yield buffer;
      })();
    },
    async delete() {},
    async copyToPublished() {},
    async headPublished() {
      return { size: buffer.length, etag: null, sha256: null };
    },
    async check() {},
  };
}

const upload = (buffer: Buffer) => ({
  id: "upload-1",
  objectKey: "uploads/upload-1/archive.zip",
  expectedSize: buffer.length,
  contentType: "application/zip",
  status: "queued" as const,
});

const baseEnv = () =>
  parseServerEnv({
    APP_ENV: "test",
    PREFLIGHT_MAX_FILES: "20",
    PREFLIGHT_MAX_EXTRACTED_BYTES: "100000",
    PREFLIGHT_MAX_JSON_BYTES: "2048",
    PREFLIGHT_MAX_IMAGE_BYTES: "2048",
    PREFLIGHT_MAX_COMPRESSION_RATIO: "200",
  });

describe("quarantine preflight", () => {
  it("creates a reproducible report and server-side archive hash", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const buffer = await zip([
      ["shaders/main.glsl", "void main() {}"],
      ["pack.json", JSON.stringify({ name: "fixture", version: 1 })],
      ["textures/white.png", png],
    ]);
    const first = await runPreflight(
      upload(buffer),
      storage(buffer),
      baseEnv(),
    );
    const second = await runPreflight(
      upload(buffer),
      storage(buffer),
      baseEnv(),
    );
    expect(second).toEqual(first);
    expect(first.fileCount).toBe(3);
    expect(first.inputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.manifest.map((entry) => entry.path)).toEqual([
      "pack.json",
      "shaders/main.glsl",
      "textures/white.png",
    ]);
  });

  it("accepts safe explicit directory entries without counting them as files", async () => {
    const buffer = rawZip([
      ["shaders/", ""],
      ["shaders/main.glsl", "void main() {}"],
    ]);
    const report = await runPreflight(
      upload(buffer),
      storage(buffer),
      baseEnv(),
    );
    expect(report.fileCount).toBe(1);
    expect(report.manifest[0]?.path).toBe("shaders/main.glsl");
  });

  it.each([
    ["path traversal", [["../evil.glsl", "x"]]],
    ["absolute path", [["/evil.glsl", "x"]]],
    [
      "duplicate canonical path",
      [
        ["a.glsl", "x"],
        ["A.glsl", "y"],
      ],
    ],
    ["symbolic link", [["link.glsl", "target", 0xa0000000]]],
    ["illegal extension", [["payload.exe", "x"]]],
    ["invalid image", [["textures/bad.png", "not-an-image"]]],
  ])("rejects %s", async (_name, entries) => {
    const buffer = rawZip(entries as Array<[string, string, number?]>);
    await expect(
      runPreflight(upload(buffer), storage(buffer), baseEnv()),
    ).rejects.toBeInstanceOf(PreflightRejected);
  });

  it("rejects oversized JSON before parsing an unbounded body", async () => {
    const buffer = await zip([
      ["pack.json", "{" + '"x":"' + "a".repeat(4000) + '"}'],
    ]);
    await expect(
      runPreflight(upload(buffer), storage(buffer), baseEnv()),
    ).rejects.toMatchObject({
      result: { diagnostics: [{ code: "JsonTooLarge" }] },
    });
  });

  it("rejects zip bombs using the compression ratio cap", async () => {
    const env = baseEnv();
    env.PREFLIGHT_MAX_COMPRESSION_RATIO = 2;
    const buffer = await zip([["shaders/repetitive.glsl", "A".repeat(20_000)]]);
    await expect(
      runPreflight(upload(buffer), storage(buffer), env),
    ).rejects.toMatchObject({
      result: { diagnostics: [{ code: "CompressionRatioExceeded" }] },
    });
  });
});
