import type { components } from "./generated.js";

export const apiVersion = "v1" as const;

export type HealthLiveResponse = components["schemas"]["HealthLiveResponse"];
export type DependencyCheck = components["schemas"]["DependencyCheck"];
export type HealthReadyResponse = components["schemas"]["HealthReadyResponse"];
export type ContractSummary = components["schemas"]["ContractSummary"];
export type DiagnosticRecord = components["schemas"]["DiagnosticRecord"];
export type CatalogKind = components["schemas"]["CatalogKind"];
export type CatalogRecord = components["schemas"]["CatalogRecord"];
export type CapabilityRecord = components["schemas"]["CapabilityRecord"];
export type GraphRecord = components["schemas"]["GraphRecord"];
export type VariantRecord = components["schemas"]["VariantRecord"];
export type ContractDiff = components["schemas"]["ContractDiff"];
export type DirectoryProjectView =
  components["schemas"]["DirectoryProjectView"];
export type DirectoryProjectVersion =
  components["schemas"]["DirectoryProjectVersion"];
export type DirectoryArtifact = components["schemas"]["DirectoryArtifact"];
export type DirectoryCompatibility =
  components["schemas"]["DirectoryCompatibility"];
export type DirectoryImage = components["schemas"]["DirectoryImage"];
export type DirectoryLicense = components["schemas"]["DirectoryLicense"];
export type DirectoryRecommendation =
  components["schemas"]["DirectoryRecommendation"];
export type AuthUser = components["schemas"]["AuthUser"];
export type SessionPrincipal = components["schemas"]["SessionPrincipal"];
export type AuthorProject = components["schemas"]["AuthorProject"];
export type AuthorVersion = components["schemas"]["AuthorVersion"];
export type AuthorCompatibilityDraft =
  components["schemas"]["AuthorCompatibilityDraft"];
export type AuthorArtifactDeclaration =
  components["schemas"]["AuthorArtifactDeclaration"];
export type InvitationWithToken = components["schemas"]["InvitationWithToken"];
export type AuditEventSummary = components["schemas"]["AuditEventSummary"];
export type AuthorUpload = components["schemas"]["AuthorUpload"];
export type AuthorUploadCreateResponse =
  components["schemas"]["AuthorUploadCreateResponse"];
export type AuthorUploadCompleteResponse =
  components["schemas"]["AuthorUploadCompleteResponse"];
export type PreflightDiagnostic = components["schemas"]["PreflightDiagnostic"];
export type PreflightManifestEntry =
  components["schemas"]["PreflightManifestEntry"];
export type ValidationSection = components["schemas"]["ValidationSection"];
export type LoaderValidationSections =
  components["schemas"]["LoaderValidationSections"];
export type LoaderValidationReport =
  components["schemas"]["LoaderValidationReport"];
export type ReviewSubmission = components["schemas"]["ReviewSubmission"];
export type VersionWorkflow = components["schemas"]["VersionWorkflow"];
export type ReviewDecisionInput = components["schemas"]["ReviewDecisionInput"];
export type SearchItem = components["schemas"]["SearchItem"];
export type SearchResponse = components["schemas"]["SearchResponse"];
export type OperationsReport = components["schemas"]["OperationsReport"];
export type OperationsOverview = components["schemas"]["OperationsOverview"];
export type ApiError = components["schemas"]["ApiError"];

export type { components, operations, paths } from "./generated.js";
