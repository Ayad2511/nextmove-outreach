import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const DAILY_LIMIT = 7;
const ACTOR_ID = 'rhymed_jellyfish/instagram-dm-automation-messages';

const MESSAGE_2 = `Jazakallah khair voor je reactie 🤍

Hier is de video die ik speciaal voor jullie heb opgenomen → {videoUrl}

Benieuwd wat je ervan vindt. Moge Allah barakah geven aan jullie business 🌙`;

async function getTodayCount(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COALESCE(count, 0) as count FROM daily_limits
     WHERE date = CURRENT_DATE AND channel = 'instagram_apify_followup'`
  );
  return rows.length ? parseInt(rows[0].count) : 0;
}

// POST /api/instagram/dm/followup
// Verstuurt bericht 2 naar leads met status 'replied' die een video_url hebben
// maar nog geen followup ontvangen hebben
export async function POST(req: NextRequest) {
  const apiKey = process.env.APIFY_API_KEY;
  const sessionId = process.env.INSTAGRAM_SESSION_ID;

  if (!apiKey)    return NextResponse.json({ error: 'APIFY_API_KEY niet ingesteld' }, { status: 500 });
  if (!sessionId) return NextResponse.json({ error: 'INSTAGRAM_SESSION_ID niet ingesteld' }, { status: 500 });

  const body = await req.json().catch(() => ({})) as { limit?: number };
  const maxToday = Math.min(body.limit ?? DAILY_LIMIT, DAILY_LIMIT);

  const todayCount = await getTodayCount();
  const remaining = Math.max(0, maxToday - todayCount);

  if (remaining === 0) {
    return NextResponse.json({ message: `Dagelijks followup limiet (${DAILY_LIMIT}) bereikt`, sent: 0 });
  }

  // Leads met: status = 'replied', video_url aanwezig, nog geen followup DM ontvangen
  const leads = await query<{ id: number; instagram_handle: string; heygen_video_url: string }>(
    `SELECT id, instagram_handle, heygen_video_url FROM leads
     WHERE status = 'replied'
       AND heygen_video_url IS NOT NULL AND heygen_video_url != ''
       AND instagram_handle IS NOT NULL AND instagram_handle != ''
       AND id NOT IN (
         SELECT lead_id FROM outreach_log
         WHERE channel = 'instagram_apify_followup' AND success = true
       )
     ORDER BY updated_at ASC
     LIMIT $1`,
    [remaining]
  );

  if (!leads.length) {
    return NextResponse.json({
      message: 'Geen leads beschikbaar voor followup (status=replied + video_url vereist)',
      sent: 0,
    });
  }

  const messages = leads.map(l => ({
    username: l.instagram_handle.replace(/^@/, ''),
    message: MESSAGE_2.replace('{videoUrl}', l.heygen_video_url),
  }));

  let runId: string;
  try {
    const resp = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/runs?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          messages,
          minDelay: 45,
          maxDelay: 90,
        }),
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Apify ${resp.status}: ${text}`);
    }

    const data = await resp.json() as { data: { id: string } };
    runId = data.data.id;
  } catch (err) {
    console.error('[instagram-followup]', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  for (const lead of leads) {
    await query(
      `INSERT INTO outreach_log (lead_id, channel, template_key, success, external_id)
       VALUES ($1, 'instagram_apify_followup', 'bericht_2', true, $2)`,
      [lead.id, runId]
    );
  }

  await query(
    `INSERT INTO daily_limits (date, channel, count) VALUES (CURRENT_DATE, 'instagram_apify_followup', $1)
     ON CONFLICT (date, channel) DO UPDATE SET count = daily_limits.count + $1`,
    [leads.length]
  );

  console.log(`[instagram-followup] bericht_2: ${leads.length} followups gestart via run ${runId}`);
  return NextResponse.json({ sent: leads.length, runId, todayTotal: todayCount + leads.length, limit: DAILY_LIMIT });
}

// GET — status van vandaag
export async function GET(_req: NextRequest) {
  const todayCount = await getTodayCount();
  return NextResponse.json({
    today: { sent: todayCount, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - todayCount) },
  });
}
