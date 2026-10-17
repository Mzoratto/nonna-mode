import { NextResponse } from "next/server";
import { appUrl } from "@/server/app-url";
import { SESSION_COOKIE } from "@/server/auth/session";

export async function POST() {
  const res = NextResponse.redirect(appUrl("/"), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
