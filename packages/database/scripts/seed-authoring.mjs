import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const { Client } = pg;
const connectionString =
  process.env.DATABASE_URL ??
  "postgres://dawnlight:dawnlight@127.0.0.1:55432/dawnlight_v2";
const email = (process.env.WP5_BOOTSTRAP_ADMIN_EMAIL ?? "author@example.test")
  .trim()
  .toLowerCase();
const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");
const client = new Client({ connectionString });

await client.connect();
try {
  await client.query("begin");
  await client.query(
    `update account_invitations set status = 'revoked', revoked_at = now()
     where email_normalized = $1 and status = 'pending' and grants_platform_admin = true`,
    [email],
  );
  await client.query(
    `insert into account_invitations
     (email_normalized, token_hash, status, grants_platform_admin, expires_at)
     values ($1,$2,'pending',true,now() + interval '7 days')`,
    [email, tokenHash],
  );
  await client.query("commit");
  console.log(`Created one-time WP5 bootstrap invitation for ${email}.`);
  console.log(`Invite token: ${token}`);
  console.log(
    "Pass it only through /api/v1/auth/oidc/start?invite=... and do not commit it.",
  );
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
