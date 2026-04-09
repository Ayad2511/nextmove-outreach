import { NextResponse } from 'next/server';
import { testConnection } from '@/lib/db';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  const connected = await testConnection();

  return NextResponse.json({
    DATABASE_URL_set: !!dbUrl,
    DATABASE_URL_preview: dbUrl ? dbUrl.slice(0, 40) + '...' : null,
    NODE_ENV: process.env.NODE_ENV,
    db_connected: connected,
  });
}
