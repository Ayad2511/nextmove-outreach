import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface InstagramPost {
  caption?: string;
  likesCount?: number;
  hashtags?: string[];
}

interface InstagramData {
  bio?: string;
  fullName?: string;
  highlightTitles?: string[];
  recentPosts?: InstagramPost[];
}

async function generateObservatie(
  merknaam: string,
  instagramData: InstagramData
): Promise<string> {
  const bio = instagramData.bio ?? '';
  const posts = (instagramData.recentPosts ?? []).filter(p => p.caption && p.caption.length > 5);
  const highlights = instagramData.highlightTitles ?? [];

  // Fallback als te weinig content
  const avgCaptionLen = posts.length
    ? posts.reduce((sum, p) => sum + (p.caption?.length ?? 0), 0) / posts.length
    : 0;

  if (posts.length < 2 || avgCaptionLen < 20) {
    return `Ik keek naar jullie feed en zag meteen dat ${merknaam} veel meer bereik verdient.`;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return `Ik zag jullie mooie content op Instagram — masha'Allah wat een mooi werk doen jullie.`;
  }

  const prompt = `Je bent Tamara, een moslim vrouw die een social media agency runt voor moslim brands in Nederland.

Je hebt net het Instagram account bekeken van ${merknaam} en wil een ultra-persoonlijke observatie schrijven voor een video opener.

Hier is wat je hebt gevonden op hun account:
- Bio: "${bio}"
- Recente posts: ${posts.map(p => `"${p.caption?.slice(0, 150)}"`).join(', ')}
- Highlights: ${highlights.length ? highlights.join(', ') : '(geen highlights gevonden)'}

Schrijf EEN zin van max 15 woorden die:
1. Iets SPECIFIEKS benoemt dat je hebt gezien (verhuizing, giveaway, nieuwe collectie, lancering, Ramadan actie, samenwerking, mijlpaal, etc.)
2. Klinkt alsof je het echt hebt gelezen — niet generiek
3. Warm en oprecht is, geen sales taal
4. In het Nederlands is

Voorbeelden van GOED:
- "Ik zag dat jullie net zijn verhuisd naar een nieuwe locatie — gefeliciteerd masha'Allah!"
- "Die Dubai giveaway van vorige maand — wat een reacties hebben jullie gekregen zeg!"
- "Jullie nieuwe Ramadan collectie is echt masha'Allah mooi geworden."
- "Ik zag dat jullie 10.000 volgers hebben bereikt — dat is een mijlpaal!"

Geef ALLEEN de zin terug, niets anders.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    console.error(`[observatie] Claude API fout: ${resp.status}`);
    return `Ik keek naar jullie feed en zag meteen dat ${merknaam} veel meer bereik verdient.`;
  }

  const data = await resp.json() as { content?: { type: string; text: string }[] };
  const text = data.content?.find(c => c.type === 'text')?.text?.trim();
  return text ?? `Ik keek naar jullie feed en zag meteen dat ${merknaam} veel meer bereik verdient.`;
}

// POST /api/generate-observatie
// Body: { lead_id: number } voor één lead, of leeg voor batch (max 20)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { lead_id?: number };

  const whereClause = body.lead_id
    ? `WHERE id = ${parseInt(String(body.lead_id))} AND instagram_data IS NOT NULL`
    : `WHERE instagram_data IS NOT NULL
         AND (claude_observatie IS NULL OR claude_observatie = '')
         AND status NOT IN ('niet_geinteresseerd')
       ORDER BY created_at ASC LIMIT 20`;

  const leads = await query<{
    id: number;
    company_name: string;
    first_name: string;
    instagram_data: InstagramData;
  }>(
    `SELECT id, company_name, first_name, instagram_data FROM leads ${whereClause}`
  );

  if (!leads.length) {
    return NextResponse.json({ message: 'Geen leads met instagram_data beschikbaar', generated: 0 });
  }

  let generated = 0;
  const results: { leadId: number; observatie: string }[] = [];

  for (const lead of leads) {
    const merknaam = lead.company_name ?? lead.first_name ?? 'jullie merk';
    const observatie = await generateObservatie(merknaam, lead.instagram_data ?? {});

    await query(
      `UPDATE leads SET claude_observatie = $1, updated_at = NOW() WHERE id = $2`,
      [observatie, lead.id]
    );

    results.push({ leadId: lead.id, observatie });
    generated++;

    // Kleine pauze tussen Claude calls om rate limiting te voorkomen
    if (leads.length > 1) await new Promise(r => setTimeout(r, 300));
  }

  console.log(`[observatie] ${generated} observaties gegenereerd via Claude`);
  return NextResponse.json({ generated, results });
}
