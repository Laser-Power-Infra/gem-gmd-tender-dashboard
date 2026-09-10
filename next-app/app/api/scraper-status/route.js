import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://127.0.0.1:6001';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/scraper-status`, {
      cache: 'no-store',
      next: { revalidate: 0 },
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err) {
    console.warn('[Next API Proxy] Error polling /api/scraper-status:', err);
  }
  return NextResponse.json({ is_running: false, status_message: 'Idle' });
}
