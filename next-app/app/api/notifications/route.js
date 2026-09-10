import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://127.0.0.1:6001';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/notifications`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err) {
    console.warn('[Next API Proxy] Flask backend offline on 6001, returning fallback for /api/notifications');
  }

  return NextResponse.json({
    status: 'success',
    notifications: [],
    unread_count: 0,
  });
}
