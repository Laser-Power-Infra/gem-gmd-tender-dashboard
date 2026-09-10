import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://127.0.0.1:6001';

export async function GET(request, { params }) {
  const fileArray = params?.filename || [];
  const filename = Array.isArray(fileArray) ? fileArray.join('/') : fileArray;

  if (!filename) {
    return NextResponse.json({ status: 'error', message: 'Filename is required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/pdf/${encodeURIComponent(filename)}`, {
      cache: 'no-store',
      next: { revalidate: 0 },
    });

    if (res.ok) {
      const buffer = await res.arrayBuffer();
      const contentType = res.headers.get('content-type') || 'application/pdf';
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }
  } catch (err) {
    console.error(`[Next API Proxy] Error proxying /api/pdf/${filename}:`, err);
  }

  return NextResponse.json(
    { status: 'error', message: `PDF document ${filename} not found` },
    { status: 404 }
  );
}
