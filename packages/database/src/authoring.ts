import type { Pool, PoolClient } from "pg";

export type UserStatus = "active" | "disabled" | "deletion-requested";
export type ProjectRole = "owner" | "maintainer" | "reviewer";
export type AuthorProjectStatus = "draft" | "archived";
export type DraftVersionStatus =
  | "draft"
  | "validating"
  | "loader-failed"
  | "awaiting-review"
  | "changes-requested"
  | "rejected"
  | "approved"
  | "publishing"
  | "publish-failed"
  | "published"
  | "withdrawn";

export type AuthUser = {
  id: string;
  displayName: string;
  email: string;
  status: UserStatus;
  isPlatformAdmin: boolean;
};

export type SessionPrincipal = {
  sessionId: string;
  csrfToken: string;
  expiresAt: string;
  user: AuthUser;
};

export type LoginTransaction = {
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  accountInviteTokenHash: string | null;
};

export type OidcIdentity = {
  issuer: string;
  subject: string;
  displayName: string;
  email: string;
};

export type CompatibilityDraft = {
  coreRange: string;
  gameApiTag: string;
  platforms: string[];
  architectures: string[];
  gpuClasses: string[];
  note: string;
};

export type ArtifactDeclaration = {
  fileName: string;
  platform: string;
  architecture: string;
  gpuClass: string;
  expectedSize: number | null;
};

export type AuthorVersion = {
  id: string;
  projectId: string;
  version: string;
  channel: "preview" | "alpha" | "beta" | "stable";
  status: DraftVersionStatus;
  changelog: string;
  licenseSpdx: string | null;
  compatibility: CompatibilityDraft[];
  artifactDeclarations: ArtifactDeclaration[];
  revision: number;
  updatedAt: string;
};

export type AuthorProject = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  licenseSpdx: string | null;
  status: AuthorProjectStatus;
  role: ProjectRole;
  updatedAt: string;
  versions: AuthorVersion[];
};

export type ProjectInvitation = {
  id: string;
  projectId: string;
  email: string;
  role: Exclude<ProjectRole, "owner">;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
};

export type MutationContext = {
  actorId: string;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
};

export type CompleteLoginInput = {
  identity: OidcIdentity;
  accountInviteTokenHash: string | null;
  sessionTokenHash: string;
  csrfToken: string;
  expiresAt: Date;
  requestId: string;
};

export type CreateProjectInput = {
  slug: string;
  name: string;
  summary: string;
  licenseSpdx: string | null;
};

export type ProjectPatch = Partial<
  Pick<CreateProjectInput, "name" | "summary" | "licenseSpdx"> & {
    status: AuthorProjectStatus;
  }
>;

export type CreateVersionInput = Omit<
  AuthorVersion,
  "id" | "projectId" | "status" | "revision" | "updatedAt"
>;

export type VersionPatch = Partial<
  Pick<
    AuthorVersion,
    | "channel"
    | "changelog"
    | "licenseSpdx"
    | "compatibility"
    | "artifactDeclarations"
  >
> & { expectedRevision: number };

export class AuthoringError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AuthoringError";
  }
}

export interface AuthoringDataService {
  createLoginTransaction(
    stateHash: string,
    transaction: LoginTransaction,
    expiresAt: Date,
  ): Promise<void>;
  consumeLoginTransaction(stateHash: string): Promise<LoginTransaction>;
  completeOidcLogin(input: CompleteLoginInput): Promise<SessionPrincipal>;
  getSession(sessionTokenHash: string): Promise<SessionPrincipal | null>;
  revokeSession(sessionTokenHash: string, requestId: string): Promise<void>;
  createAccountInvitation(
    context: MutationContext,
    input: { email: string; tokenHash: string; expiresAt: Date },
  ): Promise<{ id: string; email: string; expiresAt: string }>;
  disableUser(
    context: MutationContext,
    userId: string,
    reason: string,
  ): Promise<AuthUser>;
  listProjects(actorId: string): Promise<AuthorProject[]>;
  createProject(
    context: MutationContext,
    input: CreateProjectInput,
  ): Promise<AuthorProject>;
  updateProject(
    context: MutationContext,
    projectId: string,
    patch: ProjectPatch,
  ): Promise<AuthorProject>;
  createVersion(
    context: MutationContext,
    projectId: string,
    input: CreateVersionInput,
  ): Promise<AuthorVersion>;
  updateVersion(
    context: MutationContext,
    projectId: string,
    versionId: string,
    patch: VersionPatch,
  ): Promise<AuthorVersion>;
  createProjectInvitation(
    context: MutationContext,
    projectId: string,
    input: {
      email: string;
      role: Exclude<ProjectRole, "owner">;
      tokenHash: string;
      expiresAt: Date;
    },
  ): Promise<ProjectInvitation>;
  acceptProjectInvitation(
    context: MutationContext,
    tokenHash: string,
  ): Promise<AuthorProject>;
  revokeProjectInvitation(
    context: MutationContext,
    projectId: string,
    invitationId: string,
  ): Promise<void>;
  listAuditEvents(
    actorId: string,
    projectId: string,
  ): Promise<
    Array<{
      id: string;
      action: string;
      outcome: string;
      requestId: string;
      createdAt: string;
    }>
  >;
}

