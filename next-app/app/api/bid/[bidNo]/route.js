import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://127.0.0.1:6001';

export async function GET(request, { params }) {
  const bidNo = params?.bidNo;
  if (!bidNo) {
    return NextResponse.json({ status: 'error', message: 'bidNo is required' }, { status: 400 });
  }

  try {
    const encoded = encodeURIComponent(bidNo);
    const res = await fetch(`${BACKEND_URL}/api/bid/${encoded}`, {
      cache: 'no-store',
      next: { revalidate: 0 },
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err) {
    console.error(`[Next API Proxy] Error proxying /api/bid/${bidNo}:`, err);
  }

  return NextResponse.json(
    { status: 'error', message: `Backend service could not find bid details for ${bidNo}` },
    { status: 404 }
  );
}
