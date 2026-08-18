import { spawn } from "node:child_process";

const port = "4101";
const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    APP_ENV: "test",
    API_HOST: "127.0.0.1",
    API_PORT: port,
    DATABASE_URL: "postgres://dawnlight:dawnlight@127.0.0.1:59999/dawnlight_v2",
    LOG_LEVEL: "error",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

async function waitFor(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await fetch(url);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for ${url}. Output:\n${output}`);
}

try {
  const live = await waitFor(`http://127.0.0.1:${port}/health/live`);
  if (live.status !== 200) throw new Error(`live returned ${live.status}`);
  const ready = await fetch(`http://127.0.0.1:${port}/health/ready`);
  if (ready.status !== 503) throw new Error(`ready returned ${ready.status}`);
  const body = await ready.json();
  if (
    body.status !== "not-ready" ||
    body.checks?.database?.status !== "failed"
  ) {
    throw new Error(`unexpected ready response: ${JSON.stringify(body)}`);
  }
  const contract = await fetch(
    `http://127.0.0.1:${port}/api/v1/contracts/preview-2026-08-16/diagnostics`,
  );
  if (contract.status !== 200) {
    throw new Error(`contract diagnostics returned ${contract.status}`);
  }
  const contractBody = await contract.json();
  if (!Array.isArray(contractBody.data) || contractBody.data.length !== 4) {
    throw new Error(
      `unexpected contract response: ${JSON.stringify(contractBody)}`,
    );
  }
  console.log(
    "V2 API smoke passed (live 200, dependency failure 503, contract diagnostics 200).",
  );
} finally {
  child.kill("SIGTERM");
}
