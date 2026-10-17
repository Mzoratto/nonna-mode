import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type Actor, verifyToken } from "./links";

export const SESSION_COOKIE = "nm_session";
export const SESSION_TTL_S = 24 * 3600;

/** The signed-in actor, read ONLY from the signed session cookie (never from a request body). */
export async function getActor(): Promise<Actor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifyToken(token) : null;
}

export async function requireActor<T extends Actor["t"]>(type: T): Promise<Actor & { t: T }> {
  const a = await getActor();
  if (!a || a.t !== type) redirect("/?signin=required");
  return a as Actor & { t: T };
}
