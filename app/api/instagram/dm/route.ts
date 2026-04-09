import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const DAILY_LIMIT = 7;
const ACTOR_ID = 'rhymed_jellyfish/instagram-dm-automation-messages';

// Bericht 1 — eerste contact, geen link, naar persoonlijk account
const MESSAGE_1 = `Wa alaykum assalaam {firstName} 🤍

Ik zag jullie {personalization} — masha'Allah wat mooi werk.

Ik ben Tamara van Next Move Marketing. Ik heb speciaal voor jullie een video opgenomen. Mag ik die doorsturen? 🎥`;

async function getTodayCount(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COALESCE(count, 0) as count FROM daily_limits
     WHERE date = CURRENT_DATE AND channel = 'instagram_apify_dm'`
  );
  return rows.length ? parseInt(rows[0].count) : 0;
}

// POST /api/instagram/dm
// Alleen leads met status 'warmed' of 'liked' (minimaal 24u oud)
// DM gaat naar owner_instagram (persoonlijk account), niet het bedrijfsaccount
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
    return NextResponse.json({ message: `Dagelijks limiet (${DAILY_LIMIT}) bereikt`, sent: 0, todayTotal: todayCount });
  }

  // Alleen warmed/liked leads, minimaal 24u geleden opgewarmd
  // Gebruik owner_instagram als persoonlijk account, anders instagram_handle
  const leads = await query<{
    id: number;
    owner_name: string;
    first_name: string;
    owner_instagram: string;
    instagram_handle: string;
    niche: string;
  }>(
    `SELECT id, owner_name, first_name, owner_instagram, instagram_handle, niche FROM leads
     WHERE status IN ('warmed', 'liked')
       AND (owner_instagram IS NOT NULL OR instagram_handle IS NOT NULL)
       AND updated_at < NOW() - INTERVAL '20 hours'
       AND id NOT IN (
         SELECT lead_id FROM outreach_log
         WHERE channel = 'instagram_apify_dm' AND success = true
       )
     ORDER BY updated_at ASC
     LIMIT $1`,
    [remaining]
  );

  if (!leads.length) {
    return NextResponse.json({ message: 'Geen warmed leads beschikbaar voor DM (min. 20u na warming)', sent: 0 });
  }

  const messages = leads.map(l => {
    // Persoonlijk account van owner — dat is het doel
    const targetHandle = (l.owner_instagram ?? l.instagram_handle).replace(/^@/, '');
    const firstName = (l.owner_name ?? l.first_name ?? '').split(/\s+/)[0] || 'zus';
    const personalization = l.niche ?? 'mooie collectie';

    return {
      username: targetHandle,
      message: MESSAGE_1
        .replace('{firstName}', firstName)
        .replace('{personalization}', personalization),
    };
  });

  let runId: string;
  try {
    const resp = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/runs?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, messages, minDelay: 45, maxDelay: 90 }),
      }
    );
    if (!resp.ok) throw new Error(`Apify ${resp.status}: ${await resp.text()}`);
    const data = await resp.json() as { data: { id: string } };
    runId = data.data.id;
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
    await query(
      `UPDATE leads SET status = 'dm_sent', updated_at = NOW() WHERE id = $1`,
      [lead.id]
    );
  }

  await query(
    `INSERT INTO daily_limits (date, channel, count) VALUES (CURRENT_DATE, 'instagram_apify_dm', $1)
     ON CONFLICT (date, channel) DO UPDATE SET count = daily_limits.count + $1`,
    [leads.length]
  );

  console.log(`[instagram-dm] bericht_1: ${leads.length} DMs → persoonlijke accounts (run ${runId})`);
  return NextResponse.json({ sent: leads.length, runId, todayTotal: todayCount + leads.length, limit: DAILY_LIMIT });
}

export async function GET() {
  const todayCount = await getTodayCount();
  return NextResponse.json({
    today: { sent: todayCount, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - todayCount) },
  });
}
