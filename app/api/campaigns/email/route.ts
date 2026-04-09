import { NextRequest, NextResponse } from 'next/server';
import { addLeadToCampaign } from '@/lib/integrations/lemlist';
import { query } from '@/lib/db';

const DAILY_EMAIL_LIMIT = 40;

// Email sequence (ingesteld in Lemlist zelf):
// Email 1 — dag 1:  subject "Social media voor {{brandName}} 🤍"
//                   body: gepersonaliseerd met naam + niche + videoUrl + vslUrl
// Email 2 — dag 4:  kortere follow-up, herinnering video
// Email 3 — dag 8:  last chance, urgentie
//
// Lemlist template variabelen: {{firstName}}, {{brandName}}, {{niche}}, {{videoUrl}}, {{vslUrl}}
// Email campagne loopt ONAFHANKELIJK van Instagram/LinkedIn warming

async function getTodayEmailCount(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COALESCE(count, 0) as count FROM daily_limits WHERE date = CURRENT_DATE AND channel = 'email'`
  );
  return rows.length ? parseInt(rows[0].count) : 0;
}

async function incrementEmailCount(amount: number) {
  await query(
    `INSERT INTO daily_limits (date, channel, count) VALUES (CURRENT_DATE, 'email', $1)
     ON CONFLICT (date, channel) DO UPDATE SET count = daily_limits.count + $1`,
    [amount]
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const maxToday = body.limit ?? DAILY_EMAIL_LIMIT;

  const todayCount = await getTodayEmailCount();
  const remaining = Math.max(0, maxToday - todayCount);

  if (remaining === 0) {
    return NextResponse.json({ message: `Dagelijks limiet (${maxToday}) bereikt`, sent: 0 });
  }

  // Leads met email die de sequence nog niet ontvangen hebben
  // Onafhankelijk van Instagram status — email loopt parallel
  const leads = await query<{
    id: number;
    first_name: string;
    last_name: string;
    owner_name: string;
    email: string;
    company_name: string;
    niche: string;
    heygen_video_url: string;
  }>(
    `SELECT id, first_name, last_name, owner_name, email, company_name, niche, heygen_video_url
     FROM leads
     WHERE email IS NOT NULL AND email != ''
       AND id NOT IN (
         SELECT lead_id FROM outreach_log WHERE channel = 'email' AND success = true
       )
     ORDER BY created_at ASC LIMIT $1`,
    [remaining]
  );

  if (!leads.length) {
    return NextResponse.json({ message: 'Geen leads klaar voor email outreach', sent: 0 });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const lead of leads) {
    // Gebruik owner_name als beschikbaar voor persoonlijkere aanspreking
    const firstName = (lead.owner_name ?? lead.first_name ?? '').split(/\s+/)[0] || '';

    const ok = await addLeadToCampaign({
      email: lead.email,
      firstName,
      lastName: lead.last_name ?? '',
      companyName: lead.company_name ?? '',
      niche: lead.niche ?? '',
      videoUrl: lead.heygen_video_url ?? '',
      vslUrl: process.env.VSL_URL ?? '',
    });

    if (ok) {
      await query(
        `UPDATE leads SET status = CASE WHEN status IN ('new', 'enriched', 'te_contacteren') THEN 'email_sent' ELSE status END, updated_at = NOW() WHERE id = $1`,
        [lead.id]
      );
      await query(
        `INSERT INTO outreach_log (lead_id, channel, template_key, success) VALUES ($1, 'email', 'sequence_3', true)`,
        [lead.id]
      );
      sent++;
    } else {
      errors.push(lead.email);
      await query(
        `INSERT INTO outreach_log (lead_id, channel, template_key, success, error_message) VALUES ($1, 'email', 'sequence_3', false, 'Lemlist fout')`,
        [lead.id]
      );
    }
  }

  if (sent > 0) await incrementEmailCount(sent);

  return NextResponse.json({
    message: `${sent} leads toegevoegd aan Lemlist 3-staps sequence`,
    sent,
    errors: errors.length ? errors : undefined,
  });
}

export async function GET() {
  const { getCampaignStats } = await import('@/lib/integrations/lemlist');
  const stats = await getCampaignStats();
  const todayCount = await getTodayEmailCount();

  return NextResponse.json({
    today: { sent: todayCount, limit: DAILY_EMAIL_LIMIT, remaining: Math.max(0, DAILY_EMAIL_LIMIT - todayCount) },
    campaign: stats,
  });
}
