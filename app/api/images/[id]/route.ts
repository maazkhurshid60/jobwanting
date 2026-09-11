import { NextRequest } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/images/[id] — serve the stored image bytes with a long cache header,
// so emails and the builder preview can reference it by a stable public URL.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await db.execute({
    sql: "SELECT mime, data FROM images WHERE id = ?",
    args: [Number(id)],
  });
  const row = res.rows[0];
  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = Buffer.from(String(row.data), "base64");
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": String(row.mime) || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(bytes.length),
    },
  });
}
