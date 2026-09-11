import { NextResponse } from "next/server";
import { deleteConnection } from "@/lib/token";

const ADMIN_USER_ID = 1;

/**
 * POST /api/auth/disconnect
 * Deletes the stored Top Echelon connection and all tokens for the admin user.
 */
export async function POST(): Promise<NextResponse> {
  await deleteConnection(ADMIN_USER_ID);
  return NextResponse.json({ success: true });
}
