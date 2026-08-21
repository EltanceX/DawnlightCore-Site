import type { Pool } from "pg";

export type SearchKind =
  "project" | "version" | "diagnostic" | "catalog" | "capability";

export type SearchQuery = {
  q?: string;
  kind?: SearchKind;
  contractVersion?: string;
  core?: string;
  gameApi?: string;
  platform?: string;
  architecture?: string;
  gpu?: string;
  channel?: string;
  license?: string;
  cursor?: string;
  limit?: number;
};

export type SearchItem = {
  kind: SearchKind;
  id: string;
  title: string;
  summary: string;
  url: string;
  version: string | null;
  status: string;
  core: string | null;
  gameApi: string | null;
};

export type SearchResponse = {
  items: SearchItem[];
  nextCursor: string | null;
  facets: Record<string, string[]>;
};

export interface SearchDataService {
  search(query: SearchQuery): Promise<SearchResponse>;
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return 0;
  try {
    const offset = Number(Buffer.from(cursor, "base64url").toString("utf8"));
    return Number.isInteger(offset) && offset >= 0 && offset <= 100_000
      ? offset
      : 0;
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number) {
  return Buffer.from(String(offset)).toString("base64url");
}

function normalized(value: string | undefined, max: number) {
  if (!value) return null;
  const result = value.trim().slice(0, max);
  return result.length > 0 ? result : null;
}

export class PostgresSearchDataService implements SearchDataService {
  constructor(private readonly pool: Pool) {}

  async search(query: SearchQuery): Promise<SearchResponse> {
    const q = normalized(query.q, 160);
    const contractVersion = normalized(query.contractVersion, 120);
    const core = normalized(query.core, 80);
    const gameApi = normalized(query.gameApi, 80);
    const platform = normalized(query.platform, 40);
    const architecture = normalized(query.architecture, 40);
    const gpu = normalized(query.gpu, 80);
    const channel = normalized(query.channel, 40);
    const license = normalized(query.license, 80);
    const kind = query.kind ?? null;
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const offset = decodeCursor(query.cursor);
    const params: unknown[] = [
      q ? `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%` : null,
      kind,
      contractVersion,
      core,
      gameApi,
      platform,
      architecture,
      gpu,
      channel,
      license,
      offset,
      limit + 1,
    ];
    const result = await this.pool.query<SearchItem>(
      `with results as (
        select 'project'::text as kind, p.id, p.name as title, p.summary,
          '/zh-CN/shaders/' || p.slug || '/' as url, v.version, v.status,
          v.core_commit as core, v.game_api_tag as "gameApi"
        from directory_projects p
        left join lateral (
          select v.id, v.version, v.status, v.core_commit, v.game_api_tag,
            v.channel, v.contract_version
          from directory_project_versions v
          where v.project_id = p.id and v.status = 'available'
          order by v.version desc limit 1
        ) v on true
        left join directory_licenses l on l.id = p.license_id
        where p.visibility = 'published' and p.status = 'available' and v.id is not null
          and ($1::text is null or (p.slug || ' ' || p.name || ' ' || p.summary || ' ' || coalesce(v.version, '') || ' ' || coalesce(v.core_commit, '')) ilike $1 escape '\\')
          and ($2::text is null or $2 = 'project')
          and ($3::text is null or v.contract_version = $3)
          and ($4::text is null or v.core_commit like $4 || '%')
          and ($5::text is null or v.game_api_tag = $5)
          and ($6::text is null or exists (select 1 from directory_compatibilities c where c.project_version_id = v.id and $6 = any(c.platforms)))
          and ($7::text is null or exists (select 1 from directory_compatibilities c where c.project_version_id = v.id and $7 = any(c.architectures)))
          and ($8::text is null or exists (select 1 from directory_compatibilities c where c.project_version_id = v.id and $8 = any(c.gpu_classes)))
          and ($9::text is null or v.channel = $9)
          and ($10::text is null or coalesce(l.spdx_id, l.status) = $10)
        union all
        select 'version'::text, v.id, p.name || ' ' || v.version, p.summary,
          '/zh-CN/shaders/' || p.slug || '/?version=' || v.version, v.version, v.status,
          v.core_commit as core, v.game_api_tag as "gameApi"
        from directory_project_versions v
        join directory_projects p on p.id = v.project_id
        left join directory_licenses l on l.id = p.license_id
        where p.visibility = 'published' and p.status = 'available' and v.status = 'available'
          and ($1::text is null or (p.slug || ' ' || p.name || ' ' || p.summary || ' ' || v.version || ' ' || v.core_commit || ' ' || v.game_api_tag) ilike $1 escape '\\')
          and ($2::text is null or $2 = 'version')
          and ($3::text is null or v.contract_version = $3)
          and ($4::text is null or v.core_commit like $4 || '%')
          and ($5::text is null or v.game_api_tag = $5)
          and ($6::text is null or exists (select 1 from directory_compatibilities c where c.project_version_id = v.id and $6 = any(c.platforms)))
          and ($7::text is null or exists (select 1 from directory_compatibilities c where c.project_version_id = v.id and $7 = any(c.architectures)))
          and ($8::text is null or exists (select 1 from directory_compatibilities c where c.project_version_id = v.id and $8 = any(c.gpu_classes)))
          and ($9::text is null or v.channel = $9)
          and ($10::text is null or coalesce(l.spdx_id, l.status) = $10)
        union all
        select 'diagnostic'::text, d.entry_id, d.code, d.diagnostic_group,
          '/zh-CN/tools/diagnostics/' || d.code || '/', d.entry_version, d.status,
          null::text, null::text
        from contract_diagnostics d
        join contract_versions cv on cv.version = d.contract_version
        where cv.is_active and cv.status <> 'unavailable'
          and ($1::text is null or (d.code || ' ' || d.entry_id || ' ' || d.diagnostic_group) ilike $1 escape '\\')
          and ($2::text is null or $2 = 'diagnostic')
          and ($3::text is null or d.contract_version = $3)
        union all
        select 'catalog'::text, c.entry_id, c.entry_id, c.catalog_kind,
          '/zh-CN/tools/catalog/?q=' || c.entry_id, c.entry_version, c.status,
          null::text, null::text
        from contract_catalog_entries c
        join contract_versions cv on cv.version = c.contract_version
        where cv.is_active and cv.status <> 'unavailable'
          and ($1::text is null or (c.entry_id || ' ' || c.catalog_kind) ilike $1 escape '\\')
          and ($2::text is null or $2 = 'catalog')
          and ($3::text is null or c.contract_version = $3)
        union all
        select 'capability'::text, c.entry_id, c.entry_id, 'capability',
          '/zh-CN/tools/capabilities/?q=' || c.entry_id, c.entry_version, c.status,
          null::text, null::text
        from contract_capabilities c
        join contract_versions cv on cv.version = c.contract_version
        where cv.is_active and cv.status <> 'unavailable'
          and ($1::text is null or c.entry_id ilike $1 escape '\\')
          and ($2::text is null or $2 = 'capability')
          and ($3::text is null or c.contract_version = $3)
      )
      select kind, id, title, summary, url, version, status, core, "gameApi"
      from results order by lower(title), kind, id offset $11 limit $12`,
      params,
    );
    const items = result.rows.slice(0, limit);
    const facets = await this.facets();
    return {
      items,
      nextCursor:
        result.rows.length > limit ? encodeCursor(offset + limit) : null,
      facets,
    };
  }

