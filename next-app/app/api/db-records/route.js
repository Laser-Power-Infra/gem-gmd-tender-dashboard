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

function isValidAttachment(fn) {
  if (!fn) return false;
  const lower = fn.toLowerCase().trim();
  const disqualify = ['gem-bidding', 'gem_bidding', 'bid.pdf', 'bid_doc', 'bid document', 'tender notice'];
  if (disqualify.some(k => lower.includes(k))) return false;
  if (/^image\d+\.(png|jpg|jpeg|gif|bmp)$/.test(lower)) return false;
  if (/^screenshot \d+.*?\.(png|jpg|jpeg)$/.test(lower)) return false;
  return true;
}

function isStrictPo(fn) {
  if (!fn) return false;
  const lower = fn.toLowerCase().trim();
  if (lower.includes('gem-bidding') || lower.includes('gem_bidding') || lower.includes('bid.pdf') || lower.includes('tender')) return false;
  return /gemc?-?[0-9]{14,16}/.test(lower) || /\b(purchase[_\s-]?order|work[_\s-]?order|supply[_\s-]?order|order[_\s-]?copy)\b/.test(lower) || /(^|[\s_-])po[\s_-]/.test(lower) || lower.startsWith('po_') || lower.startsWith('po-');
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { gem_id, drive_link, order_pdf, files, remarks, user_status, order_number, docket_number, rate } = body;

    if (!gem_id) {
      return NextResponse.json({ status: 'error', message: 'gem_id is required' }, { status: 400 });
    }

    const clean_gem_id = String(gem_id).trim().toUpperCase();

    // 1. Separate PO Order PDF from Other Attachments
    let po_pdf_link = typeof order_pdf === 'string' && order_pdf.startsWith('http') ? order_pdf : null;
    let other_files = [];

    if (files && Array.isArray(files) && files.length > 0) {
      // Find the file that strictly represents the PO / Contract PDF
      const poCandidate = files.find(f => {
        const fn = (f.name || f.file_name || '').toLowerCase();
        return isStrictPo(fn);
      });

      if (!po_pdf_link && poCandidate) {
        po_pdf_link = poCandidate.drive_link || poCandidate.url;
      }

      // Format all files with actual names, urls, and extensions (excluding bid docs & signature images)
      other_files = files
        .filter(f => isValidAttachment(f.name || f.file_name))
        .map((f, idx) => {
          const fn = f.name || f.file_name || `Doc ${idx + 1}`;
          const u = f.drive_link || f.url || '';
          const ext = fn.includes('.') ? fn.split('.').pop().toLowerCase() : 'pdf';
          return { name: fn, url: u, type: ext };
        }).filter(f => Boolean(f.url));
    }

    const resolved_order_pdf = po_pdf_link || (typeof order_pdf === 'string' && order_pdf.startsWith('http') ? order_pdf : null);
    const resolved_drive_link = other_files.length > 0 
      ? JSON.stringify(other_files) 
      : (typeof drive_link === 'string' ? drive_link : null);

    const record = await prisma.gmd_gem_ids.upsert({
      where: { gem_id: clean_gem_id },
      update: {
        order_pdf: resolved_order_pdf !== null ? resolved_order_pdf : undefined,
        drive_link: resolved_drive_link !== null ? resolved_drive_link : undefined,
        remarks: remarks !== undefined ? remarks : undefined,
        user_status: user_status !== undefined ? user_status : undefined,
        order_number: order_number !== undefined ? order_number : undefined,
        docket_number: docket_number !== undefined ? docket_number : undefined,
        rate: rate !== undefined ? rate : undefined,
      },
      create: {
        gem_id: clean_gem_id,
        order_pdf: resolved_order_pdf || null,
        drive_link: resolved_drive_link || null,
        remarks: remarks || null,
        user_status: user_status || null,
        order_number: order_number || null,
        docket_number: docket_number || null,
        rate: rate || null,
      },
    });

    // 2. Insert each file into gmd_gem_files table for multi-attachment tracking
    if (other_files.length > 0) {
      for (const f of other_files) {
        const fname = f.name;
        const flink = f.url;
        const ext = f.type || 'pdf';
        if (fname && flink) {
          const existingFile = await prisma.gmd_gem_files.findFirst({
            where: { gem_id: clean_gem_id, file_name: fname }
          });
          if (!existingFile) {
            await prisma.gmd_gem_files.create({
              data: {
                gem_id: clean_gem_id,
                file_name: fname,
                drive_link: flink,
                file_type: ext
              }
            });
          }
        }
      }
    }

    return NextResponse.json({ status: 'success', record });
  } catch (error) {
    console.error('Error upserting record via Prisma:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
