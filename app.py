import os
import re
import glob
import json
import time
import threading
from datetime import datetime, timezone
import pandas as pd
from flask import Flask, render_template, jsonify, request, send_file
from flask_cors import CORS
from gem_scraper import scrape_gem_bid, extract_bid_details_from_html
from db_service import save_gem_record, get_all_gem_records, get_gem_record, save_file_record, get_files_for_gem_id, get_all_gem_files
from gdrive_service import upload_pdf_to_gdrive
from notifications_service import load_notifications, mark_notifications_read, add_notification, detect_bid_changes

START_TIME = time.time()

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "scraped_output")
PDF_DIR = os.path.join(OUTPUT_DIR, "pdfs")
JSON_DIR = os.path.join(OUTPUT_DIR, "json")
CSV_PATH = os.path.join(OUTPUT_DIR, "bids_summary.csv")
COMBINED_PDF_PATH = os.path.join(OUTPUT_DIR, "ALL_BIDS_COMBINED_REPORT.pdf")
BIDS_INPUT_FILE = os.path.join(BASE_DIR, "bids_input_sample.txt")

# Ensure required directories exist
os.makedirs(PDF_DIR, exist_ok=True)
os.makedirs(JSON_DIR, exist_ok=True)

REMARKS_PATH = os.path.join(OUTPUT_DIR, "remarks.json")
STATUSES_PATH = os.path.join(OUTPUT_DIR, "statuses.json")