  private async facets() {
    const result = await this.pool.query<{
      channels: string[] | null;
      game_apis: string[] | null;
      platforms: string[] | null;
      architectures: string[] | null;
      gpu_classes: string[] | null;
      licenses: string[] | null;
    }>(
      `with public_projects as (
         select id, license_id from directory_projects
         where visibility = 'published' and status = 'available'
       ), public_versions as (
         select v.id, v.channel, v.game_api_tag
         from directory_project_versions v
         join public_projects p on p.id = v.project_id
         where v.status = 'available'
       )
       select
        (select array_agg(distinct channel order by channel) from public_versions) as channels,
        (select array_agg(distinct game_api_tag order by game_api_tag) from public_versions) as game_apis,
        (select array_agg(distinct value order by value) from directory_compatibilities c join public_versions v on v.id = c.project_version_id, unnest(c.platforms) value where c.status = 'compatible') as platforms,
        (select array_agg(distinct value order by value) from directory_compatibilities c join public_versions v on v.id = c.project_version_id, unnest(c.architectures) value where c.status = 'compatible') as architectures,
        (select array_agg(distinct value order by value) from directory_compatibilities c join public_versions v on v.id = c.project_version_id, unnest(c.gpu_classes) value where c.status = 'compatible') as gpu_classes,
        (select array_agg(distinct coalesce(l.spdx_id, l.status) order by coalesce(l.spdx_id, l.status)) from directory_licenses l join public_projects p on p.license_id = l.id) as licenses`,
    );
    const row = result.rows[0];
    return {
      channel: row?.channels ?? [],
      gameApi: row?.game_apis ?? [],
      platform: row?.platforms ?? [],
      architecture: row?.architectures ?? [],
      gpu: row?.gpu_classes ?? [],
      license: row?.licenses ?? [],
    };
  }
}

export function createPostgresSearchDataService(pool: Pool) {
  return new PostgresSearchDataService(pool);
}