const json = (value: unknown) => JSON.stringify(value);
const normalizeEmail = (value: string) => value.trim().toLowerCase();

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  license_spdx: string | null;
  status: AuthorProjectStatus;
  role: ProjectRole;
  updated_at: Date;
};

type VersionRow = {
  id: string;
  project_id: string;
  version: string;
  channel: AuthorVersion["channel"];
  status: DraftVersionStatus;
  changelog: string;
  license_spdx: string | null;
  compatibility: CompatibilityDraft[];
  artifact_declarations: ArtifactDeclaration[];
  revision: number;
  updated_at: Date;
};

function mapVersion(row: VersionRow): AuthorVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    channel: row.channel,
    status: row.status,
    changelog: row.changelog,
    licenseSpdx: row.license_spdx,
    compatibility: row.compatibility,
    artifactDeclarations: row.artifact_declarations,
    revision: row.revision,
    updatedAt: row.updated_at.toISOString(),
  };
}

async function mapProjects(
  queryable: Pick<Pool, "query"> | Pick<PoolClient, "query">,
  rows: ProjectRow[],
): Promise<AuthorProject[]> {
  const result: AuthorProject[] = [];
  for (const row of rows) {
    const versions = await queryable.query<VersionRow>(
      "select * from author_project_versions where project_id = $1 order by updated_at desc",
      [row.id],
    );
    result.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      summary: row.summary,
      licenseSpdx: row.license_spdx,
      status: row.status,
      role: row.role,
      updatedAt: row.updated_at.toISOString(),
      versions: versions.rows.map(mapVersion),
    });
  }
  return result;
}

export class PostgresAuthoringDataService implements AuthoringDataService {
  constructor(private readonly pool: Pool) {}

