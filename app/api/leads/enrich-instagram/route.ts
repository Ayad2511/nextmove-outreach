import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const ACTOR_ID = 'apify/instagram-scraper';

interface InstagramPost {
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  timestamp?: string;
  hashtags?: string[];
  type?: string;
}

interface InstagramProfile {
  username?: string;
  fullName?: string;
  biography?: string;
  externalUrl?: string;
  highlightsCount?: number;
  latestPosts?: InstagramPost[];
  // highlight reels
  highlights?: { title?: string }[];
}

async function runApifySync(input: Record<string, unknown>, waitSecs = 180): Promise<unknown[]> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) return [];

  const resp = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/runs?token=${apiKey}&waitForFinish=${waitSecs}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  if (!resp.ok) {
    console.error(`[enrich-instagram] Apify fout: ${resp.status} ${await resp.text()}`);
    return [];
  }

  const run = await resp.json() as { data?: { defaultDatasetId?: string } };
  const datasetId = run.data?.defaultDatasetId;
  if (!datasetId) return [];

  const apiKey2 = process.env.APIFY_API_KEY;
  const dataResp = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey2}&clean=true&limit=50`
  );
  if (!dataResp.ok) return [];
  return dataResp.json();
}

// POST /api/leads/enrich-instagram
// Haalt laatste posts, bio, highlights op per lead via Apify instagram-scraper
// Slaat alles op als instagram_data JSONB in de database
export async function POST() {
  if (!process.env.APIFY_API_KEY) {
    return NextResponse.json({ error: 'APIFY_API_KEY niet ingesteld' }, { status: 500 });
  }

  // Leads die nog geen instagram_data hebben of waarvan de data ouder is dan 7 dagen
  const leads = await query<{ id: number; instagram_handle: string; owner_instagram: string }>(
    `SELECT id, instagram_handle, owner_instagram FROM leads
     WHERE instagram_handle IS NOT NULL AND instagram_handle != ''
       AND (
         instagram_data IS NULL
         OR (updated_at < NOW() - INTERVAL '7 days' AND instagram_data IS NOT NULL)
       )
       AND status NOT IN ('niet_geinteresseerd')
     ORDER BY created_at ASC
     LIMIT 20`
  );

  if (!leads.length) {
    return NextResponse.json({ message: 'Geen leads te verrijken met Instagram data', enriched: 0 });
  }

  // Gebruik owner_instagram als beschikbaar (persoonlijk account), anders bedrijfsaccount
  const targets = leads.map(l => {
    const handle = (l.owner_instagram ?? l.instagram_handle).replace(/^@/, '');
    return { leadId: l.id, handle };
  });

  const profileUrls = targets.map(t => `https://www.instagram.com/${t.handle}/`);

  // Scrape profielen + recente posts in één Apify run
  const items = await runApifySync({
    directUrls: profileUrls,
    resultsType: 'posts',
    resultsLimit: 10,
    addParentData: true,
    scrapeStories: false,  // stories vereisen login
  }) as (InstagramPost & { ownerUsername?: string; owner?: { username?: string } })[];

  // Groepeer posts per username
  const postsByHandle = new Map<string, InstagramPost[]>();
  for (const item of items) {
    const handle = (item.ownerUsername ?? item.owner?.username ?? '').toLowerCase();
    if (!handle) continue;
    if (!postsByHandle.has(handle)) postsByHandle.set(handle, []);
    postsByHandle.get(handle)!.push({
      caption: item.caption?.slice(0, 300),
      likesCount: item.likesCount,
      commentsCount: item.commentsCount,
      timestamp: item.timestamp,
      hashtags: item.hashtags?.slice(0, 10),
    });
  }

  // Scrape ook profiel data (bio, highlights)
  const profileItems = await runApifySync({
    directUrls: profileUrls,
    resultsType: 'details',
    resultsLimit: leads.length,
  }) as InstagramProfile[];

  const profilesByHandle = new Map<string, InstagramProfile>();
  for (const profile of profileItems) {
    const handle = profile.username?.toLowerCase();
    if (handle) profilesByHandle.set(handle, profile);
  }

  let enriched = 0;

  for (const target of targets) {
    const handle = target.handle.toLowerCase();
    const posts = postsByHandle.get(handle) ?? [];
    const profile = profilesByHandle.get(handle);

    const instagramData = {
      bio: profile?.biography ?? null,
      fullName: profile?.fullName ?? null,
      externalUrl: profile?.externalUrl ?? null,
      highlightTitles: profile?.highlights?.map(h => h.title).filter(Boolean) ?? [],
      recentPosts: posts.slice(0, 10),
      scrapedAt: new Date().toISOString(),
    };

    await query(
      `UPDATE leads SET
         instagram_data = $1,
         updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(instagramData), target.leadId]
    );
    enriched++;
  }

  console.log(`[enrich-instagram] ${enriched} leads verrijkt met Instagram data`);
  return NextResponse.json({ enriched, total: leads.length });
}
