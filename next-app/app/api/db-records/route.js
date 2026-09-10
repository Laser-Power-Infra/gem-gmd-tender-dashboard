import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const records = await prisma.gmd_gem_ids.findMany({
      orderBy: { id: 'desc' },
    });
    return NextResponse.json({ status: 'success', records });
  } catch (error) {
    console.error('Error fetching records via Prisma:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { gem_id, drive_link, remarks } = body;

    if (!gem_id) {
      return NextResponse.json({ status: 'error', message: 'gem_id is required' }, { status: 400 });
    }

    const clean_gem_id = String(gem_id).trim().toUpperCase();

    const record = await prisma.gmd_gem_ids.upsert({
      where: { gem_id: clean_gem_id },
      update: {
        drive_link: drive_link !== undefined ? drive_link : undefined,
        remarks: remarks !== undefined ? remarks : undefined,
      },
      create: {
        gem_id: clean_gem_id,
        drive_link: drive_link || null,
        remarks: remarks || null,
      },
    });

    return NextResponse.json({ status: 'success', record });
  } catch (error) {
    console.error('Error upserting record via Prisma:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
