import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { once } from "node:events";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import type { ServerEnv } from "@dawnlight/config";
import type {
  LoaderCandidate,
  LoaderValidationReport,
} from "@dawnlight/database";
import type { WorkerQuarantineStorage } from "./storage.js";
import { isLinkOrDevice, normalizeEntryPath } from "./preflight.js";

const maxLogBytes = 64 * 1024;

function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolveZip, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: true }, (error, file) => {
      if (error || !file) reject(error ?? new Error("cannot open zip"));
      else resolveZip(file);
    });
  });
}

function openEntry(
  file: ZipFile,
  entry: Entry,
): Promise<NodeJS.ReadableStream> {
  return new Promise((resolveStream, reject) => {
    file.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error("cannot read zip entry"));
      else resolveStream(stream);
    });
  });
}

async function downloadArchive(
  candidate: LoaderCandidate,
  storage: WorkerQuarantineStorage,
  archivePath: string,
) {
  const source = await storage.get(candidate.objectKey);
  const output = createWriteStream(archivePath, { flags: "wx", mode: 0o600 });
  const hash = createHash("sha256");
  for await (const chunk of source) {
    hash.update(chunk);
    if (!output.write(chunk)) await once(output, "drain");
  }
  output.end();
  await once(output, "close");
  const digest = hash.digest("hex");
  if (digest !== candidate.inputSha256) {
    throw new Error("ValidationInputHashMismatch");
  }
}

async function extractArchive(
  archivePath: string,
  packRoot: string,
  env: ServerEnv,
) {
  const zip = await openZip(archivePath);
  let count = 0;
  let extracted = 0;
  await new Promise<void>((resolveExtraction, reject) => {
    zip.on("error", reject);
    zip.on("end", resolveExtraction);
    zip.on("entry", async (entry) => {
      try {
        if (entry.fileName.endsWith("/")) {
          zip.readEntry();
          return;
        }
        count++;
        extracted += entry.uncompressedSize;
        if (
          count > env.PREFLIGHT_MAX_FILES ||
          extracted > env.PREFLIGHT_MAX_EXTRACTED_BYTES ||
          isLinkOrDevice(entry)
        ) {
          throw new Error("ValidationExtractionLimitExceeded");
        }
        const normalized = normalizeEntryPath(entry.fileName);
        const destination = resolve(packRoot, normalized);
        const escape = relative(packRoot, destination);
        if (escape.startsWith(`..${sep}`) || escape === "..") {
          throw new Error("ValidationPathEscape");
        }
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
        const source = await openEntry(zip, entry);
        const target = createWriteStream(destination, {
          flags: "wx",
          mode: 0o600,
        });
        source.pipe(target);
        await once(target, "close");
        zip.readEntry();
      } catch (error) {
        zip.close();
        reject(error);
      }
    });
    zip.readEntry();
  });
}

export function parseShaderPackCliOutput(
  stdout: string,
  stderr: string,
  exitCode: number | null,
): LoaderValidationReport {
  const values = new Map<string, string>();
  const diagnostics: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (key === "diagnostic") diagnostics.push(value);
    else values.set(key, value);
  }
  const valid = exitCode === 0 && values.get("valid") === "true";
  const diagnosticCount = Number(
    values.get("diagnostics") ?? diagnostics.length,
  );
  const schemaPassed =
    valid && Number.isFinite(diagnosticCount) && diagnosticCount === 0;
  const logSummary = [stdout.trim(), stderr.trim()]
    .filter(Boolean)
    .join("\n")
    .slice(0, maxLogBytes);
  return {
    status: valid && schemaPassed ? "loader-passed" : "loader-failed",
    exitCode,
    logSummary,
    sections: {
      schema: {
        status: schemaPassed ? "passed" : "failed",
        summary: schemaPassed
          ? `manifest ${values.get("manifestSha256") ?? "validated"}; ${diagnosticCount} diagnostics`
          : `${diagnosticCount || diagnostics.length} Loader diagnostics`,
        details: {
          manifestSha256: values.get("manifestSha256") ?? null,
          settingsSha256: values.get("settingsSha256") ?? null,
          diagnostics,
        },
      },
      loader: {
        status: valid ? "passed" : "failed",
        summary: valid
          ? `pack ${values.get("packId") ?? "unknown"} loaded by ShaderPackCli`
          : `ShaderPackCli exited with ${exitCode ?? "no exit code"}`,
        details: Object.fromEntries(values),
      },
      security: {
        status: "passed",
        summary:
          "Package passed quarantine preflight before isolated Loader execution.",
      },
      resource: {
        status: "passed",
        summary: `${values.get("options") ?? "unknown"} options; ${values.get("coverage") ?? "unknown"} settings coverage`,
      },
      compatibility: {
        status: "declared",
        summary:
          "Loader validation does not replace platform/GPU device verification.",
      },
    },
  };
}

