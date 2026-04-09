import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, instagram, instagram_url, website, niche, status } = body as Record<string, string>;

  // Splits volledige naam in voor- en achternaam
  const parts = (name ?? '').trim().split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');

  // Instagram handle uit URL of direct veld
  let instagramHandle = (instagram ?? '').replace(/^@/, '');
  const igUrl = instagram_url ?? '';
  if (!instagramHandle && igUrl) {
    instagramHandle = igUrl
      .replace(/https?:\/\/(www\.)?instagram\.com\/?/, '')
      .replace(/\/$/, '')
      .replace(/^@/, '');
  }

  const rows = await query<{ id: number }>(
    `INSERT INTO leads (first_name, last_name, instagram_handle, linkedin_url, niche, status, source)
     VALUES ($1, $2, $3, $4, $5, $6, 'manual')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [firstName, lastName, instagramHandle, website ?? null, niche ?? null, status ?? 'te_contacteren']
  );

  if (!rows.length) {
    return NextResponse.json({ success: false, error: 'Lead bestaat al of kon niet opgeslagen worden' }, { status: 409 });
  }

  return NextResponse.json({ success: true, id: rows[0].id });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const leads = await query(
    `SELECT * FROM leads ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const [{ count }] = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM leads ${where}`,
    conditions.length ? params.slice(0, -2) : []
  );

  return NextResponse.json({ leads, total: parseInt(count), limit, offset });
}