  async createLoginTransaction(
    stateHash: string,
    transaction: LoginTransaction,
    expiresAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `insert into oidc_login_transactions
       (state_hash, code_verifier, nonce, return_to, account_invite_token_hash, expires_at)
       values ($1,$2,$3,$4,$5,$6)`,
      [
        stateHash,
        transaction.codeVerifier,
        transaction.nonce,
        transaction.returnTo,
        transaction.accountInviteTokenHash,
        expiresAt,
      ],
    );
  }

  async consumeLoginTransaction(stateHash: string): Promise<LoginTransaction> {
    const result = await this.pool.query<{
      code_verifier: string;
      nonce: string;
      return_to: string;
      account_invite_token_hash: string | null;
    }>(
      `update oidc_login_transactions set consumed_at = now()
       where state_hash = $1 and consumed_at is null and expires_at > now()
       returning code_verifier, nonce, return_to, account_invite_token_hash`,
      [stateHash],
    );
    const row = result.rows[0];
    if (!row) {
      throw new AuthoringError(
        "OidcTransactionInvalid",
        "登录事务不存在、已使用或已过期。",
        400,
      );
    }
    return {
      codeVerifier: row.code_verifier,
      nonce: row.nonce,
      returnTo: row.return_to,
      accountInviteTokenHash: row.account_invite_token_hash,
    };
  }

  async completeOidcLogin(
    input: CompleteLoginInput,
  ): Promise<SessionPrincipal> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query<{ user_id: string }>(
        "select user_id from auth_oidc_identities where issuer = $1 and subject = $2 for update",
        [input.identity.issuer, input.identity.subject],
      );
      let userId = existing.rows[0]?.user_id;
      if (!userId) {
        if (!input.accountInviteTokenHash) {
          throw new AuthoringError(
            "AccountInvitationRequired",
            "当前为邀请制，首次登录需要有效的账户邀请。",
            403,
          );
        }
        const invite = await client.query<{
          id: string;
          grants_platform_admin: boolean;
        }>(
          `select id, grants_platform_admin from account_invitations
           where token_hash = $1 and email_normalized = $2 and status = 'pending' and expires_at > now()
           for update`,
          [input.accountInviteTokenHash, normalizeEmail(input.identity.email)],
        );
        if (!invite.rows[0]) {
          throw new AuthoringError(
            "AccountInvitationInvalid",
            "账户邀请无效、已撤销、已过期或与 OIDC 邮箱不匹配。",
            403,
          );
        }
        const user = await client.query<{ id: string }>(
          `insert into auth_users
           (display_name, email, email_normalized, status, is_platform_admin)
           values ($1,$2,$3,'active',$4) returning id`,
          [
            input.identity.displayName,
            input.identity.email,
            normalizeEmail(input.identity.email),
            invite.rows[0].grants_platform_admin,
          ],
        );
        userId = user.rows[0]!.id;
        await client.query(
          `update account_invitations
           set status = 'accepted', accepted_by = $1, accepted_at = now()
           where id = $2`,
          [userId, invite.rows[0].id],
        );
        await client.query(
          `insert into auth_oidc_identities (issuer, subject, user_id, email_at_link)
           values ($1,$2,$3,$4)`,
          [
            input.identity.issuer,
            input.identity.subject,
            userId,
            input.identity.email,
          ],
        );
      } else {
        await client.query(
          `update auth_oidc_identities set last_login_at = now()
           where issuer = $1 and subject = $2`,
          [input.identity.issuer, input.identity.subject],
        );
      }
      const user = await client.query<{
        id: string;
        display_name: string;
        email: string;
        status: UserStatus;
        is_platform_admin: boolean;
      }>("select * from auth_users where id = $1 for update", [userId]);
      const row = user.rows[0]!;
      if (row.status !== "active") {
        throw new AuthoringError("AccountDisabled", "账户当前不可登录。", 403);
      }
      const session = await client.query<{ id: string }>(
        `insert into auth_sessions
         (user_id, token_hash, csrf_token, expires_at)
         values ($1,$2,$3,$4) returning id`,
        [userId, input.sessionTokenHash, input.csrfToken, input.expiresAt],
      );
      await this.insertAudit(client, {
        actorId: userId,
        action: "auth.login",
        resourceType: "user",
        resourceId: userId,
        outcome: "allowed",
        requestId: input.requestId,
        metadata: { issuer: input.identity.issuer },
      });
      await client.query("commit");
      return {
        sessionId: session.rows[0]!.id,
        csrfToken: input.csrfToken,
        expiresAt: input.expiresAt.toISOString(),
        user: {
          id: row.id,
          displayName: row.display_name,
          email: row.email,
          status: row.status,
          isPlatformAdmin: row.is_platform_admin,
        },
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getSession(sessionTokenHash: string): Promise<SessionPrincipal | null> {
    const result = await this.pool.query<{
      session_id: string;
      expires_at: Date;
      csrf_token: string;
      id: string;
      display_name: string;
      email: string;
      status: UserStatus;
      is_platform_admin: boolean;
    }>(
      `select s.id as session_id, s.expires_at, s.csrf_token,
              u.id, u.display_name, u.email, u.status, u.is_platform_admin
       from auth_sessions s join auth_users u on u.id = s.user_id
       where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()`,
      [sessionTokenHash],
    );
    const row = result.rows[0];
    if (!row || row.status !== "active") return null;
    return {
      sessionId: row.session_id,
      csrfToken: row.csrf_token,
      expiresAt: row.expires_at.toISOString(),
      user: {
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        status: row.status,
        isPlatformAdmin: row.is_platform_admin,
      },
    };
  }

  async revokeSession(sessionTokenHash: string, requestId: string) {
    const result = await this.pool.query<{ user_id: string }>(
      `update auth_sessions set revoked_at = now()
       where token_hash = $1 and revoked_at is null returning user_id`,
      [sessionTokenHash],
    );
    if (result.rows[0]) {
      await this.insertAudit(this.pool, {
        actorId: result.rows[0].user_id,
        action: "auth.logout",
        resourceType: "session",
        resourceId: null,
        outcome: "allowed",
        requestId,
        metadata: {},
      });
    }
  }

  async createAccountInvitation(
    context: MutationContext,
    input: { email: string; tokenHash: string; expiresAt: Date },
  ) {
    await this.requirePlatformAdmin(context);
    return this.withIdempotency(
      context,
      "account-invitation.create",
      async (client) => {
        const result = await client.query<{ id: string; expires_at: Date }>(
          `insert into account_invitations
         (email_normalized, token_hash, status, invited_by, expires_at)
         values ($1,$2,'pending',$3,$4) returning id, expires_at`,
          [
            normalizeEmail(input.email),
            input.tokenHash,
            context.actorId,
            input.expiresAt,
          ],
        );
        const response = {
          id: result.rows[0]!.id,
          email: normalizeEmail(input.email),
          expiresAt: result.rows[0]!.expires_at.toISOString(),
        };
        await this.insertAudit(client, {
          actorId: context.actorId,
          action: "account-invitation.create",
          resourceType: "account-invitation",
          resourceId: response.id,
          outcome: "allowed",
          requestId: context.requestId,
          metadata: { email: response.email },
        });
        return response;
      },
    );
  }

  async disableUser(context: MutationContext, userId: string, reason: string) {
    await this.requirePlatformAdmin(context);
    return this.withIdempotency(context, "user.disable", async (client) => {
      const result = await client.query<{
        id: string;
        display_name: string;
        email: string;
        status: UserStatus;
        is_platform_admin: boolean;
      }>(
        `update auth_users set status = 'disabled', updated_at = now()
         where id = $1 returning *`,
        [userId],
      );
      if (!result.rows[0])
        throw new AuthoringError("UserNotFound", "用户不存在。", 404);
      await client.query(
        "update auth_sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
        [userId],
      );
      await this.insertAudit(client, {
        actorId: context.actorId,
        action: "user.disable",
        resourceType: "user",
        resourceId: userId,
        outcome: "allowed",
        requestId: context.requestId,
        metadata: { reason },
      });
      const row = result.rows[0];
      return {
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        status: row.status,
        isPlatformAdmin: row.is_platform_admin,
      };
    });
  }

  async listProjects(actorId: string): Promise<AuthorProject[]> {
    const rows = await this.pool.query<ProjectRow>(
      `select p.*, m.role from author_projects p
       join project_memberships m on m.project_id = p.id
       where m.user_id = $1 order by p.updated_at desc`,
      [actorId],
    );
    return mapProjects(this.pool, rows.rows);
  }

  async createProject(context: MutationContext, input: CreateProjectInput) {
    return this.withIdempotency(context, "project.create", async (client) => {
      const result = await client.query<ProjectRow>(
        `insert into author_projects
         (slug, name, summary, license_spdx, status, created_by)
         values ($1,$2,$3,$4,'draft',$5)
         returning *, 'owner'::text as role`,
        [
          input.slug,
          input.name,
          input.summary,
          input.licenseSpdx,
          context.actorId,
        ],
      );
      const row = result.rows[0]!;
      await client.query(
        "insert into project_memberships (project_id, user_id, role) values ($1,$2,'owner')",
        [row.id, context.actorId],
      );
      await this.insertAudit(client, {
        actorId: context.actorId,
        action: "project.create",
        resourceType: "project",
        resourceId: row.id,
        outcome: "allowed",
        requestId: context.requestId,
        metadata: { slug: row.slug },
      });
      return (await mapProjects(client, [row]))[0]!;
    });
  }

  async updateProject(
    context: MutationContext,
    projectId: string,
    patch: ProjectPatch,
  ) {
    await this.requireProjectRole(context, projectId, ["owner", "maintainer"]);
    return this.withIdempotency(context, "project.update", async (client) => {
      const result = await client.query<ProjectRow>(
        `update author_projects set
           name = coalesce($2, name), summary = coalesce($3, summary),
           license_spdx = case when $4::boolean then $5 else license_spdx end,
           status = coalesce($6, status), updated_at = now()
         where id = $1
         returning *, (select role from project_memberships where project_id = $1 and user_id = $7)`,
        [
          projectId,
          patch.name ?? null,
          patch.summary ?? null,
          Object.prototype.hasOwnProperty.call(patch, "licenseSpdx"),
          patch.licenseSpdx ?? null,
          patch.status ?? null,
          context.actorId,
        ],
      );
      if (!result.rows[0])
        throw new AuthoringError("ProjectNotFound", "项目不存在。", 404);
      await this.insertAudit(client, {
        actorId: context.actorId,
        action: "project.update",
        resourceType: "project",
        resourceId: projectId,
        outcome: "allowed",
        requestId: context.requestId,
        metadata: { fields: Object.keys(patch) },
      });
      return (await mapProjects(client, result.rows))[0]!;
    });
  }

  async createVersion(
    context: MutationContext,
    projectId: string,
    input: CreateVersionInput,
  ) {
    await this.requireProjectRole(context, projectId, ["owner", "maintainer"]);
    return this.withIdempotency(context, "version.create", async (client) => {
      const result = await client.query<VersionRow>(
        `insert into author_project_versions
         (project_id, version, channel, status, changelog, license_spdx,
          compatibility, artifact_declarations, created_by)
         values ($1,$2,$3,'draft',$4,$5,$6::jsonb,$7::jsonb,$8) returning *`,
        [
          projectId,
          input.version,
          input.channel,
          input.changelog,
          input.licenseSpdx,
          json(input.compatibility),
          json(input.artifactDeclarations),
          context.actorId,
        ],
      );
      const version = mapVersion(result.rows[0]!);
      await this.insertAudit(client, {
        actorId: context.actorId,
        action: "version.create",
        resourceType: "project-version",
        resourceId: version.id,
        outcome: "allowed",
        requestId: context.requestId,
        metadata: { projectId, version: version.version },
      });
      return version;
    });
  }

  async updateVersion(
    context: MutationContext,
    projectId: string,
    versionId: string,
    patch: VersionPatch,
  ) {
    await this.requireProjectRole(context, projectId, ["owner", "maintainer"]);
    return this.withIdempotency(context, "version.update", async (client) => {
      const current = await client.query<VersionRow>(
        "select * from author_project_versions where id = $1 and project_id = $2 for update",
        [versionId, projectId],
      );
      const row = current.rows[0];
      if (!row)
        throw new AuthoringError("VersionNotFound", "草稿版本不存在。", 404);
      if (row.status !== "draft" && row.status !== "changes-requested") {
        throw new AuthoringError(
          "VersionFrozen",
          "版本已进入验证或审核流程，不能直接修改；需要修改时请等待审核要求变更。",
          409,
        );
      }
      if (row.revision !== patch.expectedRevision) {
        throw new AuthoringError(
          "DraftRevisionConflict",
          "草稿已被其他成员更新，请刷新后重试。",
          409,
          {
            expectedRevision: patch.expectedRevision,
            actualRevision: row.revision,
          },
        );
      }
      const result = await client.query<VersionRow>(
        `update author_project_versions set
           channel = $2, changelog = $3, license_spdx = $4,
           compatibility = $5::jsonb, artifact_declarations = $6::jsonb,
           revision = revision + 1, updated_at = now()
         where id = $1 returning *`,
        [
          versionId,
          patch.channel ?? row.channel,
          patch.changelog ?? row.changelog,
          Object.prototype.hasOwnProperty.call(patch, "licenseSpdx")
            ? patch.licenseSpdx
            : row.license_spdx,
          json(patch.compatibility ?? row.compatibility),
          json(patch.artifactDeclarations ?? row.artifact_declarations),
        ],
      );
      const version = mapVersion(result.rows[0]!);
      await this.insertAudit(client, {
        actorId: context.actorId,
        action: "version.update",
        resourceType: "project-version",
        resourceId: version.id,
        outcome: "allowed",
        requestId: context.requestId,
        metadata: { projectId, revision: version.revision },
      });
      return version;
    });
  }

  async createProjectInvitation(
    context: MutationContext,
    projectId: string,
    input: {
      email: string;
      role: Exclude<ProjectRole, "owner">;
      tokenHash: string;
      expiresAt: Date;
    },
  ) {
    await this.requireProjectRole(context, projectId, ["owner"]);
    return this.withIdempotency(
      context,
      "project-invitation.create",
      async (client) => {
        const result = await client.query<{
          id: string;
          expires_at: Date;
        }>(
          `insert into project_invitations
         (project_id, email_normalized, role, token_hash, status, invited_by, expires_at)
         values ($1,$2,$3,$4,'pending',$5,$6) returning id, expires_at`,
          [
            projectId,
            normalizeEmail(input.email),
            input.role,
            input.tokenHash,
            context.actorId,
            input.expiresAt,
          ],
        );
        const invitation: ProjectInvitation = {
          id: result.rows[0]!.id,
          projectId,
          email: normalizeEmail(input.email),
          role: input.role,
          status: "pending",
          expiresAt: result.rows[0]!.expires_at.toISOString(),
        };
        await this.insertAudit(client, {
          actorId: context.actorId,
          action: "project-invitation.create",
          resourceType: "project",
          resourceId: projectId,
          outcome: "allowed",
          requestId: context.requestId,
          metadata: { invitationId: invitation.id, role: invitation.role },
        });
        return invitation;
      },
    );
  }

  async acceptProjectInvitation(context: MutationContext, tokenHash: string) {
    return this.withIdempotency(
      context,
      "project-invitation.accept",
      async (client) => {
        const invite = await client.query<{
          id: string;
          project_id: string;
          email_normalized: string;
          role: Exclude<ProjectRole, "owner">;
        }>(
          `select id, project_id, email_normalized, role from project_invitations
         where token_hash = $1 and status = 'pending' and expires_at > now() for update`,
          [tokenHash],
        );
        const row = invite.rows[0];
        if (!row)
          throw new AuthoringError(
            "ProjectInvitationInvalid",
            "项目邀请无效、已撤销或已过期。",
            404,
          );
        const user = await client.query<{ email_normalized: string }>(
          "select email_normalized from auth_users where id = $1",
          [context.actorId],
        );
        if (user.rows[0]?.email_normalized !== row.email_normalized) {
          await this.insertAudit(client, {
            actorId: context.actorId,
            action: "project-invitation.accept",
            resourceType: "project",
            resourceId: row.project_id,
            outcome: "denied",
            requestId: context.requestId,
            metadata: { reason: "email-mismatch" },
          });
          throw new AuthoringError(
            "ProjectInvitationEmailMismatch",
            "项目邀请与当前账户邮箱不匹配。",
            403,
          );
        }
        await client.query(
          `insert into project_memberships (project_id, user_id, role)
         values ($1,$2,$3) on conflict (project_id, user_id) do update set role = excluded.role`,
          [row.project_id, context.actorId, row.role],
        );
        await client.query(
          `update project_invitations set status = 'accepted', accepted_by = $1, accepted_at = now()
         where id = $2`,
          [context.actorId, row.id],
        );
        await this.insertAudit(client, {
          actorId: context.actorId,
          action: "project-invitation.accept",
          resourceType: "project",
          resourceId: row.project_id,
          outcome: "allowed",
          requestId: context.requestId,
          metadata: { role: row.role },
        });
        const project = await client.query<ProjectRow>(
          `select p.*, m.role from author_projects p join project_memberships m on m.project_id = p.id
         where p.id = $1 and m.user_id = $2`,
          [row.project_id, context.actorId],
        );
        return (await mapProjects(client, project.rows))[0]!;
      },
    );
  }

  async revokeProjectInvitation(
    context: MutationContext,
    projectId: string,
    invitationId: string,
  ) {
    await this.requireProjectRole(context, projectId, ["owner"]);
    await this.withIdempotency(
      context,
      "project-invitation.revoke",
      async (client) => {
        const result = await client.query(
          `update project_invitations set status = 'revoked', revoked_at = now()
         where id = $1 and project_id = $2 and status = 'pending'`,
          [invitationId, projectId],
        );
        if (!result.rowCount)
          throw new AuthoringError(
            "ProjectInvitationNotFound",
            "待处理的项目邀请不存在。",
            404,
          );
        await this.insertAudit(client, {
          actorId: context.actorId,
          action: "project-invitation.revoke",
          resourceType: "project",
          resourceId: projectId,
          outcome: "allowed",
          requestId: context.requestId,
          metadata: { invitationId },
        });
        return { revoked: true };
      },
    );
  }

  async listAuditEvents(actorId: string, projectId: string) {
    await this.requireProjectRole(
      {
        actorId,
        requestId: "audit-read",
        idempotencyKey: "audit-read",
        requestHash: "audit-read",
      },
      projectId,
      ["owner", "maintainer", "reviewer"],
    );
    const result = await this.pool.query<{
      id: string;
      action: string;
      outcome: string;
      request_id: string;
      created_at: Date;
    }>(
      `select id, action, outcome, request_id, created_at from audit_events
       where resource_type in ('project', 'project-version')
         and (resource_id = $1 or metadata->>'projectId' = $1)
       order by created_at desc limit 100`,
      [projectId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      action: row.action,
      outcome: row.outcome,
      requestId: row.request_id,
      createdAt: row.created_at.toISOString(),
    }));
  }

  private async requirePlatformAdmin(context: MutationContext) {
    const result = await this.pool.query<{ is_platform_admin: boolean }>(
      "select is_platform_admin from auth_users where id = $1 and status = 'active'",
      [context.actorId],
    );
    if (!result.rows[0]?.is_platform_admin) {
      await this.insertAudit(this.pool, {
        actorId: context.actorId,
        action: "authorization.platform-admin",
        resourceType: "platform",
        resourceId: null,
        outcome: "denied",
        requestId: context.requestId,
        metadata: {},
      });
      throw new AuthoringError("Forbidden", "当前账户没有平台管理权限。", 403);
    }
  }

  private async requireProjectRole(
    context: MutationContext,
    projectId: string,
    roles: ProjectRole[],
  ) {
    const result = await this.pool.query<{ role: ProjectRole }>(
      `select m.role from project_memberships m join auth_users u on u.id = m.user_id
       where m.project_id = $1 and m.user_id = $2 and u.status = 'active'`,
      [projectId, context.actorId],
    );
    if (!result.rows[0] || !roles.includes(result.rows[0].role)) {
      await this.insertAudit(this.pool, {
        actorId: context.actorId,
        action: "authorization.project",
        resourceType: "project",
        resourceId: projectId,
        outcome: "denied",
        requestId: context.requestId,
        metadata: {
          requiredRoles: roles,
          actualRole: result.rows[0]?.role ?? null,
        },
      });
      throw new AuthoringError(
        "Forbidden",
        "当前账户没有此项目操作权限。",
        403,
      );
    }
  }

  private async withIdempotency<T>(
    context: MutationContext,
    scope: string,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        `${context.actorId}:${scope}:${context.idempotencyKey}`,
      ]);
      const existing = await client.query<{
        request_hash: string;
        response_body: T;
      }>(
        `select request_hash, response_body from idempotency_keys
         where actor_id = $1 and scope = $2 and idempotency_key = $3 and expires_at > now()`,
        [context.actorId, scope, context.idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== context.requestHash) {
          throw new AuthoringError(
            "IdempotencyConflict",
            "同一幂等键已用于不同请求。",
            409,
          );
        }
        await client.query("commit");
        return existing.rows[0].response_body;
      }
      const response = await action(client);
      await client.query(
        `insert into idempotency_keys
         (actor_id, scope, idempotency_key, request_hash, response_status, response_body, expires_at)
         values ($1,$2,$3,$4,200,$5::jsonb,now() + interval '24 hours')`,
        [
          context.actorId,
          scope,
          context.idempotencyKey,
          context.requestHash,
          json(response),
        ],
      );
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertAudit(
    queryable: Pick<Pool, "query"> | Pick<PoolClient, "query">,
    event: {
      actorId: string | null;
      action: string;
      resourceType: string;
      resourceId: string | null;
      outcome: "allowed" | "denied" | "failed";
      requestId: string;
      metadata: Record<string, unknown>;
    },
  ) {
    await queryable.query(
      `insert into audit_events
       (actor_id, action, resource_type, resource_id, outcome, request_id, metadata)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        event.actorId,
        event.action,
        event.resourceType,
        event.resourceId,
        event.outcome,
        event.requestId,
        json(event.metadata),
      ],
    );
  }
}

export function createPostgresAuthoringDataService(
  pool: Pool,
): AuthoringDataService {
  return new PostgresAuthoringDataService(pool);
}
