import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const HEYGEN_BASE = 'https://api.heygen.com';

function heygenHeaders() {
  return { 'X-Api-Key': process.env.HEYGEN_API_KEY ?? '' };
}

interface HeyGenStatusResponse {
  data?: {
    video_id?: string;
    status?: string;
    video_url?: string;
    thumbnail_url?: string;
    duration?: number;
    error?: string;
  };
  status?: string;
  video_url?: string;
}

async function fetchVideoStatus(videoId: string): Promise<{ status: string; videoUrl: string | null }> {
  const resp = await fetch(
    `${HEYGEN_BASE}/v1/video_status.get?video_id=${videoId}`,
    { headers: heygenHeaders() }
  );

  if (!resp.ok) return { status: 'error', videoUrl: null };

  const data = await resp.json() as HeyGenStatusResponse;
  const d = data.data ?? {};
  return {
    status: d.status ?? data.status ?? 'pending',
    videoUrl: d.video_url ?? data.video_url ?? null,
  };
}

// GET /api/heygen/status
// Checkt alle leads met heygen_video_id maar zonder heygen_video_url
// Zodra status = completed → slaat video_url op in database
export async function GET() {
  if (!process.env.HEYGEN_API_KEY) {
    return NextResponse.json({ error: 'HEYGEN_API_KEY niet ingesteld' }, { status: 500 });
  }

  const pending = await query<{ id: number; heygen_video_id: string }>(
    `SELECT id, heygen_video_id FROM leads
     WHERE heygen_video_id IS NOT NULL AND heygen_video_id != ''
       AND (heygen_video_url IS NULL OR heygen_video_url = '')
     ORDER BY updated_at ASC
     LIMIT 50`
  );

  if (!pending.length) {
    return NextResponse.json({ message: 'Geen videos in behandeling', completed: 0, pending: 0 });
  }

  let completed = 0;
  let stillProcessing = 0;
  let failed = 0;

  for (const lead of pending) {
    const { status, videoUrl } = await fetchVideoStatus(lead.heygen_video_id);

    if (status === 'completed' && videoUrl) {
      await query(
        `UPDATE leads SET heygen_video_url = $1, updated_at = NOW() WHERE id = $2`,
        [videoUrl, lead.id]
      );
      // Update outreach log
      await query(
        `UPDATE outreach_log SET external_id = $1
         WHERE lead_id = $2 AND channel = 'heygen' AND external_id = $3`,
        [videoUrl, lead.id, lead.heygen_video_id]
      );
      completed++;
    } else if (status === 'failed' || status === 'error') {
      await query(
        `UPDATE leads SET heygen_video_id = NULL, updated_at = NOW() WHERE id = $1`,
        [lead.id]
      );
      failed++;
    } else {
      stillProcessing++;
    }

    // Niet te snel pollen
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`[heygen-status] completed: ${completed}, processing: ${stillProcessing}, failed: ${failed}`);
  return NextResponse.json({
    completed,
    stillProcessing,
    failed,
    totalChecked: pending.length,
  });
}
