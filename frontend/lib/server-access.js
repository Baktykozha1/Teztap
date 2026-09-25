import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import policy from "../../shared/access";

export const SESSION_COOKIE = "mercora_session";
export function backendUrl() {
  const configuredUrl = process.env.API_URL || (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:5000");
  if (!configuredUrl) throw new Error("API_URL must point to the TezTap API service in production");
  return configuredUrl.replace(/\/$/, "");
}

export async function serverUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const response = await fetch(`${backendUrl()}/api/me`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000)
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Account access could not be verified");
  return (await response.json()).user;
}

export async function authorizePage(feature) {
  let user;
  try { user = await serverUser(); }
  catch { redirect(`/upgrade?feature=${encodeURIComponent(feature)}&unavailable=1`); }
  if (!policy.canAccessFeature(user, feature)) redirect(`/upgrade?feature=${encodeURIComponent(feature)}`);
  return user;
}
