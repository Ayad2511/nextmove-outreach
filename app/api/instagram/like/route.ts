import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { launchInstagramLiker } from '@/lib/integrations/phantombuster';

// POST /api/instagram/like
// Likt recente posts van verrijkte leads (status = 'enriched')
// Phantombuster Auto Liker — veilig tempo, geen DM, alleen liken
export async function POST() {
  // Leads klaar voor warming: verrijkt maar nog niet geliked
  const leads = await query<{ id: number; owner_instagram: string; instagram_handle: string }>(
    `SELECT id, owner_instagram, instagram_handle FROM leads
     WHERE status = 'enriched'
       AND (owner_instagram IS NOT NULL OR instagram_handle IS NOT NULL)
       AND id NOT IN (
         SELECT lead_id FROM outreach_log WHERE channel = 'instagram_like' AND success = true
       )
     ORDER BY created_at ASC
     LIMIT 30`
  );

  if (!leads.length) {
    return NextResponse.json({ message: 'Geen leads klaar voor liken', launched: false });
  }

  const profileUrls = leads.map(l => {
    const handle = (l.owner_instagram ?? l.instagram_handle).replace(/^@/, '');
    return `https://www.instagram.com/${handle}/`;
  });

  const containerId = await launchInstagramLiker(profileUrls);

  if (!containerId) {
    return NextResponse.json({ message: 'Phantombuster liker niet gestart (agent ID ontbreekt)', launched: false });
  }

  // Markeer leads als liked
  for (const lead of leads) {
    await query(
      `INSERT INTO outreach_log (lead_id, channel, template_key, success, external_id)
       VALUES ($1, 'instagram_like', 'auto_like', true, $2)`,
      [lead.id, containerId]
    );
    await query(
      `UPDATE leads SET status = 'liked', updated_at = NOW() WHERE id = $1`,
      [lead.id]
    );
  }

  console.log(`[liker] ${leads.length} leads geliked via Phantom ${containerId}`);
  return NextResponse.json({ launched: true, containerId, count: leads.length });
}
