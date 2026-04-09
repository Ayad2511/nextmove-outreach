import { NextRequest, NextResponse } from 'next/server';
import { launchLinkedInConnect } from '@/lib/integrations/phantombuster';
import { query } from '@/lib/db';

const DAILY_LINKEDIN_LIMIT = 15;

// Connect bericht — Phantombuster vervangt {{firstName}} via LinkedIn profielnaam
const CONNECT_MESSAGE = `Wa alaykum assalaam {{firstName}} 🤍 Ik zag jullie mooie werk en wilde even connecten. Ik ben Tamara van Next Move Marketing.`;

async function getTodayLinkedInCount(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COALESCE(count, 0) as count FROM daily_limits WHERE date = CURRENT_DATE AND channel = 'linkedin'`
  );
  return rows.length ? parseInt(rows[0].count) : 0;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const maxToday = body.limit ?? DAILY_LINKEDIN_LIMIT;

  const todayCount = await getTodayLinkedInCount();
  const remaining = Math.max(0, maxToday - todayCount);

  if (remaining === 0) {
    return NextResponse.json({ message: `Dagelijks LinkedIn limiet (${maxToday}) bereikt`, launched: false });
  }

  // LinkedIn: gebruik owner_linkedin_url indien beschikbaar, anders linkedin_url
  // Onafhankelijk van Instagram warming status — loopt parallel
  const leads = await query<{ id: number; first_name: string; owner_name: string; linkedin_url: string; owner_linkedin_url: string }>(
    `SELECT id, first_name, owner_name, linkedin_url, owner_linkedin_url FROM leads
     WHERE (owner_linkedin_url IS NOT NULL OR linkedin_url IS NOT NULL)
       AND status NOT IN ('niet_geinteresseerd')
       AND id NOT IN (
         SELECT lead_id FROM outreach_log WHERE channel = 'linkedin' AND success = true
       )
     ORDER BY created_at ASC LIMIT $1`,
    [remaining]
  );

  if (!leads.length) {
    return NextResponse.json({ message: 'Geen leads met LinkedIn URL beschikbaar', launched: false });
  }

  const inputs = leads.map(l => ({
    linkedinUrl: l.owner_linkedin_url ?? l.linkedin_url,
    message: CONNECT_MESSAGE,
  }));

  const containerId = await launchLinkedInConnect(inputs);

  if (!containerId) {
    return NextResponse.json({ message: 'Phantombuster launch mislukt (agent ID ontbreekt?)', launched: false }, { status: 500 });
  }

  for (const lead of leads) {
    await query(
      `INSERT INTO outreach_log (lead_id, channel, template_key, success, external_id)
       VALUES ($1, 'linkedin', 'connect', true, $2)`,
      [lead.id, containerId]
    );
  }

  await query(
    `INSERT INTO daily_limits (date, channel, count) VALUES (CURRENT_DATE, 'linkedin', $1)
     ON CONFLICT (date, channel) DO UPDATE SET count = daily_limits.count + $1`,
    [leads.length]
  );

  console.log(`[linkedin] ${leads.length} connect requests gestart via Phantom ${containerId}`);
  return NextResponse.json({ message: `LinkedIn Phantom gestart voor ${leads.length} leads`, launched: true, containerId, leadsCount: leads.length });
}

export async function GET() {
  const todayCount = await getTodayLinkedInCount();
  return NextResponse.json({
    today: { sent: todayCount, limit: DAILY_LINKEDIN_LIMIT, remaining: Math.max(0, DAILY_LINKEDIN_LIMIT - todayCount) },
  });
}