def load_remarks():
    if os.path.exists(REMARKS_PATH):
        try:
            with open(REMARKS_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_remark(bid_no, remark):
    remarks = load_remarks()
    remarks[bid_no] = remark
    with open(REMARKS_PATH, 'w', encoding='utf-8') as f:
        json.dump(remarks, f, indent=2, ensure_ascii=False)
    return remarks

def load_statuses():
    if os.path.exists(STATUSES_PATH):
        try:
            with open(STATUSES_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_user_status(bid_no, user_status):
    statuses = load_statuses()
    statuses[bid_no] = user_status
    with open(STATUSES_PATH, 'w', encoding='utf-8') as f:
        json.dump(statuses, f, indent=2, ensure_ascii=False)
    return statuses

# Global scraping state tracker
scraper_state = {
    "is_running": False,
    "current_index": 0,
    "total_items": 0,
    "current_item": "",
    "status_message": "Idle",
    "completed_items": [],
    "failed_items": [],
    "error": None
}

def compute_l1_l2_diff(fin_eval):
    if not fin_eval or len(fin_eval) < 2:
        return None
    l1_row = next((r for r in fin_eval if r.get('Rank', '').upper() == 'L1'), None)
    l2_row = next((r for r in fin_eval if r.get('Rank', '').upper() == 'L2'), None)
    if not l1_row or not l2_row:
        return None
    try:
        p1 = float(re.sub(r'[^\d.]', '', str(l1_row.get('Total Price') or l1_row.get('Total L1 Price') or '')))
        p2 = float(re.sub(r'[^\d.]', '', str(l2_row.get('Total Price') or l2_row.get('Total L1 Price') or '')))
        if p1 > 0 and p2 > p1:
            diff_amt = p2 - p1
            diff_pct = (diff_amt / p1) * 100.0
            return {
                'l1_seller': l1_row.get('Seller Name') or l1_row.get('L1 Seller Name', ''),
                'l1_price': p1,
                'l2_seller': l2_row.get('Seller Name', ''),
                'l2_price': p2,
                'diff_amount': diff_amt,
                'diff_pct': round(diff_pct, 2),
                'formatted_diff': f"+₹ {diff_amt:,.2f} (+{diff_pct:.2f}%)"
            }
    except Exception:
        pass
    return None

def analyze_company_bid(data, company_keywords=['DALUI', 'G.M. DALUI', 'GM DALUI', 'G M DALUI']):
    t_eval = data.get('technical_evaluation', [])
    f_eval = data.get('financial_evaluation', [])
    
    comp_tech_row = None
    for row in t_eval:
        row_str = (str(row.get('Seller Name', '')) + ' ' + str(row.get('Offered Item', ''))).upper()
        if any(kw in row_str for kw in company_keywords):
            comp_tech_row = row
            break
            
    comp_fin_row = None
    for row in f_eval:
        row_str = (str(row.get('Seller Name', '')) + ' ' + str(row.get('L1 Seller Name', '')) + ' ' + str(row.get('Offered Item', '')) + ' ' + str(row.get('Schedule Title', ''))).upper()
        if any(kw in row_str for kw in company_keywords):
            comp_fin_row = row
            break
            
    if not comp_tech_row and not comp_fin_row:
        return {'participated': False, 'company_name': 'G.M. DALUI & SONS'}
        
    def parse_val(s):
        c = re.sub(r'[^\d.]', '', str(s or ''))
        return float(c) if c else 0.0

    tech_status = comp_tech_row.get('Status', 'N/A') if comp_tech_row else 'N/A'
    st_upper = tech_status.upper()
    
    is_disqual = 'DISQUALIFIED' in st_upper or 'REJECTED' in st_upper
    is_qual = ('QUALIFIED' in st_upper or 'EVALUATED' in st_upper or 'ACCEPTED' in st_upper or (comp_fin_row is not None)) and not is_disqual

    l1_row = next((r for r in f_eval if isinstance(r, dict) and (r.get('Rank', '').upper() == 'L1' or bool(r.get('Total L1 Price')))), None)
    l2_row = next((r for r in f_eval if isinstance(r, dict) and r.get('Rank', '').upper() == 'L2'), None)

    my_rank = str(comp_fin_row.get('Rank', comp_fin_row.get('Schedule Status', 'N/A'))).upper() if comp_fin_row else 'N/A'
    is_l1 = my_rank == 'L1' or my_rank == 'AWARDED' or (comp_fin_row and comp_fin_row.get('L1 Seller Name') and any(kw in str(comp_fin_row.get('L1 Seller Name')).upper() for kw in company_keywords))
    is_l2 = my_rank == 'L2'

    my_price = parse_val(comp_fin_row.get('Total Price') or comp_fin_row.get('Total L1 Price') or '') if comp_fin_row else 0.0
    l1_price = parse_val(l1_row.get('Total Price') or l1_row.get('Total L1 Price') or '') if l1_row else 0.0

    gap_msg = ''
    diff_amount = 0.0
    diff_pct = 0.0

    if comp_fin_row and l1_price > 0 and my_price > 0:
        if is_l1:
            if l2_row:
                p2 = parse_val(l2_row.get('Total Price') or l2_row.get('Total L1 Price') or '')
                if p2 > my_price:
                    diff_amount = p2 - my_price
                    diff_pct = (diff_amount / my_price) * 100.0
                    gap_msg = f"WON L1! Lead over L2: ₹ {diff_amount:,.2f} ({diff_pct:.2f}% lower)"
            else:
                gap_msg = "WON L1! Lowest Bidder"
        else:
            diff_amount = my_price - l1_price
            diff_pct = (diff_amount / l1_price) * 100.0 if l1_price > 0 else 0
            gap_msg = f"Position {my_rank} • Gap to L1: +₹ {diff_amount:,.2f} (+{diff_pct:.2f}% higher)"

    return {
        'participated': True,
        'company_name': 'G.M. DALUI & SONS',
        'tech_status': tech_status,
        'is_qualified': is_qual,
        'is_disqualified': is_disqual,
        'rank': my_rank if not is_l1 else 'L1',
        'is_l1': is_l1,
        'is_l2': is_l2,
        'my_price': my_price,
        'l1_price': l1_price,
        'diff_amount': diff_amount,
        'diff_pct': round(diff_pct, 2),
        'gap_message': gap_msg
    }

def load_all_json_bids():
    json_files = glob.glob(os.path.join(JSON_DIR, "*.json"))
    bids_dict = {}
    remarks = load_remarks()
    statuses = load_statuses()
    
    valid_input_ids = set()
    if os.path.exists(BIDS_INPUT_FILE):
        with open(BIDS_INPUT_FILE, 'r', encoding='utf-8') as f_in:
            for line in f_in:
                line = line.strip()
                if line and not line.startswith('#'):
                    valid_input_ids.add(line.upper())
    
    for filepath in json_files:
        if os.path.basename(filepath).startswith("temp_"):
            continue
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
                # Check if data already has ra_info with parent bid_number
                b_details = data.get('bid_details') or {}
                buyer_details = data.get('buyer_details') or {}
                raw_bid_no = data.get('bid_number') or os.path.splitext(os.path.basename(filepath))[0]
                
                # Extract RA details (ra_info may be explicitly null in some JSON files)
                ra_inf = data.get('ra_info') or {}
                ra_no = ra_inf.get('ra_number') or b_details.get('RA Number') or (raw_bid_no if '/R/' in raw_bid_no.upper() else 'N/A')
                
                # Determine primary bid number (always prefer /B/ format if available)
                bid_no = raw_bid_no
                parent_b = data.get('parent_bid_number') or ra_inf.get('parent_bid_number')
                if '/R/' in bid_no.upper() and parent_b:
                    bid_no = parent_b

                # Normalize Dates into b_details
                ra_s_date = b_details.get('RA Start Date / Time') or b_details.get('RA Start Date') or ra_inf.get('ra_start_date') or (ra_inf.get('ra_schedules', [{}])[0].get('start_date') if ra_inf.get('ra_schedules') else None)
                ra_e_date = b_details.get('RA End Date / Time') or b_details.get('RA End Date') or ra_inf.get('ra_end_date') or (ra_inf.get('ra_schedules', [{}])[0].get('end_date') if ra_inf.get('ra_schedules') else None)
                
                if (not b_details.get('Bid Start Date / Time') or b_details.get('Bid Start Date / Time') == 'N/A') and ra_s_date and ra_s_date != 'N/A':
                    b_details['Bid Start Date / Time'] = ra_s_date
                if (not b_details.get('Bid End Date / Time') or b_details.get('Bid End Date / Time') == 'N/A') and ra_e_date and ra_e_date != 'N/A':
                    b_details['Bid End Date / Time'] = ra_e_date

                # Normalize Buyer Department / Ministry
                if not buyer_details.get('Department') and buyer_details.get('Department Name'):
                    buyer_details['Department'] = buyer_details['Department Name']
                if not buyer_details.get('Ministry') and buyer_details.get('Ministry/State Name'):
                    buyer_details['Ministry'] = buyer_details['Ministry/State Name']
                if not buyer_details.get('Organisation') and buyer_details.get('Organisation Name'):
                    buyer_details['Organisation'] = buyer_details['Organisation Name']
                if not buyer_details.get('Department') and b_details.get('Department Name'):
                    buyer_details['Department'] = b_details['Department Name']

                # Normalize Quantity
                if not b_details.get('Quantity') or b_details.get('Quantity') == 'N/A':
                    if b_details.get('Contract Duration'):
                        b_details['Quantity'] = b_details['Contract Duration']
                    elif b_details.get('Items'):
                        b_details['Quantity'] = b_details['Items']

                data['bid_details'] = b_details
                data['buyer_details'] = buyer_details

                # Filter out files that do not belong to bids_input_sample.txt
                if valid_input_ids:
                    raw_upper = raw_bid_no.upper()
                    bid_upper = bid_no.upper()
                    parent_upper = (parent_b or '').upper()
                    ra_upper = (ra_no or '').upper()
                    source_upper = str(data.get('source_id', '')).upper()

                    if not (raw_upper in valid_input_ids or bid_upper in valid_input_ids or 
                            parent_upper in valid_input_ids or ra_upper in valid_input_ids or 
                            source_upper in valid_input_ids):
                        continue

                title_type = str(data.get('bid_title_type', '')).upper()
                has_r_in_no = '/R/' in raw_bid_no.upper()
                has_ra_title = 'RA DETAILS' in title_type or 'REVERSE AUCTION' in title_type
                has_ra_num = ('RA Number' in b_details) or (ra_no != 'N/A')
                has_ra_dates = 'RA Start Date / Time' in b_details or 'RA End Date / Time' in b_details
                
                is_ra = has_r_in_no or has_ra_title or has_ra_num or has_ra_dates
                ra_status = b_details.get('RA Status', b_details.get('RA Bid Status', b_details.get('Bid Status', 'Active' if is_ra else 'N/A')))

                data['bid_number'] = bid_no
                data['user_remark'] = remarks.get(bid_no, remarks.get(raw_bid_no, ''))
                data['user_status'] = statuses.get(bid_no, statuses.get(raw_bid_no, 'Pending'))
                
                bid_file_name = bid_no.replace('/', '_')
                pdf_path = os.path.join(PDF_DIR, f"{bid_file_name}.pdf")
                data['has_pdf'] = os.path.exists(pdf_path)
                data['pdf_filename'] = f"{bid_file_name}.pdf"
                data['l1_l2_diff'] = compute_l1_l2_diff(data.get('financial_evaluation', []))
                data['company_analysis'] = analyze_company_bid(data)

                data['ra_info'] = {
                    'is_ra': is_ra,
                    'ra_number': ra_no,
                    'ra_status': ra_status,
                    'ra_start_date': b_details.get('RA Start Date / Time', b_details.get('RA Start Date', ra_inf.get('ra_start_date', 'N/A'))),
                    'ra_end_date': b_details.get('RA End Date / Time', b_details.get('RA End Date', ra_inf.get('ra_end_date', 'N/A')))
                }
                
                # Deduplicate: if bid_no is already in bids_dict, merge RA info into existing record
                if bid_no in bids_dict:
                    existing = bids_dict[bid_no]
                    if isinstance(existing, dict):
                        existing_ra = existing.get('ra_info') or {}
                        if is_ra and not existing_ra.get('is_ra'):
                            existing['ra_info'] = data['ra_info']
                        elif is_ra and ra_no != 'N/A':
                            if not isinstance(existing.get('ra_info'), dict):
                                existing['ra_info'] = {}
                            existing['ra_info']['ra_number'] = ra_no
                            existing['ra_info']['is_ra'] = True
                        if not existing.get('user_remark') and data.get('user_remark'):
                            existing['user_remark'] = data['user_remark']
                else:
                    bids_dict[bid_no] = data

        except Exception as e:
            print(f"Error loading {filepath}: {e}")
    
    bids = [b for b in bids_dict.values() if isinstance(b, dict)]
    bids.sort(key=lambda x: str((x or {}).get('bid_number') or ''), reverse=True)

    # Merge DB records (attachments, drive_links, db_remarks) into each bid
    try:
        db_records = get_all_gem_records()
        all_files_map = get_all_gem_files()
        db_map = {}

        def get_keys_for_id(val):
            if not val:
                return []
            s = str(val).strip().upper()
            keys = {s}
            keys.add(s.replace('_', '/'))
            keys.add(s.replace('/', '_'))
            clean = re.sub(r'[^A-Z0-9]', '', s)
            if clean:
                keys.add(clean)
            digits = re.sub(r'\D', '', s)
            if len(digits) >= 5:
                keys.add(digits)
            return list(keys)

        for rec in db_records:
            gid = str(rec.get('gem_id', '')).strip().upper()
            if gid:
                for k in get_keys_for_id(gid):
                    if k not in db_map:
                        db_map[k] = rec

        matched_db_recs = set()
        for b in bids:
            bid_key = b.get('bid_number', '')
            raw_key = b.get('raw_bid_no', '')
            source_key = b.get('source_id', '')
            ra_key = (b.get('ra_info') or {}).get('ra_number', '')

            search_keys = get_keys_for_id(bid_key) + get_keys_for_id(raw_key) + get_keys_for_id(source_key) + get_keys_for_id(ra_key)
            db_rec = None
            for sk in search_keys:
                if sk in db_map:
                    db_rec = db_map[sk]
                    break

            # Collect multiple files from gmd_gem_files table
            files_from_db_table = []
            for sk in search_keys:
                if sk in all_files_map:
                    files_from_db_table.extend(all_files_map[sk])

            # Deduplicate by url
            seen_urls = set()
            combined_attachments = []
            for f in files_from_db_table:
                u = f.get('url') or f.get('drive_link')
                if u and u not in seen_urls:
                    seen_urls.add(u)
                    combined_attachments.append({
                        'name': f.get('file_name') or f.get('name') or 'Doc',
                        'url': u,
                        'type': (f.get('file_type') or f.get('type') or 'pdf').lower()
                    })

            if db_rec:
                for att in db_rec.get('attachments', []):
                    u = att.get('url') if isinstance(att, dict) else att
                    if u and u not in seen_urls:
                        seen_urls.add(u)
                        combined_attachments.append(att if isinstance(att, dict) else {'name': 'Doc', 'url': u, 'type': 'pdf'})
                b['db_remarks'] = db_rec.get('remarks', '')
                b['order_pdf'] = db_rec.get('order_pdf') or ''
                matched_db_recs.add(db_rec.get('id'))
            else:
                b['db_remarks'] = ''
                b['order_pdf'] = ''

            b['attachments'] = combined_attachments
            b['drive_links'] = [a['url'] for a in combined_attachments]

        # Add DB-only records (uploaded but not yet scraped) as standalone bids
        for rec in db_records:
            rec_id = rec.get('id')
            if rec_id not in matched_db_recs and (rec.get('attachments') or rec.get('drive_links') or rec.get('order_pdf')):
                stub_bid = {
                    'bid_number': rec['gem_id'],
                    'raw_bid_no': rec['gem_id'],
                    'bid_details': {},
                    'buyer_details': {},
                    'technical_evaluation': [],
                    'financial_evaluation': [],
                    'ra_info': {'is_ra': False, 'ra_number': 'N/A', 'ra_status': 'N/A', 'ra_start_date': 'N/A', 'ra_end_date': 'N/A'},
                    'company_analysis': {'participated': False, 'company_name': 'G.M. DALUI & SONS'},
                    'l1_l2_diff': None,
                    'user_remark': rec.get('remarks', ''),
                    'user_status': 'Pending',
                    'attachments': rec.get('attachments', []),
                    'drive_links': rec.get('drive_links', []),
                    'db_remarks': rec.get('remarks', ''),
                    'order_pdf': rec.get('order_pdf') or '',
                    'has_pdf': bool(rec.get('order_pdf')),
                    'pdf_filename': rec['gem_id'].replace('/', '_') + '.pdf',
                }
                bids.append(stub_bid)
    except Exception as dbe:
        print(f"[DB MERGE] Could not merge DB records into bids: {dbe}")

    return bids

def run_batch_scrape(inputs_list):
    global scraper_state
    scraper_state["is_running"] = True
    scraper_state["total_items"] = len(inputs_list)
    scraper_state["current_index"] = 0
    scraper_state["completed_items"] = []
    scraper_state["failed_items"] = []
    scraper_state["status_message"] = "Started batch scraping..."
    scraper_state["error"] = None

    all_results = []
    pdf_paths = []

    for i, item in enumerate(inputs_list):
        scraper_state["current_index"] = i + 1
        scraper_state["current_item"] = item
        scraper_state["status_message"] = f"Scraping bid {i+1}/{len(inputs_list)}: {item}..."
        print(f"[SCRAPER WORKER] Scraping {item}...")

        # Load old JSON data before scrape to detect changes
        clean_item_file = item.replace('/', '_')
        old_json_path = os.path.join(JSON_DIR, f"{clean_item_file}.json")
        old_data = None
        if os.path.exists(old_json_path):
            try:
                with open(old_json_path, 'r', encoding='utf-8') as f_old:
                    old_data = json.load(f_old)
            except Exception:
                old_data = None

        try:
            data, pdf_path = scrape_gem_bid(item, output_dir=OUTPUT_DIR)
            if data and isinstance(data, dict):
                all_results.append(data)
                scraper_state["completed_items"].append(item)
                # Automatically detect and log bid changes to Notification Center
                try:
                    detect_bid_changes(old_data, data, item)
                except Exception as ne:
                    print(f"[NOTIFICATION ERROR] {ne}")
            else:
                scraper_state["failed_items"].append({"item": item, "error": "No data returned"})
            if pdf_path and isinstance(pdf_path, str) and os.path.exists(pdf_path):
                pdf_paths.append(pdf_path)
        except Exception as e:
            print(f"[SCRAPER WORKER ERROR] Failed {item}: {e}")
            scraper_state["failed_items"].append({"item": item, "error": str(e)})

    # Generate Summary CSV
    if all_results:
        summary_rows = []
        for d in all_results:
            if not isinstance(d, dict):
                continue
            b_details = d.get('bid_details') or {}
            b_buyer = d.get('buyer_details') or {}
            t_eval = d.get('technical_evaluation') or []
            f_eval = d.get('financial_evaluation') or []
            
            t_qual = sum(1 for x in t_eval if isinstance(x, dict) and 'QUALIFIED' in str(x.get('Status', '')).upper() and 'DISQUALIFIED' not in str(x.get('Status', '')).upper())
            t_disqual = sum(1 for x in t_eval if isinstance(x, dict) and 'DISQUALIFIED' in str(x.get('Status', '')).upper())

            l1_seller = 'N/A'
            l1_price = 'N/A'
            if isinstance(f_eval, list) and len(f_eval) > 0 and isinstance(f_eval[0], dict):
                l1_seller = f_eval[0].get('Seller Name', 'N/A')
                l1_price = f_eval[0].get('Total Price', 'N/A')

            row = {
                'Bid Number': d.get('bid_number', ''),
                'Source ID': d.get('source_id', ''),
                'Bid Status': b_details.get('Bid Status', ''),
                'Quantity': b_details.get('Quantity', ''),
                'Start Date': b_details.get('Bid Start Date / Time', ''),
                'End Date': b_details.get('Bid End Date / Time', ''),
                'Buyer Name': b_buyer.get('Name', ''),
                'Buyer Ministry': b_buyer.get('Ministry', ''),
                'Buyer Organisation': b_buyer.get('Organisation', ''),
                'Total Tech Sellers': len(t_eval) if isinstance(t_eval, list) else 0,
                'Qualified Sellers': t_qual,
                'Disqualified Sellers': t_disqual,
                'Financial L1 Seller': l1_seller,
                'Financial L1 Price': l1_price
            }
            summary_rows.append(row)

        summary_df = pd.DataFrame(summary_rows)
        summary_df.to_csv(CSV_PATH, index=False, encoding='utf-8-sig')

        # Merge PDFs if multiple
        if len(pdf_paths) > 1:
            try:
                from PyPDF2 import PdfMerger
                merger = PdfMerger()
                for pdf in pdf_paths:
                    if os.path.exists(pdf):
                        merger.append(pdf)
                merger.write(COMBINED_PDF_PATH)
                merger.close()
            except Exception as me:
                print(f"Error merging PDFs: {me}")

    scraper_state["is_running"] = False
    scraper_state["status_message"] = f"Finished scraping {len(scraper_state['completed_items'])} bid(s)."

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/bids', methods=['GET'])
def get_bids():
    bids = load_all_json_bids()
    
    total_bids = len(bids)
    total_tech_qualified = 0
    total_tech_disqualified = 0
    total_financial_l1 = 0
    
    # G.M. DALUI specific stats
    dalui_participated = 0
    dalui_qualified_total = 0
    dalui_qualified_excl_l1 = 0
    dalui_disqualified = 0
    dalui_l1 = 0
    dalui_l2 = 0

    for b in bids:
        t_eval = b.get('technical_evaluation') or []
        f_eval = b.get('financial_evaluation') or []
        c_an = b.get('company_analysis', {})

        for t in t_eval:
            if not isinstance(t, dict): continue
            st = t.get('Status', '').upper()
            if 'QUALIFIED' in st and 'DISQUALIFIED' not in st:
                total_tech_qualified += 1
            elif 'DISQUALIFIED' in st:
                total_tech_disqualified += 1
                
        if f_eval:
            total_financial_l1 += 1

        if c_an.get('participated'):
            dalui_participated += 1
            if c_an.get('is_disqualified'):
                dalui_disqualified += 1
            elif c_an.get('is_l1'):
                dalui_l1 += 1
                dalui_qualified_total += 1
            elif c_an.get('is_qualified'):
                dalui_qualified_total += 1
                dalui_qualified_excl_l1 += 1

            if c_an.get('is_l2'):
                dalui_l2 += 1

    return jsonify({
        'status': 'success',
        'stats': {
            'total_bids': total_bids,
            'tech_qualified': total_tech_qualified,
            'tech_disqualified': total_tech_disqualified,
            'financial_l1_count': total_financial_l1,
            'company_stats': {
                'name': 'G.M. DALUI',
                'participated': dalui_participated,
                'qualified': dalui_qualified_excl_l1,
                'qualified_total': dalui_qualified_total,
                'disqualified': dalui_disqualified,
                'l1_won': dalui_l1,
                'l2_missed': dalui_l2
            }
        },
        'bids': bids
    })

@app.route('/api/remark', methods=['POST'])
def save_user_remark():
    req = request.json or {}
    bid_no = req.get('bid_number')
    remark = req.get('remark', '')
    if not bid_no:
        return jsonify({'status': 'error', 'message': 'bid_number is required'}), 400
    save_remark(bid_no, remark)
    try:
        save_gem_record(bid_no, remarks=remark)
    except Exception as dbe:
        print(f"Error syncing remark to DB table gmd_gem_ids: {dbe}")
    return jsonify({'status': 'success', 'bid_number': bid_no, 'remark': remark})

@app.route('/api/upload-bid-document', methods=['POST'])
def upload_bid_document():
    gem_id = request.form.get('gem_id', '').strip()
    remarks = request.form.get('remarks', '').strip()
    file = request.files.get('pdf_file')

    if not gem_id:
        return jsonify({'status': 'error', 'message': 'GeM BID / RA ID is required'}), 400

    clean_bid_no = gem_id.upper()
    drive_link = None

    if file and file.filename:
        orig_ext = os.path.splitext(file.filename)[1] or '.pdf'
        ts = int(time.time())
        safe_filename = f"{clean_bid_no.replace('/', '_')}_{ts}{orig_ext}"
        local_pdf_path = os.path.join(PDF_DIR, safe_filename)
        file.save(local_pdf_path)

        # Upload file to Google Drive folder 1WR5AkLfp_ymTgBeLbLbfJq1Zng_KfB90
        try:
            drive_link = upload_pdf_to_gdrive(local_pdf_path, filename=safe_filename)
            print(f"[GDRIVE UPLOAD] Uploaded {safe_filename} -> {drive_link}")
        except Exception as e:
            print(f"[GDRIVE ERROR] Google Drive upload error: {e}")
            drive_link = f"/api/view-pdf/{safe_filename}"  # Fallback link so attachment ALWAYS saves and displays

    # Save record to Database table gmd_gem_files & gmd_gem_ids
    file_rec = save_file_record(clean_bid_no, file_name=file.filename if file else "Uploaded Document", drive_link=drive_link, file_type=orig_ext.lstrip('.') if file else "pdf")
    db_rec = save_gem_record(clean_bid_no, drive_link=drive_link, remarks=remarks, filename=file.filename if file else None)

    # Save remark if provided
    if remarks:
        save_remark(clean_bid_no, remarks)

    # Append new GeM ID to bids_input_sample.txt so scraper scans it
    try:
        existing_items = []
        if os.path.exists(BIDS_INPUT_FILE):
            with open(BIDS_INPUT_FILE, 'r', encoding='utf-8') as f_in:
                existing_items = [l.strip().upper() for l in f_in if l.strip() and not l.startswith('#')]
        
        if clean_bid_no not in existing_items:
            with open(BIDS_INPUT_FILE, 'a', encoding='utf-8') as f_app:
                f_app.write(f"\n{clean_bid_no}")
    except Exception as fe:
        print(f"Error appending GeM ID to scraper input file: {fe}")

    return jsonify({
        'status': 'success',
        'gem_id': clean_bid_no,
        'drive_link': drive_link,
        'remarks': remarks,
        'db_record': db_rec,
        'file_record': file_rec
    })

@app.route('/api/view-pdf/<path:filename>', methods=['GET'])
def view_local_pdf(filename):
    """Serve uploaded PDF locally if Google Drive link is unavailable."""
    file_path = os.path.join(PDF_DIR, filename)
    if os.path.exists(file_path):
        return send_file(file_path)
    return jsonify({'status': 'error', 'message': 'File not found'}), 404

@app.route('/api/add-drive-link', methods=['POST'])
def add_drive_link():
    """Add a Google Drive link manually to a GeM ID without uploading a file."""
    req = request.json or {}
    gem_id = req.get('gem_id', '').strip()
    drive_link = req.get('drive_link', '').strip()

    if not gem_id:
        return jsonify({'status': 'error', 'message': 'gem_id is required'}), 400
    if not drive_link:
        return jsonify({'status': 'error', 'message': 'drive_link is required'}), 400

    clean_bid_no = gem_id.upper()
    file_rec = save_file_record(clean_bid_no, file_name="Drive Document", drive_link=drive_link, file_type="pdf")
    db_rec = save_gem_record(clean_bid_no, drive_link=drive_link)

    # Append to bids_input_sample.txt if not already present
    try:
        existing_items = []
        if os.path.exists(BIDS_INPUT_FILE):
            with open(BIDS_INPUT_FILE, 'r', encoding='utf-8') as f_in:
                existing_items = [l.strip().upper() for l in f_in if l.strip() and not l.startswith('#')]
        if clean_bid_no not in existing_items:
            with open(BIDS_INPUT_FILE, 'a', encoding='utf-8') as f_app:
                f_app.write(f"\n{clean_bid_no}")
    except Exception as fe:
        print(f"Error appending GeM ID to scraper input file: {fe}")

    return jsonify({
        'status': 'success',
        'gem_id': clean_bid_no,
        'drive_link': drive_link,
        'db_record': db_rec
    })

@app.route('/api/db-records', methods=['GET'])
def get_db_records_endpoint():
    records = get_all_gem_records()
    return jsonify({'status': 'success', 'records': records})

@app.route('/api/notifications', methods=['GET'])
def get_notifications_endpoint():
    notifs = load_notifications()
    unread_count = sum(1 for n in notifs if not n.get('read'))
    return jsonify({'status': 'success', 'notifications': notifs, 'unread_count': unread_count})

@app.route('/api/notifications/read', methods=['POST'])
def mark_notifications_read_endpoint():
    req = request.json or {}
    ids = req.get('ids')
    updated = mark_notifications_read(ids)
    unread_count = sum(1 for n in updated if not n.get('read'))
    return jsonify({'status': 'success', 'notifications': updated, 'unread_count': unread_count})

@app.route('/api/status', methods=['POST'])
def save_manual_user_status():
    req = request.json or {}
    bid_no = req.get('bid_number')
    user_status = req.get('user_status', 'Pending')
    if not bid_no:
        return jsonify({'status': 'error', 'message': 'bid_number is required'}), 400
    save_user_status(bid_no, user_status)
    return jsonify({'status': 'success', 'bid_number': bid_no, 'user_status': user_status})

import urllib.parse

@app.route('/api/bid/<path:bid_no>', methods=['GET'])
def get_single_bid(bid_no):
    bid_no_clean = urllib.parse.unquote(bid_no).strip().upper()
    all_bids = load_all_json_bids()
    
    for b in all_bids:
        bn = str(b.get('bid_number', '')).strip().upper()
        rn = str(b.get('ra_info', {}).get('ra_number', '')).strip().upper()
        raw = str(b.get('raw_bid_no', '')).strip().upper()
        if bid_no_clean in (bn, rn, raw) or bid_no_clean.replace('_', '/') in (bn, rn, raw):
            return jsonify({'status': 'success', 'data': b})

    # Fallback to direct file search
    clean_no = bid_no_clean.replace('/', '_')
    json_path = os.path.join(JSON_DIR, f"{clean_no}.json")
    if os.path.exists(json_path):
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        data['company_analysis'] = analyze_company_bid(data)
        data['l1_l2_diff'] = compute_l1_l2_diff(data.get('financial_evaluation', []))
        return jsonify({'status': 'success', 'data': data})

    return jsonify({'status': 'error', 'message': f'Bid JSON not found for {bid_no}'}), 404

@app.route('/api/pdf/<path:filename>', methods=['GET'])
def get_pdf(filename):
    if filename == "combined":
        if os.path.exists(COMBINED_PDF_PATH):
            return send_file(COMBINED_PDF_PATH, mimetype='application/pdf')
        else:
            return jsonify({'status': 'error', 'message': 'Combined PDF not found'}), 404
            
    pdf_file = os.path.join(PDF_DIR, filename)
    if os.path.exists(pdf_file):
        return send_file(pdf_file, mimetype='application/pdf')
    return jsonify({'status': 'error', 'message': f'PDF file {filename} not found'}), 404

@app.route('/api/csv', methods=['GET'])
def get_summary_csv():
    if os.path.exists(CSV_PATH):
        return send_file(CSV_PATH, mimetype='text/csv', as_attachment=True, download_name='gem_bids_summary.csv')
    return jsonify({'status': 'error', 'message': 'Summary CSV not found'}), 404

@app.route('/api/inputs', methods=['GET', 'POST'])
def handle_inputs():
    if request.method == 'POST':
        data = request.json or {}
        inputs_text = data.get('inputs', '')
        if inputs_text:
            lines = [l.strip() for l in inputs_text.replace(',', '\n').split('\n') if l.strip()]
            with open(BIDS_INPUT_FILE, 'w', encoding='utf-8') as f:
                f.write("# GeM Bid IDs or URLs\n" + "\n".join(lines))
            return jsonify({'status': 'success', 'count': len(lines), 'items': lines})
        return jsonify({'status': 'error', 'message': 'No input provided'}), 400
    else:
        items = []
        if os.path.exists(BIDS_INPUT_FILE):
            with open(BIDS_INPUT_FILE, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        items.append(line)
        return jsonify({'status': 'success', 'items': items})

@app.route('/api/run-scraper', methods=['POST'])
def trigger_scraper():
    global scraper_state
    if scraper_state["is_running"]:
        return jsonify({'status': 'error', 'message': 'Scraper is already running'}), 400

    data = request.json or {}
    items_to_scrape = data.get('items', [])
    
    if not items_to_scrape:
        # Load from file
        if os.path.exists(BIDS_INPUT_FILE):
            with open(BIDS_INPUT_FILE, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        items_to_scrape.append(line)

    if not items_to_scrape:
        items_to_scrape = ["5705747", "6000000", "9689162", "9734482"]

    # Start thread
    thread = threading.Thread(target=run_batch_scrape, args=(items_to_scrape,))
    thread.daemon = True
    thread.start()

    return jsonify({
        'status': 'started',
        'message': f'Started scraping {len(items_to_scrape)} item(s)',
        'items': items_to_scrape
    })

SCHEDULER_INTERVAL = int(os.environ.get('SCHEDULER_INTERVAL', 7200))  # Default 2 hours (7200s)

scheduler_state = {
    'enabled': True,
    'interval_seconds': SCHEDULER_INTERVAL,
    'interval_hours': round(SCHEDULER_INTERVAL / 3600.0, 2),
    'current_round': 0,
    'last_run': None,
    'last_finish': None,
    'next_run': None,
    'last_scraped_count': 0,
    'status': 'initialized'
}

def background_2h_scheduler():
    """Background daemon thread that runs batch scrape rounds every 2 hours continuously."""
    print(f"\n[SCHEDULER] 2-Hour Auto-Scanner Daemon Initialized (Interval: {SCHEDULER_INTERVAL} seconds / {scheduler_state['interval_hours']} hours)", flush=True)
    # Perform initial startup delay before first round
    time.sleep(5)
    
    round_count = 0
    while True:
        try:
            round_count += 1
            now = datetime.now(timezone.utc)
            scheduler_state['last_run'] = now.isoformat()
            scheduler_state['status'] = f'running_round_{round_count}'
            scheduler_state['current_round'] = round_count

            print(f"\n[SCHEDULER] === Starting Scraping Round #{round_count} at {now.strftime('%Y-%m-%d %H:%M:%S UTC')} ===", flush=True)

            items_to_scrape = []
            if os.path.exists(BIDS_INPUT_FILE):
                with open(BIDS_INPUT_FILE, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            items_to_scrape.append(line)

            if items_to_scrape and not scraper_state.get('is_running'):
                print(f"[SCHEDULER] Round #{round_count}: Auto-triggering full scrape of ALL {len(items_to_scrape)} bid IDs from '{BIDS_INPUT_FILE}'...", flush=True)
                scheduler_state['last_scraped_count'] = len(items_to_scrape)
                
                # Execute full batch scrape for ALL bid IDs
                run_batch_scrape(items_to_scrape)
            else:
                if scraper_state.get('is_running'):
                    print(f"[SCHEDULER] Scraper engine is already active. Skipping auto-trigger for Round #{round_count}.", flush=True)
                else:
                    print(f"[SCHEDULER] No items found in '{BIDS_INPUT_FILE}' to scan.", flush=True)
                scheduler_state['last_scraped_count'] = 0

            # Round completed! Record finish time and exact next run timestamp (2 hours after finish)
            finish_time = datetime.now(timezone.utc)
            next_timestamp = finish_time.timestamp() + SCHEDULER_INTERVAL
            scheduler_state['last_finish'] = finish_time.isoformat()
            scheduler_state['next_run'] = datetime.fromtimestamp(next_timestamp, timezone.utc).isoformat()
            scheduler_state['status'] = 'waiting_2h'

            print(f"[SCHEDULER] Round #{round_count} finished at {finish_time.strftime('%Y-%m-%d %H:%M:%S UTC')}. Next Round #{round_count+1} starts in 2 hours at {scheduler_state['next_run']}.", flush=True)

        except Exception as e:
            print(f"[SCHEDULER ERROR] Exception in Round #{round_count}: {e}", flush=True)
            scheduler_state['status'] = 'error'
            finish_time = datetime.now(timezone.utc)
            next_timestamp = finish_time.timestamp() + SCHEDULER_INTERVAL
            scheduler_state['next_run'] = datetime.fromtimestamp(next_timestamp, timezone.utc).isoformat()

        # Wait 2 hours (7200 seconds) before starting the next round
        time.sleep(SCHEDULER_INTERVAL)

_scheduler_started = False
_scheduler_lock = threading.Lock()

def start_scheduler():
    global _scheduler_started
    with _scheduler_lock:
        if not _scheduler_started:
            _scheduler_started = True
            t = threading.Thread(target=background_2h_scheduler, daemon=True)
            t.start()
            print("[DOCKER AUTO-START] 2-Hour Auto-Scheduler launched automatically on container startup.", flush=True)

# Start scheduler daemon automatically on container import/start
start_scheduler()

@app.before_request
def auto_start_scheduler_on_request():
    start_scheduler()

@app.route('/api/health', methods=['GET'])
def get_health():
    uptime = round(time.time() - START_TIME, 2)
    response = jsonify({
        'status': 'ok',
        'uptime': uptime,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'scheduler': scheduler_state
    })
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response

@app.route('/api/scraper-status', methods=['GET'])
def get_scraper_status():
    return jsonify(scraper_state)

@app.route('/api/scheduler-status', methods=['GET'])
def get_scheduler_status():
    return jsonify(scheduler_state)

if __name__ == '__main__':
    import socket
    local_ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        try:
            local_ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            pass

    port = int(os.environ.get('PORT', 6001))
    print(f"\n=======================================================")
    print(f"[SERVER] Starting GeM Bid Scraper Dashboard on Network")
    print(f"  • Local Machine : http://127.0.0.1:{port}")
    print(f"  • Local Network : http://{local_ip}:{port}")
    print(f"  • Auto Scheduler: Running every 2 Hours ({SCHEDULER_INTERVAL}s)")
    print(f"=======================================================\n")
    app.run(host='0.0.0.0', port=port, debug=False)
