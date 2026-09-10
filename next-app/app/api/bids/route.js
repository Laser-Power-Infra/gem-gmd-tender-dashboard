import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://127.0.0.1:6001';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/bids`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      });
    }
  } catch (err) {
    console.warn('[Next API Proxy] Flask backend offline on 6001 for /api/bids');
  }

  return NextResponse.json({
    status: 'success',
    stats: {
      total_bids: 0,
      tech_qualified: 0,
      tech_disqualified: 0,
      financial_l1_count: 0,
      company_stats: {
        name: 'G.M. DALUI',
        participated: 0,
        qualified: 0,
        qualified_total: 0,
        disqualified: 0,
        l1_won: 0,
        l2_missed: 0,
      },
    },
    bids: [],
  });
}
