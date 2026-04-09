import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const DAILY_LIMIT = 7;
const ACTOR_ID = 'rhymed_jellyfish/instagram-dm-automation-messages';

const MESSAGE_1 = `Wa alaykum assalaam {firstName} 🤍

Ik zag jullie {personalization} — masha'Allah wat mooi werk.

Ik ben Tamara van Next Move Marketing. Ik heb speciaal voor jullie een video opgenomen. Mag ik die doorsturen? 🎥`;

async function getTodayCount(channel: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COALESCE(count, 0) as count FROM daily_limits
     WHERE date = CURRENT_DATE AND channel = $1`,
    [channel]
  );
  return rows.length ? parseInt(rows[0].count) : 0;
}

async function launchApifyDM(
  apiKey: string,
  sessionId: string,
  messages: { username: string; message: string }[]
): Promise<string> {
  const resp = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/runs?token=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        messages,          // per-user berichten met gepersonaliseerde tekst
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
  return data.data.id;
}

// POST /api/instagram/dm — eerste contact (bericht 1)
export async function POST(req: NextRequest) {
  const apiKey = process.env.APIFY_API_KEY;
  const sessionId = process.env.INSTAGRAM_SESSION_ID;

  if (!apiKey)   return NextResponse.json({ error: 'APIFY_API_KEY niet ingesteld' }, { status: 500 });
  if (!sessionId) return NextResponse.json({ error: 'INSTAGRAM_SESSION_ID niet ingesteld' }, { status: 500 });

  const body = await req.json().catch(() => ({})) as { limit?: number };
  const maxToday = Math.min(body.limit ?? DAILY_LIMIT, DAILY_LIMIT);

  const todayCount = await getTodayCount('instagram_apify_dm');
  const remaining = Math.max(0, maxToday - todayCount);

  if (remaining === 0) {
    return NextResponse.json({ message: `Dagelijks limiet (${DAILY_LIMIT}) bereikt`, sent: 0, todayTotal: todayCount });
  }

  const leads = await query<{ id: number; first_name: string; instagram_handle: string; niche: string }>(
    `SELECT id, first_name, instagram_handle, niche FROM leads
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

  const messages = leads.map(l => ({
    username: l.instagram_handle.replace(/^@/, ''),
    message: MESSAGE_1
      .replace('{firstName}', l.first_name?.split(' ')[0] ?? 'zus')
      .replace('{personalization}', l.niche ?? 'mooie collectie'),
  }));

  let runId: string;
  try {
    runId = await launchApifyDM(apiKey, sessionId, messages);
  } catch (err) {
    console.error('[instagram-dm]', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  for (const lead of leads) {
    await query(
      `INSERT INTO outreach_log (lead_id, channel, template_key, success, external_id)
       VALUES ($1, 'instagram_apify_dm', 'bericht_1', true, $2)`,
      [lead.id, runId]
    );
  }

  await query(
    `INSERT INTO daily_limits (date, channel, count) VALUES (CURRENT_DATE, 'instagram_apify_dm', $1)
     ON CONFLICT (date, channel) DO UPDATE SET count = daily_limits.count + $1`,
    [leads.length]
  );

  console.log(`[instagram-dm] bericht_1: ${leads.length} DMs gestart via run ${runId}`);
  return NextResponse.json({ sent: leads.length, runId, todayTotal: todayCount + leads.length, limit: DAILY_LIMIT });
}

// GET /api/instagram/dm — dagelijkse status
export async function GET() {
  const todayCount = await getTodayCount('instagram_apify_dm');
  const followupCount = await getTodayCount('instagram_apify_followup');
  return NextResponse.json({
    dm:       { sent: todayCount,    limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - todayCount) },
    followup: { sent: followupCount, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - followupCount) },
  });
}
