import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  const leads = await query<{ instagram_handle: string }>(
    `SELECT instagram_handle FROM leads
     WHERE instagram_handle IS NOT NULL AND instagram_handle != ''
     ORDER BY created_at DESC`
  );

  const rows = leads.map(l =>
    `https://www.instagram.com/${l.instagram_handle}/`
  );

  const csv = ['instagram_url', ...rows].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leads.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
