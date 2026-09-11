import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { getSessionUserFromToken } from "@/lib/users";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/auth/me — who is the current logged-in dashboard user?
export async function GET(req: NextRequest): Promise<NextResponse> {
  const me = await getSessionUserFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ id: me.id, username: me.username, role: me.role });
}
