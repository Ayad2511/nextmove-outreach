import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { launchInstagramStoryViewer } from '@/lib/integrations/phantombuster';

// POST /api/instagram/story
// Bekijkt stories van al gelikte leads — optioneel maar verhoogt warming
// Na viewing: status → 'warmed'
export async function POST() {
  // Leads die al geliked zijn maar nog geen story view hebben
  const leads = await query<{ id: number; owner_instagram: string; instagram_handle: string }>(
    `SELECT id, owner_instagram, instagram_handle FROM leads
     WHERE status = 'liked'
       AND (owner_instagram IS NOT NULL OR instagram_handle IS NOT NULL)
       AND id NOT IN (
         SELECT lead_id FROM outreach_log WHERE channel = 'instagram_story' AND success = true
       )
     ORDER BY updated_at ASC
     LIMIT 30`
  );

  if (!leads.length) {
    return NextResponse.json({ message: 'Geen leads met status liked voor story viewing', launched: false });
  }

  const profileUrls = leads.map(l => {
    const handle = (l.owner_instagram ?? l.instagram_handle).replace(/^@/, '');
    return `https://www.instagram.com/${handle}/`;
  });

  const containerId = await launchInstagramStoryViewer(profileUrls);

  if (!containerId) {
    // Geen story agent — markeer leads direct als warmed (liken is genoeg)
    for (const lead of leads) {
      await query(
        `UPDATE leads SET status = 'warmed', updated_at = NOW() WHERE id = $1`,
        [lead.id]
      );
    }
    console.log(`[story] Geen story agent — ${leads.length} leads direct op warmed gezet`);
    return NextResponse.json({ launched: false, warmed: leads.length, message: 'Story agent niet ingesteld — leads direct gewarmd' });
  }

  for (const lead of leads) {
    await query(
      `INSERT INTO outreach_log (lead_id, channel, template_key, success, external_id)
       VALUES ($1, 'instagram_story', 'story_view', true, $2)`,
      [lead.id, containerId]
    );
    await query(
      `UPDATE leads SET status = 'warmed', updated_at = NOW() WHERE id = $1`,
      [lead.id]
    );
  }

  console.log(`[story] ${leads.length} stories bekeken via Phantom ${containerId}`);
  return NextResponse.json({ launched: true, containerId, warmed: leads.length });
}
