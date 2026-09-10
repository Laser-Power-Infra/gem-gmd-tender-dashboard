import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://127.0.0.1:6001';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const res = await fetch(`${BACKEND_URL}/api/upload-bid-document`, {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err) {
    console.error('[Next API Proxy] Error proxying upload-bid-document:', err);
  }

  return NextResponse.json(
    { status: 'error', message: 'Backend server on port 6001 is offline or unreachable' },
    { status: 503 }
  );
}
