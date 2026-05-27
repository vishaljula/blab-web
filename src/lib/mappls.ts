/**
 * Shared Mappls (MapMyIndia) utilities.
 *
 * Server-side only — uses environment variables for OAuth.
 */

const CLIENT_ID = process.env.MAPPLS_CLIENT_ID || "";
const CLIENT_SECRET = process.env.MAPPLS_CLIENT_SECRET || "";

// In-memory token cache (per serverless instance)
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Returns a valid Mappls OAuth access token, reusing cached tokens
 * when possible (with a 60-second safety buffer before expiry).
 */
export async function getMapplsAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const res = await fetch("https://outpost.mappls.com/api/security/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(CLIENT_SECRET)}`,
  });

  if (!res.ok) {
    throw new Error(`Mappls OAuth failed: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 86400) * 1000,
  };
  return cachedToken.token;
}
