import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request) {
  try {
    const body = await request.json();
    const { gem_id, files, name, drive_link } = body;

    if (!gem_id) {
      return NextResponse.json({ status: 'error', message: 'gem_id is required' }, { status: 400 });
    }

    const clean_gem_id = String(gem_id).trim().toUpperCase();

    // Support both multi-file array and single-file formats
    const fileList = Array.isArray(files) && files.length > 0 
      ? files 
      : (name && drive_link ? [{ name, drive_link }] : []);

    const primary_file_name = fileList.length > 0 ? (fileList[0].name || fileList[0].file_name) : name;
    const primary_drive_link = fileList.length > 0 ? fileList[0].drive_link : drive_link;

    // 1. Upsert record in gmd_gem_ids
    const record = await prisma.gmd_gem_ids.upsert({
      where: { gem_id: clean_gem_id },
      update: {
        drive_link: primary_drive_link !== undefined ? primary_drive_link : undefined,
        order_pdf: primary_file_name !== undefined ? primary_file_name : undefined,
        updated_at: new Date(),
      },
      create: {
        gem_id: clean_gem_id,
        drive_link: primary_drive_link || null,
        order_pdf: primary_file_name || null,
      },
    });

    // 2. Insert files into gmd_gem_files table for multi-file PO tracking
    for (const f of fileList) {
      const fname = f.name || f.file_name;
      const flink = f.drive_link;
      if (fname && flink) {
        const existing = await prisma.gmd_gem_files.findFirst({
          where: { gem_id: clean_gem_id, file_name: fname }
        });
        if (!existing) {
          await prisma.gmd_gem_files.create({
            data: {
              gem_id: clean_gem_id,
              file_name: fname,
              drive_link: flink,
              file_type: 'pdf',
            }
          });
        }
      }
    }

    console.log(`[PO Release Webhook] Saved ${fileList.length} file(s) for GeM ID ${clean_gem_id}`);
    return NextResponse.json({ 
      status: 'success', 
      message: 'PO release recorded successfully',
      record,
      files_count: fileList.length 
    });

  } catch (error) {
    console.error('[PO Release Webhook Error]:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
