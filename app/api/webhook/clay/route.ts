import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// Clay webhook payload — veldnamen komen overeen met de kolomnamen in jouw Clay tabel
// Clay stuurt één row per webhook call als { data: { ...fields }, rowId: "..." }
// of een array { rows: [{ data: {...}, rowId: "..." }] }

interface ClayRow {
  rowId?: string;
  data: {
    // Naam varianten die Clay kan sturen
    firstName?: string;
    first_name?: string;
    lastName?: string;
    last_name?: string;
    name?: string;           // volledige naam als één veld
    // Contact
    email?: string;
    Email?: string;
    // Bedrijf
    companyName?: string;
    company_name?: string;
    company?: string;
    // Social
    instagramUrl?: string;
    instagram_url?: string;
    instagramHandle?: string;
    instagram?: string;
    linkedinUrl?: string;
    linkedin_url?: string;
    linkedin?: string;
    // Extra
    niche?: string;
    [key: string]: unknown;
  };
}

function parseRow(row: ClayRow) {
  const d = row.data;

  // Naam: probeer losse velden, anders splits volledige naam
  let firstName = d.firstName ?? d.first_name ?? '';
  let lastName = d.lastName ?? d.last_name ?? '';
  if (!firstName && !lastName && d.name) {
    const parts = (d.name as string).trim().split(/\s+/);
    firstName = parts[0] ?? '';
    lastName = parts.slice(1).join(' ');
  }

  const email = (d.email ?? d.Email ?? '') as string;
  const companyName = (d.companyName ?? d.company_name ?? d.company ?? '') as string;

  // Instagram: haal handle uit URL als nodig
  let instagramHandle = (d.instagramHandle ?? d.instagram ?? '') as string;
  const instagramUrl = (d.instagramUrl ?? d.instagram_url ?? '') as string;
  if (!instagramHandle && instagramUrl) {
    instagramHandle = instagramUrl
      .replace(/https?:\/\/(www\.)?instagram\.com\/?/, '')
      .replace(/\/$/, '')
      .replace(/^@/, '');
  }

  const linkedinUrl = (d.linkedinUrl ?? d.linkedin_url ?? d.linkedin ?? '') as string;
  const niche = (d.niche ?? 'moslim vrouwen brands NL') as string;
  const clayRowId = row.rowId ?? null;

  return { firstName, lastName, email, companyName, instagramHandle, linkedinUrl, niche, clayRowId };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Ondersteuning voor zowel single row als batch
  const rows: ClayRow[] = [];
  if (Array.isArray((body as { rows?: ClayRow[] }).rows)) {
    rows.push(...(body as { rows: ClayRow[] }).rows);
  } else if ((body as ClayRow).data) {
    rows.push(body as ClayRow);
  } else {
    return NextResponse.json({ error: 'Onbekend Clay webhook formaat' }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const lead = parseRow(row);

    if (!lead.email) {
      skipped++;
      continue;
    }

    try {
      await query(
        `INSERT INTO leads (first_name, last_name, email, company_name, instagram_handle, linkedin_url, niche, source, clay_row_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'clay', $8)
         ON CONFLICT (email) DO UPDATE SET
           first_name       = EXCLUDED.first_name,
           last_name        = EXCLUDED.last_name,
           company_name     = EXCLUDED.company_name,
           instagram_handle = EXCLUDED.instagram_handle,
           linkedin_url     = EXCLUDED.linkedin_url,
           niche            = EXCLUDED.niche,
           updated_at       = NOW()`,
        [lead.firstName, lead.lastName, lead.email, lead.companyName,
         lead.instagramHandle, lead.linkedinUrl, lead.niche, lead.clayRowId]
      );
      imported++;
    } catch (err) {
      errors.push(`${lead.email}: ${(err as Error).message}`);
      skipped++;
    }
  }

  console.log(`[clay-webhook] ${imported} geïmporteerd, ${skipped} overgeslagen`);
  return NextResponse.json({ imported, skipped, errors: errors.length ? errors : undefined });
}
