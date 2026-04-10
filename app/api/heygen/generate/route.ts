import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const HEYGEN_BASE = 'https://api.heygen.com';

function heygenHeaders() {
  return {
    'X-Api-Key': process.env.HEYGEN_API_KEY ?? '',
    'Content-Type': 'application/json',
  };
}

async function createVideo(
  firstName: string,
  observatie: string
): Promise<string | null> {
  const avatarId = process.env.HEYGEN_AVATAR_ID;
  const voiceId  = process.env.HEYGEN_VOICE_ID;
  const bgVideoId = process.env.HEYGEN_BACKGROUND_VIDEO_ID;

  if (!process.env.HEYGEN_API_KEY || !avatarId || !voiceId) {
    console.log('[heygen] HEYGEN_API_KEY, AVATAR_ID of VOICE_ID niet ingesteld, skip.');
    return null;
  }

  const inputText = `Salam alaykum ${firstName}! ${observatie}`;

  // Segment 1: Avatar lip-sync met gepersonaliseerde tekst (~14 sec)
  const videoInputs: unknown[] = [
    {
      character: {
        type: 'avatar',
        avatar_id: avatarId,
        avatar_style: 'normal',
      },
      voice: {
        type: 'text',
        input_text: inputText,
        voice_id: voiceId,
        speed: 1.0,
      },
    },
  ];

  // Segment 2: Vaste Tamara opname (als background video ID opgegeven)
  if (bgVideoId) {
    videoInputs.push({
      character: {
        type: 'talking_photo',
        talking_photo_id: bgVideoId,
      },
      voice: {
        type: 'silence',
        duration: 1,
      },
    });
  }

  const body = {
    video_inputs: videoInputs,
    dimension: { width: 1280, height: 720 },
    aspect_ratio: '16:9',
  };

  const resp = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: 'POST',
    headers: heygenHeaders(),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    console.error(`[heygen] generate fout: ${resp.status} ${await resp.text()}`);
    return null;
  }

  const data = await resp.json() as { data?: { video_id?: string }; video_id?: string };
  return data.data?.video_id ?? data.video_id ?? null;
}

// POST /api/heygen/generate
// Maakt gepersonaliseerde video aan voor leads met status warmed/replied
// die claude_observatie hebben maar nog geen heygen_video_id
export async function POST(req: NextRequest) {
  if (!process.env.HEYGEN_API_KEY) {
    return NextResponse.json({ error: 'HEYGEN_API_KEY niet ingesteld' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({})) as { lead_id?: number; limit?: number };
  const limit = body.limit ?? 10;

  let whereClause: string;
  let params: unknown[];

  if (body.lead_id) {
    whereClause = `WHERE id = $1`;
    params = [body.lead_id];
  } else {
    whereClause = `WHERE status IN ('warmed', 'liked', 'replied', 'dm_sent')
       AND claude_observatie IS NOT NULL AND claude_observatie != ''
       AND (heygen_video_id IS NULL OR heygen_video_id = '')
       AND status NOT IN ('niet_geinteresseerd')
     ORDER BY updated_at DESC
     LIMIT $1`;
    params = [limit];
  }

  const leads = await query<{
    id: number;
    first_name: string;
    owner_name: string;
    company_name: string;
    claude_observatie: string;
  }>(
    `SELECT id, first_name, owner_name, company_name, claude_observatie FROM leads ${whereClause}`,
    params
  );

  if (!leads.length) {
    return NextResponse.json({ message: 'Geen leads klaar voor video generatie', started: 0 });
  }

  const results: { leadId: number; videoId: string | null }[] = [];

  for (const lead of leads) {
    const firstName = (lead.owner_name ?? lead.first_name ?? '').split(/\s+/)[0] || 'zus';
    const observatie = lead.claude_observatie;

    const videoId = await createVideo(firstName, observatie);

    if (videoId) {
      await query(
        `UPDATE leads SET heygen_video_id = $1, updated_at = NOW() WHERE id = $2`,
        [videoId, lead.id]
      );
      await query(
        `INSERT INTO outreach_log (lead_id, channel, template_key, success, external_id)
         VALUES ($1, 'heygen', 'personalized_video', true, $2)`,
        [lead.id, videoId]
      );
    }

    results.push({ leadId: lead.id, videoId });

    // Pauze tussen HeyGen calls
    if (results.length < leads.length) await new Promise(r => setTimeout(r, 500));
  }

  const started = results.filter(r => r.videoId).length;
  console.log(`[heygen] ${started} video's gestart`);
  return NextResponse.json({ started, total: leads.length, results });
}
