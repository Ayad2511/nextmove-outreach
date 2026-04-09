import { NextRequest, NextResponse } from 'next/server';

// Beveilig de cron endpoint met een geheime header
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // Dev: geen secret vereist
  return req.headers.get('x-cron-secret') === secret;
}

// Dagelijkse cron volgorde (NL tijd):
// 07:00 — lead enrichment (owner naam + persoonlijk IG + email via Apify, max 20)
// 08:00 — Apify Instagram scrape (nieuwe leads)
// 09:00 — Lemlist email sequence (max 40, onafhankelijk van warming)
// 10:00 — Phantombuster Auto Liker (verrijkte leads, warming stap 1)
// 10:30 — Phantombuster Story Viewer (liked leads → warmed, optioneel)
// 11:00 — Instagram DM bericht 1 (alleen warmed/liked leads, naar persoonlijk account, max 7)
// 12:00 — Instagram DM followup bericht 2 (replied + video_url, max 7)
// 13:00 — LinkedIn connect (max 15, onafhankelijk van Instagram)

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const job = searchParams.get('job') ?? 'daily_outreach';

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const results: Record<string, unknown> = {};

  // 07:00 — Lead enrichment
  if (job === 'enrich' || job === 'daily_outreach') {
    const r = await fetch(`${baseUrl}/api/leads/enrich`, { method: 'POST' });
    results.enrich = await r.json();
  }

  // 08:00 — Apify Instagram scrape (nieuwe leads)
  if (job === 'sync_apify' || job === 'daily_outreach') {
    const r = await fetch(`${baseUrl}/api/leads/apify`);
    results.apify = await r.json();
  }

  // Clay sync (optioneel)
  if (job === 'sync_leads') {
    const r = await fetch(`${baseUrl}/api/leads/sync`, { method: 'POST' });
    results.sync = await r.json();
  }

  // 09:00 — Email campagne via Lemlist (3-staps sequence, onafhankelijk)
  if (job === 'email' || job === 'daily_outreach') {
    const r = await fetch(`${baseUrl}/api/campaigns/email`, { method: 'POST' });
    results.email = await r.json();
  }

  // 10:00 — Phantombuster Auto Liker (warming stap 1)
  if (job === 'instagram_like' || job === 'daily_outreach') {
    const r = await fetch(`${baseUrl}/api/instagram/like`, { method: 'POST' });
    results.instagram_like = await r.json();
  }

  // 10:30 — Phantombuster Story Viewer (warming stap 2, optioneel)
  if (job === 'instagram_story' || job === 'daily_outreach') {
    const r = await fetch(`${baseUrl}/api/instagram/story`, { method: 'POST' });
    results.instagram_story = await r.json();
  }

  // 11:00 — Instagram DM bericht 1 (alleen warmed/liked, naar persoonlijk account)
  if (job === 'instagram_dm' || job === 'daily_outreach') {
    const r = await fetch(`${baseUrl}/api/instagram/dm`, { method: 'POST' });
    results.instagram_dm = await r.json();
  }

  // 12:00 — Instagram DM followup bericht 2 (replied + video_url)
  if (job === 'instagram_followup' || job === 'daily_outreach') {
    const r = await fetch(`${baseUrl}/api/instagram/dm/followup`, { method: 'POST' });
    results.instagram_followup = await r.json();
  }

  // 13:00 — LinkedIn connect (onafhankelijk van Instagram)
  if (job === 'linkedin' || job === 'daily_outreach') {
    const r = await fetch(`${baseUrl}/api/campaigns/linkedin`, { method: 'POST' });
    results.linkedin = await r.json();
  }

  // HeyGen video generatie
  if (job === 'generate_videos') {
    const r = await fetch(`${baseUrl}/api/video/generate`, { method: 'POST' });
    results.videos = await r.json();
  }

  // Inbox sync
  if (job === 'sync_inbox') {
    const r = await fetch(`${baseUrl}/api/inbox`, { method: 'POST' });
    results.inbox = await r.json();
  }

  console.log(`[cron] Job '${job}' voltooid:`, JSON.stringify(results));
  return NextResponse.json({ job, results, timestamp: new Date().toISOString() });
}