function runContainer(packRoot: string, env: ServerEnv) {
  if (!env.LOADER_VALIDATOR_ENABLED || !env.LOADER_VALIDATOR_IMAGE) {
    throw new Error("LoaderValidatorNotConfigured");
  }
  const args = [
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--user",
    "65532:65532",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "64",
    "--memory",
    `${env.LOADER_MEMORY_MB}m`,
    "--cpus",
    String(env.LOADER_CPU_LIMIT),
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=64m",
    "--mount",
    `type=bind,src=${packRoot},dst=/input,readonly`,
    env.LOADER_VALIDATOR_IMAGE,
    "settings",
    "validate",
    "/input",
  ];
  return spawn("docker", args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { PATH: process.env.PATH },
  });
}

function waitForContainer(
  child: ReturnType<typeof spawn>,
  timeoutSeconds: number,
): Promise<{ code: number | null; timedOut: boolean }> {
  return new Promise((resolveOutcome, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolveOutcome({ code: null, timedOut: true });
    }, timeoutSeconds * 1000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolveOutcome({ code, timedOut: false });
    });
  });
}

export async function runLoaderValidation(
  candidate: LoaderCandidate,
  storage: WorkerQuarantineStorage,
  env: ServerEnv,
): Promise<LoaderValidationReport> {
  const workspace = await mkdtemp(join(tmpdir(), "dawnlight-loader-"));
  const archivePath = join(workspace, "archive.zip");
  const packRoot = join(workspace, "pack");
  try {
    await mkdir(packRoot, { mode: 0o700 });
    await downloadArchive(candidate, storage, archivePath);
    await extractArchive(archivePath, packRoot, env);
    const manifest = JSON.parse(
      await readFile(join(packRoot, "shaderpack.json"), "utf8"),
    ) as {
      version?: unknown;
      manifestVersion?: unknown;
      settings?: unknown;
    };
    if (manifest.version !== candidate.version) {
      return {
        status: "loader-failed",
        exitCode: null,
        logSummary: "Draft version does not match shaderpack.json version.",
        sections: {
          schema: { status: "failed", summary: "Version metadata mismatch." },
          loader: {
            status: "failed",
            summary: "Loader was not started for mismatched metadata.",
          },
          security: {
            status: "passed",
            summary: "Quarantine preflight passed.",
          },
          resource: {
            status: "unavailable",
            summary: "Loader was not started.",
          },
          compatibility: {
            status: "unavailable",
            summary: "Loader was not started.",
          },
        },
      };
    }
    let settingsSchemaVersion: unknown = 1;
    if (typeof manifest.settings === "string") {
      const settings = JSON.parse(
        await readFile(
          resolve(packRoot, normalizeEntryPath(manifest.settings)),
          "utf8",
        ),
      ) as { schemaVersion?: unknown };
      settingsSchemaVersion = settings.schemaVersion;
    }
    const child = runContainer(packRoot, env);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < maxLogBytes) stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < maxLogBytes) stderr += chunk.toString();
    });
    const outcome = await waitForContainer(child, env.LOADER_TIMEOUT_SECONDS);
    if (outcome.timedOut) {
      return {
        status: "timed-out",
        exitCode: null,
        logSummary: "ShaderPackCli exceeded the configured wall-clock timeout.",
        sections: {
          schema: { status: "unavailable", summary: "Loader timed out." },
          loader: { status: "failed", summary: "Validator timed out." },
          security: {
            status: "passed",
            summary: "Quarantine preflight passed.",
          },
          resource: { status: "failed", summary: "Wall-clock limit exceeded." },
          compatibility: {
            status: "unavailable",
            summary: "No Loader result.",
          },
        },
      };
    }
    const report = parseShaderPackCliOutput(stdout, stderr, outcome.code);
    report.sections.loader.details = {
      ...(report.sections.loader.details ?? {}),
      manifestVersion: manifest.manifestVersion,
      settingsSchemaVersion,
    };
    return report;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
