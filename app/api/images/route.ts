import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ~2.5 MB decoded cap — email headers should be optimized well under this.
const MAX_BYTES = 2_500_000;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

// GET /api/images — list uploaded images (newest first) for reuse in the builder.
export async function GET(): Promise<NextResponse> {
  const res = await db.execute(
    "SELECT id, name, mime, size, created_at FROM images ORDER BY created_at DESC LIMIT 200"
  );
  return NextResponse.json(res.rows);
}

// POST /api/images — { name, mime, dataBase64 }. Stores the image and returns a
// stable absolute URL the email can reference.
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { name?: string; mime?: string; dataBase64?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const mime = String(body.mime ?? "").toLowerCase();
  const dataBase64 = String(body.dataBase64 ?? "");
  const name = String(body.name ?? "").slice(0, 200);

  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ error: "Only PNG, JPEG, GIF or WebP images are allowed" }, { status: 400 });
  }
  if (!dataBase64) {
    return NextResponse.json({ error: "No image data received" }, { status: 400 });
  }

  // Decoded size = base64 length * 3/4 (minus padding). Reject oversized uploads.
  const approxBytes = Math.floor((dataBase64.length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image is too large (${(approxBytes / 1_000_000).toFixed(1)} MB). Please keep it under 2.5 MB.` },
      { status: 413 }
    );
  }

  const result = await db.execute({
    sql: "INSERT INTO images (name, mime, data, size) VALUES (?, ?, ?, ?)",
    args: [name, mime, dataBase64, approxBytes],
  });

  const id = Number(result.lastInsertRowid);
  const url = `${req.nextUrl.origin}/api/images/${id}`;
  return NextResponse.json({ id, url, name, mime, size: approxBytes });
}

// DELETE /api/images — { id }. Remove an uploaded image.
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { id } = (await req.json().catch(() => ({}))) as { id?: number };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.execute({ sql: "DELETE FROM images WHERE id = ?", args: [Number(id)] });
  return NextResponse.json({ success: true });
}
