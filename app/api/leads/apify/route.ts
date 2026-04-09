import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const DATASET_ID = 'fjaDn5Dy86skoMrAQ';

interface ApifyItem {
  username?: string;
  ownerUsername?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  url?: string;
  profileUrl?: string;
  inputUrl?: string;
  [key: string]: unknown;
}

export async function GET() {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'APIFY_API_KEY niet ingesteld' }, { status: 500 });
  }

  let items: ApifyItem[];
  try {
    const resp = await fetch(
      `https://api.apify.com/v2/datasets/${DATASET_ID}/items?token=${apiKey}&clean=true&format=json`,
      { next: { revalidate: 0 } }
    );
    if (!resp.ok) {
      return NextResponse.json({ error: `Apify API fout: ${resp.status}` }, { status: 502 });
    }
    items = await resp.json() as ApifyItem[];
  } catch (err) {
    return NextResponse.json({ error: `Fetch mislukt: ${(err as Error).message}` }, { status: 502 });
  }

  // Deduplicate op username binnen de dataset zelf
  const seen = new Set<string>();
  const unique = items.filter(item => {
    const handle = (item.username ?? item.ownerUsername ?? '').toLowerCase().trim();
    if (!handle || seen.has(handle)) return false;
    seen.add(handle);
    return true;
  });

  let imported = 0;
  let skipped = 0;

  for (const item of unique) {
    const instagramHandle = (item.username ?? item.ownerUsername ?? '').replace(/^@/, '');
    if (!instagramHandle) { skipped++; continue; }

    // Splits volledige naam
    const parts = (item.fullName ?? '').trim().split(/\s+/);
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ');

    try {
      const rows = await query<{ id: number }>(
        `INSERT INTO leads (first_name, last_name, instagram_handle, niche, source, status)
         VALUES ($1, $2, $3, 'moslim vrouwen brands NL', 'apify', 'te_contacteren')
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [firstName, lastName, instagramHandle]
      );
      // ON CONFLICT op email werkt niet voor leads zonder email — check op instagram_handle
      if (!rows.length) {
        const existing = await query(
          'SELECT id FROM leads WHERE instagram_handle = $1',
          [instagramHandle]
        );
        if (existing.length) { skipped++; continue; }

        // Geen conflict op email, toch niet ingevoegd — insert zonder email constraint
        await query(
          `INSERT INTO leads (first_name, last_name, instagram_handle, niche, source, status)
           VALUES ($1, $2, $3, 'moslim vrouwen brands NL', 'apify', 'te_contacteren')`,
          [firstName, lastName, instagramHandle]
        );
      }
      imported++;
    } catch {
      skipped++;
    }
  }

  console.log(`[apify] ${imported} leads geïmporteerd, ${skipped} overgeslagen van ${items.length} items`);
  return NextResponse.json({ imported, skipped, total: items.length });
}
