import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const DAILY_LIMIT = 7;
const ACTOR_ID = 'rhymed_jellyfish/instagram-dm-automation-messages';

async function getTodayCount(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COALESCE(count, 0) as count FROM daily_limits
     WHERE date = CURRENT_DATE AND channel = 'instagram_apify_dm'`
  );
  return rows.length ? parseInt(rows[0].count) : 0;
}

// POST /api/instagram/dm
// Body (optioneel): { message: string, limit: number }
export async function POST(req: NextRequest) {
  const apiKey = process.env.APIFY_API_KEY;
  const sessionId = process.env.INSTAGRAM_SESSION_ID;

  if (!apiKey) {
    return NextResponse.json({ error: 'APIFY_API_KEY niet ingesteld' }, { status: 500 });
  }
  if (!sessionId) {
    return NextResponse.json({ error: 'INSTAGRAM_SESSION_ID niet ingesteld' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({})) as { message?: string; limit?: number };
  const maxToday = Math.min(body.limit ?? DAILY_LIMIT, DAILY_LIMIT);
  const message = body.message
    ?? 'Hey! Ik zag je brand voorbijkomen en vond het echt mooi 🙌 Ik help brands zoals die van jou groeien — mag ik je iets sturen?';

  const todayCount = await getTodayCount();
  const remaining = Math.max(0, maxToday - todayCount);

  if (remaining === 0) {
    return NextResponse.json({
      message: `Dagelijks limiet (${DAILY_LIMIT}) bereikt`,
      sent: 0,
      todayTotal: todayCount,
    });
  }

  // Haal leads op die nog geen Instagram DM ontvangen hebben via Apify
  const leads = await query<{ id: number; first_name: string; instagram_handle: string }>(
    `SELECT id, first_name, instagram_handle FROM leads
     WHERE instagram_handle IS NOT NULL AND instagram_handle != ''
       AND status NOT IN ('niet_geinteresseerd')
       AND id NOT IN (
         SELECT lead_id FROM outreach_log
         WHERE channel = 'instagram_apify_dm' AND success = true
       )
     ORDER BY created_at ASC
     LIMIT $1`,
    [remaining]
  );

  if (!leads.length) {
    return NextResponse.json({ message: 'Geen leads beschikbaar voor Instagram DM', sent: 0 });
  }

  // Bouw Apify actor input op
  const usernames = leads.map(l => l.instagram_handle.replace(/^@/, ''));

  const actorInput = {
    sessionId,
    usernames,
    message,
    delayBetweenMessages: 45,   // seconden — veilig tempo
  };

  let runId: string;
  try {
    const resp = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/runs?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actorInput),
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      console.error('[instagram-dm] Apify actor fout:', resp.status, text);
      return NextResponse.json({ error: `Apify fout: ${resp.status}` }, { status: 502 });
    }

    const data = await resp.json() as { data: { id: string } };
    runId = data.data.id;
  } catch (err) {
    return NextResponse.json({ error: `Fetch mislukt: ${(err as Error).message}` }, { status: 502 });
  }

  // Sla outreach log op
  for (const lead of leads) {
    await query(
      `INSERT INTO outreach_log (lead_id, channel, template_key, success, external_id)
       VALUES ($1, 'instagram_apify_dm', 'dm_apify', true, $2)`,
      [lead.id, runId]
    );
  }

  // Update dagelijks teller
  await query(
    `INSERT INTO daily_limits (date, channel, count) VALUES (CURRENT_DATE, 'instagram_apify_dm', $1)
     ON CONFLICT (date, channel) DO UPDATE SET count = daily_limits.count + $1`,
    [leads.length]
  );

  console.log(`[instagram-dm] ${leads.length} DMs gestart via Apify run ${runId}`);

  return NextResponse.json({
    sent: leads.length,
    runId,
    todayTotal: todayCount + leads.length,
    limit: DAILY_LIMIT,
    usernames,
  });
}

// GET /api/instagram/dm — status van vandaag
export async function GET() {
  const todayCount = await getTodayCount();
  return NextResponse.json({
    today: {
      sent: todayCount,
      limit: DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - todayCount),
    },
  });
}
