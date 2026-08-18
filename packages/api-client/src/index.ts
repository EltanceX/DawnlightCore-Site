export const apiVersion = "v1" as const;

export type HealthLiveResponse = {
  status: "ok";
  service: string;
  version: string;
  environment: "development" | "test" | "staging" | "production";
};

export type DependencyCheck = {
  status: "ok" | "degraded" | "failed" | "not-configured";
  detail?: string;
};

export type HealthReadyResponse = {
  status: "ready" | "not-ready";
  service: string;
  version: string;
  checks: {
    database: DependencyCheck;
    objectStorage: DependencyCheck;
  };
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
};
