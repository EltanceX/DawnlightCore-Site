import * as client from "openid-client";
import type { OidcIdentity } from "@dawnlight/database";

export type OidcStart = {
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
  nonce: string;
};

export interface OidcClient {
  createAuthorizationRequest(): Promise<OidcStart>;
  consumeAuthorizationResponse(
    callbackUrl: URL,
    transaction: { state: string; codeVerifier: string; nonce: string },
  ): Promise<OidcIdentity>;
}

export type OidcClientOptions = {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function createOidcClient(options: OidcClientOptions): OidcClient {
  let configuration: Promise<client.Configuration> | undefined;
  const getConfiguration = () => {
    configuration ??= client.discovery(
      new URL(options.issuerUrl),
      options.clientId,
      options.clientSecret,
    );
    return configuration;
  };

  return {
    async createAuthorizationRequest() {
      const config = await getConfiguration();
      const state = client.randomState();
      const nonce = client.randomNonce();
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge =
        await client.calculatePKCECodeChallenge(codeVerifier);
      const authorizationUrl = client.buildAuthorizationUrl(config, {
        redirect_uri: options.redirectUri,
        scope: "openid profile email",
        response_type: "code",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });
      return {
        authorizationUrl: authorizationUrl.href,
        state,
        nonce,
        codeVerifier,
      };
    },

    async consumeAuthorizationResponse(callbackUrl, transaction) {
      const config = await getConfiguration();
      const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
        expectedState: transaction.state,
        expectedNonce: transaction.nonce,
        pkceCodeVerifier: transaction.codeVerifier,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (
        !claims?.sub ||
        typeof claims.email !== "string" ||
        claims.email_verified !== true
      ) {
        throw new Error(
          "OIDC provider must return a stable subject and a verified email claim.",
        );
      }
      const displayName =
        typeof claims.name === "string" && claims.name.trim().length > 0
          ? claims.name.trim()
          : claims.email;
      return {
        issuer: typeof claims.iss === "string" ? claims.iss : options.issuerUrl,
        subject: claims.sub,
        displayName,
        email: claims.email,
      };
    },
  };
}
