import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const DAILY_LIMIT = 20;

// Apify actor IDs
const PROFILE_SCRAPER = 'apify/instagram-profile-scraper';
const EMAIL_SCRAPER   = 'jurassic_jove/instagram-email-scraper';

interface ApifyProfile {
  username?: string;
  fullName?: string;
  biography?: string;
  email?: string;
  externalUrl?: string;
  businessEmail?: string;
  publicEmail?: string;
}

// Haalt @mentions op uit bio — eerste mention is vaak persoonlijk account van owner
function extractOwnerInstagram(bio: string): string | null {
  const matches = bio.match(/@([A-Za-z0-9._]+)/g);
  if (!matches?.length) return null;
  // Filter gemeenschappelijke woorden die geen handles zijn
  const skip = new Set(['gmail', 'hotmail', 'yahoo', 'outlook']);
  for (const m of matches) {
    const handle = m.slice(1).toLowerCase();
    if (!skip.has(handle) && handle.length > 2) return m.slice(1);
  }
  return null;
}

// Eerste voornaam extractie uit volledige naam of bio
function extractFirstName(fullName: string | undefined, bio: string): string {
  if (fullName) return fullName.split(/\s+/)[0];
  // Probeer naam uit bio (bijv. "Hi, I'm Fatima 👋")
  const m = bio.match(/(?:i['']m|ik ben|hoi,?\s+ik\s+ben)\s+([A-Z][a-z]+)/i);
  return m?.[1] ?? '';
}

async function runApify(
  actorId: string,
  input: Record<string, unknown>,
  waitSecs = 120
): Promise<unknown[]> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) return [];

  const resp = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${apiKey}&waitForFinish=${waitSecs}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  if (!resp.ok) {
    console.error(`[enrich] Apify ${actorId} fout: ${resp.status}`);
    return [];
  }

  const run = await resp.json() as { data?: { defaultDatasetId?: string } };
  const datasetId = run.data?.defaultDatasetId;
  if (!datasetId) return [];

  const dataResp = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&clean=true`
  );
  if (!dataResp.ok) return [];
  return dataResp.json();
}

// POST /api/leads/enrich — max 20 leads per dag
export async function POST() {
  if (!process.env.APIFY_API_KEY) {
    return NextResponse.json({ error: 'APIFY_API_KEY niet ingesteld' }, { status: 500 });
  }

  // Dagelijks limiet check
  const [limitRow] = await query<{ count: string }>(
    `SELECT COALESCE(count, 0) as count FROM daily_limits WHERE date = CURRENT_DATE AND channel = 'enrich'`
  );
  const todayCount = parseInt(limitRow?.count ?? '0');
  const remaining = Math.max(0, DAILY_LIMIT - todayCount);

  if (remaining === 0) {
    return NextResponse.json({ message: `Dagelijks enrichment limiet (${DAILY_LIMIT}) bereikt`, enriched: 0 });
  }

  // Leads die nog niet verrijkt zijn (status = 'new' of 'te_contacteren', instagram_handle aanwezig)
  const leads = await query<{
    id: number; instagram_handle: string; first_name: string; last_name: string;
  }>(
    `SELECT id, instagram_handle, first_name, last_name FROM leads
     WHERE instagram_handle IS NOT NULL AND instagram_handle != ''
       AND (owner_instagram IS NULL OR owner_instagram = '')
       AND status IN ('new', 'te_contacteren')
     ORDER BY created_at ASC
     LIMIT $1`,
    [remaining]
  );

  if (!leads.length) {
    return NextResponse.json({ message: 'Geen leads te verrijken', enriched: 0 });
  }

  const usernames = leads.map(l => l.instagram_handle.replace(/^@/, ''));

  // 1. Scrape Instagram profielen
  const profiles = await runApify(PROFILE_SCRAPER, {
    usernames,
    resultsLimit: usernames.length,
  }) as ApifyProfile[];

  // 2. Email scraper als fallback
  const profileUrls = usernames.map(u => `https://www.instagram.com/${u}/`);
  const emailData = await runApify(EMAIL_SCRAPER, {
    directUrls: profileUrls,
  }) as { username?: string; email?: string }[];

  const emailMap = new Map(emailData.map(e => [e.username?.toLowerCase(), e.email]));

  let enriched = 0;

  for (const lead of leads) {
    const handle = lead.instagram_handle.replace(/^@/, '').toLowerCase();
    const profile = profiles.find(p => p.username?.toLowerCase() === handle);
    if (!profile) continue;

    const bio = profile.biography ?? '';
    const ownerInstagram = extractOwnerInstagram(bio) ?? handle; // fallback naar bedrijfsaccount
    const ownerName = profile.fullName
      ? extractFirstName(profile.fullName, bio)
      : (lead.first_name ?? '');

    const email = profile.email ?? profile.businessEmail ?? profile.publicEmail
      ?? emailMap.get(handle) ?? null;

    await query(
      `UPDATE leads SET
         owner_name       = COALESCE($1, owner_name),
         owner_instagram  = COALESCE($2, owner_instagram),
         email            = COALESCE(NULLIF($3, ''), email),
         status           = CASE WHEN status IN ('new', 'te_contacteren') THEN 'enriched' ELSE status END,
         updated_at       = NOW()
       WHERE id = $4`,
      [ownerName || null, ownerInstagram || null, email || null, lead.id]
    );
    enriched++;
  }

  await query(
    `INSERT INTO daily_limits (date, channel, count) VALUES (CURRENT_DATE, 'enrich', $1)
     ON CONFLICT (date, channel) DO UPDATE SET count = daily_limits.count + $1`,
    [enriched]
  );

  console.log(`[enrich] ${enriched} leads verrijkt`);
  return NextResponse.json({ enriched, total: leads.length });
}
