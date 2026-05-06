import { cookies } from "next/headers";
import { getJwtSecret } from "../env";
import { getCookieName, verifySessionToken } from "./jwt";

export async function getSessionUser(): Promise<{
  id: string;
  email: string;
} | null> {
  const jar = await cookies();
  const token = jar.get(getCookieName())?.value;
  if (!token) {
    return null;
  }
  const payload = await verifySessionToken(token, getJwtSecret());
  if (!payload) {
    return null;
  }
  return { id: payload.sub, email: payload.email };
}
