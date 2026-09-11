import { NextResponse } from "next/server";
import { promises as dns } from "dns";
import db from "@/lib/db";

async function hasMxRecord(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

// POST /api/contacts/validate — MX-check all active contacts, mark invalid ones
export async function POST(): Promise<NextResponse> {
  const result = await db.execute(
    "SELECT id, email FROM contacts WHERE status = 'active' OR status IS NULL"
  );
  const contacts = result.rows as unknown as { id: number; email: string }[];

  // Deduplicate domains so we only check each domain once
  const domainCache = new Map<string, boolean>();
  let invalid = 0;
  let valid = 0;

  for (const c of contacts) {
    const domain = (c.email as string).split("@")[1]?.toLowerCase();
    if (!domain) {
      await db.execute({ sql: "UPDATE contacts SET status = 'invalid' WHERE id = ?", args: [c.id] });
      invalid++;
      continue;
    }

    if (!domainCache.has(domain)) {
      domainCache.set(domain, await hasMxRecord(domain));
    }

    if (domainCache.get(domain)) {
      valid++;
    } else {
      await db.execute({ sql: "UPDATE contacts SET status = 'invalid' WHERE id = ?", args: [c.id] });
      await db.execute({
        sql: "INSERT OR IGNORE INTO suppression_list (email, reason) VALUES (?, 'invalid_domain')",
        args: [(c.email as string).toLowerCase()],
      });
      invalid++;
    }
  }

  return NextResponse.json({ checked: contacts.length, valid, invalid });
}
