import { NextResponse } from "next/server";
import { signToken, verifyToken } from "@/server/auth/links";
import { SESSION_COOKIE, SESSION_TTL_S } from "@/server/auth/session";
import { appUrl } from "@/server/app-url";

// Signed link → session cookie → the actor's screen. Identity comes only from the token.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const actor = verifyToken((await params).token);
  if (!actor) return NextResponse.redirect(appUrl("/?signin=expired"));

  const where =
    actor.t === "PAYER" ? (actor.pid ? `/payments/${actor.pid}` : "/payments")
    : actor.t === "CONTACT" ? (actor.pid ? `/review/${actor.pid}` : "/review")
    : "/admin";
  const target = appUrl(where);
  const res = NextResponse.redirect(target);
  res.cookies.set(SESSION_COOKIE, signToken({ t: actor.t, id: actor.id }, SESSION_TTL_S), {
    httpOnly: true,
    sameSite: "lax",
    secure: target.protocol === "https:", // the PUBLIC scheme, not the proxy's internal http
    path: "/",
    maxAge: SESSION_TTL_S,
  });
  return res;
}
