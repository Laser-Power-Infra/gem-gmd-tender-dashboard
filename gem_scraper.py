import os
import re
import sys
import json
import argparse
import requests
import pandas as pd
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

# Ensure stdout and stderr handle utf-8 on Windows / non-UTF8 terminals
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Headers to emulate browser request
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
}

def clean_text(text):
    if not text:
        return ""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def format_price(price_str):
    if not price_str:
        return "N/A"
    price_str = price_str.replace('`', '₹').replace('INR', '₹').strip()
    if not price_str.startswith('₹'):
        price_str = '₹ ' + price_str
    return price_str

def parse_offered_item(offered_text):
    """
    Split Make, Model, Title, etc. from Offered Item text if present.
    """
    cleaned = clean_text(offered_text)
    for token in ['Make :', 'Make:', 'Model :', 'Model:', 'Title :', 'Title:', 'Item Categories :']:
        cleaned = cleaned.replace(token, f"\n{token}")
    lines = [l.strip() for l in cleaned.split('\n') if l.strip()]
    return lines

def extract_bid_details_from_html(html_content, source_id=""):
    soup = BeautifulSoup(html_content, 'html.parser')
    
    data = {
        'source_id': source_id,
        'bid_number': source_id,
        'bid_title_type': 'BID DETAILS',
        'bid_details': {},
        'buyer_details': {},
        'technical_evaluation': [],
        'financial_evaluation': []
    }
    
    panels = soup.find_all(class_='panel')
    for panel in panels:
        heading_el = panel.find(class_='panel-heading')
        heading_text = clean_text(heading_el.get_text()) if heading_el else ""
        
        # 1. BID / RA DETAILS
        if 'BID DETAILS' in heading_text.upper() or 'RA DETAILS' in heading_text.upper():
            if 'RA DETAILS' in heading_text.upper():
                data['bid_title_type'] = 'RA DETAILS'
            
            if '-' in heading_text:
                extracted_no = heading_text.split('-')[-1].strip()
                if extracted_no:
                    data['bid_number'] = extracted_no

            card_body = panel.find(class_='panel-body')
            if card_body:
                all_text_nodes = [clean_text(s) for s in card_body.stripped_strings if clean_text(s)]
                
                i = 0
                while i < len(all_text_nodes):
                    node = all_text_nodes[i]
                    if node.endswith(':') and i + 1 < len(all_text_nodes):
                        k = node[:-1].strip()
                        v = all_text_nodes[i+1].strip()
                        if not v.endswith(':'):
                            if k in ['Name', 'Address', 'Ministry', 'Department', 'Organisation', 'Office', 'State', 'Designation', 'Ministry/State Name', 'Department Name', 'Organisation Name', 'Office Name']:
                                data['buyer_details'][k] = v
                            elif k not in ['Buyer Details', 'Consignees / Reporting Officer / Delivery Location(S)', 'Buyer Uploaded CA Documents']:
                                data['bid_details'][k] = v
                            i += 2
                            continue
                    i += 1
                
                if 'Bid Number' in data['bid_details'] and data['bid_details']['Bid Number']:
                    data['bid_number'] = data['bid_details']['Bid Number']
                elif 'RA Number' in data['bid_details'] and data['bid_details']['RA Number']:
                    data['bid_number'] = data['bid_details']['RA Number']

        # 2. TECHNICAL EVALUATION
        elif 'TECHNICAL EVALUATION' in heading_text.upper():
            table = panel.find('table')
            if table:
                headers = [clean_text(th.get_text()) for th in table.find_all('th')]
                rows = table.find_all('tr')[1:]
                for r in rows:
                    tds = r.find_all('td')
                    if not tds:
                        continue
                    cols = [clean_text(td.get_text(separator=' ')) for td in tds]
                    item = {}
                    for idx, h in enumerate(headers):
                        val = cols[idx] if idx < len(cols) else ""
                        item[h] = val
                    data['technical_evaluation'].append(item)

        # 3. FINANCIAL EVALUATION
        elif 'FINANCIAL EVALUATION' in heading_text.upper():
            table = panel.find('table')
            if table:
                headers = [clean_text(th.get_text()) for th in table.find_all('th')]
                rows = table.find_all('tr')[1:]
                for r in rows:
                    tds = r.find_all('td')
                    if not tds:
                        continue
                    cols = [clean_text(td.get_text(separator=' ')) for td in tds]
                    item = {}
                    for idx, h in enumerate(headers):
                        val = cols[idx] if idx < len(cols) else ""
                        item[h] = val
                    data['financial_evaluation'].append(item)

    # NORMALIZE BUYER DETAILS
    by = data['buyer_details']
    if 'Ministry/State Name' in by and not by.get('Ministry'):
        by['Ministry'] = by['Ministry/State Name']
    if 'Department Name' in by and not by.get('Department'):
        by['Department'] = by['Department Name']
    if 'Organisation Name' in by and not by.get('Organisation'):
        by['Organisation'] = by['Organisation Name']
    if 'Office Name' in by and not by.get('Office'):
        by['Office'] = by['Office Name']

    # REVERSE AUCTION (RA) DETECTION
    bid_no_str = data.get('bid_number', '')
    b_details = data.get('bid_details', {})
    title_type = data.get('bid_title_type', '')
    
    is_ra = ('/R/' in bid_no_str) or ('RA DETAILS' in title_type.upper()) or ('RA Number' in b_details) or ('RA Status' in b_details)
    ra_number = b_details.get('RA Number', bid_no_str if '/R/' in bid_no_str else '')
    ra_status = b_details.get('RA Status', b_details.get('RA Bid Status', b_details.get('Bid Status', 'Active' if is_ra else 'N/A')))
    
    ra_start = b_details.get('RA Start Date / Time', b_details.get('RA Start Date', 'N/A'))
    ra_end = b_details.get('RA End Date / Time', b_details.get('RA End Date', 'N/A'))

    # If primary bid dates are missing but RA dates exist, use them
    if not b_details.get('Bid Start Date / Time') and ra_start != 'N/A':
        b_details['Bid Start Date / Time'] = ra_start
    if not b_details.get('Bid End Date / Time') and ra_end != 'N/A':
        b_details['Bid End Date / Time'] = ra_end

    data['ra_info'] = {
        'is_ra': is_ra,
        'ra_number': ra_number,
        'ra_status': ra_status,
        'ra_start_date': ra_start,
        'ra_end_date': ra_end
    }

    return data

def build_pdf_html(data):
    bid_no = data.get('bid_number', 'N/A')
    title_type = data.get('bid_title_type', 'BID DETAILS')
    bid_details = data.get('bid_details', {})
    buyer_details = data.get('buyer_details', {})
    tech_eval = data.get('technical_evaluation', [])
    fin_eval = data.get('financial_evaluation', [])
    ra_info = data.get('ra_info', {})
    
    is_ra = ra_info.get('is_ra', False)
    ra_no = ra_info.get('ra_number', bid_details.get('RA Number', 'N/A'))
    ra_status = ra_info.get('ra_status', 'N/A')
    bid_status = bid_details.get('Bid Status', bid_details.get('RA Status', 'Active'))
    
    ra_header_badge = f'<span class="badge badge-purple" style="margin-left:4px;">⚡ RA: {ra_no}</span>' if (is_ra and ra_no != 'N/A') else ''

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>GeM Bid & RA Evaluation Report - {bid_no}</title>
<style>
  @page {{
    size: A4;
    margin: 15mm 12mm 15mm 12mm;
  }}
  body {{
    font-family: 'Segoe UI', Arial, sans-serif;
    color: #1e293b;
    background-color: #ffffff;
    margin: 0;
    padding: 0;
    font-size: 10pt;
    line-height: 1.4;
  }}
  .header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2.5px solid #0284c7;
    padding-bottom: 10px;
    margin-bottom: 16px;
  }}
  .header-left h1 {{
    margin: 0;
    font-size: 16pt;
    color: #0f172a;
    font-weight: 700;
  }}
  .header-left p {{
    margin: 2px 0 0 0;
    font-size: 9pt;
    color: #64748b;
  }}
  .badge {{
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 8.5pt;
    font-weight: 600;
    display: inline-block;
  }}
  .badge-blue {{ background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }}
  .badge-purple {{ background-color: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; }}
  .badge-green {{ background-color: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }}
  .badge-red {{ background-color: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }}
  .badge-gold {{ background-color: #fef9c3; color: #a16207; border: 1px solid #fef08a; }}
  .badge-slate {{ background-color: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }}

  .card {{
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 16px;
    page-break-inside: avoid;
  }}
  .card-header {{
    font-size: 11.5pt;
    font-weight: 700;
    color: #0f172a;
    margin-top: 0;
    margin-bottom: 10px;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }}
  .grid-container {{
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px 20px;
  }}
  .info-block {{
    font-size: 9pt;
  }}
  .info-label {{
    font-weight: 600;
    color: #475569;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 1px;
  }}
  .info-val {{
    color: #0f172a;
    word-break: break-word;
  }}
  
  table.eval-table {{
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
    font-size: 9pt;
  }}
  table.eval-table th {{
    background-color: #0f172a;
    color: #ffffff;
    text-align: left;
    padding: 8px 10px;
    font-size: 8.5pt;
    font-weight: 600;
  }}
  table.eval-table td {{
    padding: 8px 10px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }}
  table.eval-table tr:nth-child(even) {{
    background-color: #f8fafc;
  }}
  .offered-lines {{
    font-size: 8.5pt;
    color: #334155;
    line-height: 1.35;
  }}
  .footer {{
    margin-top: 20px;
    text-align: center;
    font-size: 8pt;
    color: #94a3b8;
    border-top: 1px solid #e2e8f0;
    padding-top: 8px;
  }}
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>Government e Marketplace (GeM)</h1>
      <p>Bid & Reverse Auction (RA) Evaluation Report</p>
    </div>
    <div>
      <span class="badge badge-blue">BID: {bid_no}</span>
      {ra_header_badge}
      <span class="badge badge-green" style="margin-left:4px;">{bid_status}</span>
    </div>
  </div>

  <!-- 1. BID & REVERSE AUCTION DETAILS -->
  <div class="card">
    <div class="card-header">1. {title_type} ({bid_no})</div>
    <div class="grid-container">
      <div class="info-block">
        <div class="info-label">Standard Bid Number</div>
        <div class="info-val"><strong>{bid_no}</strong></div>
      </div>
      <div class="info-block">
        <div class="info-label">Reverse Auction (RA) Number</div>
        <div class="info-val"><strong>{ra_no if is_ra else 'N/A (Standard Bid)'}</strong></div>
      </div>
"""
    for k, v in bid_details.items():
        if k not in ['Bid Number', 'RA Number']:
            html += f"""
      <div class="info-block">
        <div class="info-label">{k}</div>
        <div class="info-val">{v}</div>
      </div>"""
        
    html += """
    </div>
  </div>
"""

    # 1.5 REVERSE AUCTION PANEL IN PDF IF RA IS PRESENT
    if is_ra:
        html += f"""
  <div class="card" style="background:#faf5ff; border:1.5px solid #d8b4fe;">
    <div class="card-header" style="color:#6b21a8; border-bottom:1.5px solid #e9d5ff;">
      ⚡ REVERSE AUCTION (RA) INFORMATION
    </div>
    <div class="grid-container">
      <div class="info-block">
        <div class="info-label">RA Status</div>
        <div class="info-val"><span class="badge badge-purple">{ra_status}</span></div>
      </div>
      <div class="info-block">
        <div class="info-label">RA Number</div>
        <div class="info-val"><strong>{ra_no}</strong></div>
      </div>
      <div class="info-block">
        <div class="info-label">RA Start Date / Time</div>
        <div class="info-val">{ra_info.get('ra_start_date', 'N/A')}</div>
      </div>
      <div class="info-block">
        <div class="info-label">RA End Date / Time</div>
        <div class="info-val">{ra_info.get('ra_end_date', 'N/A')}</div>
      </div>
    </div>
  </div>
"""

    # 2. BUYER DETAILS
    if buyer_details:
        html += """
  <div class="card">
    <div class="card-header">Buyer Details</div>
    <div class="grid-container">
"""
        for k, v in buyer_details.items():
            col_span = 'style="grid-column: span 2;"' if k == 'Address' else ''
            html += f"""
      <div class="info-block" {col_span}>
        <div class="info-label">{k}</div>
        <div class="info-val">{v}</div>
      </div>"""
            
        html += """
    </div>
  </div>
"""

    # 3. TECHNICAL EVALUATION
    if tech_eval:
        html += """
  <div class="card">
    <div class="card-header">2. TECHNICAL EVALUATION</div>
    <table class="eval-table">
      <thead>
        <tr>
          <th style="width: 5%;">S.No</th>
          <th style="width: 25%;">Seller Name</th>
          <th style="width: 35%;">Offered Item</th>
          <th style="width: 15%;">Participated On</th>
          <th style="width: 10%;">MSE/MII</th>
          <th style="width: 10%;">Status</th>
        </tr>
      </thead>
      <tbody>
"""
        for row in tech_eval:
            sno = row.get('S.No.', '')
            seller = row.get('Seller Name', '')
            offered = row.get('Offered Item', '')
            participated = next((v for k, v in row.items() if 'Participated' in k), '')
            mse = row.get('MSE/MII Status', row.get('MSE Status', 'N/A'))
            status = row.get('Status', '')
            
            if 'QUALIFIED' in status.upper() and 'DISQUALIFIED' not in status.upper():
                status_badge = f'<span class="badge badge-green">{status}</span>'
            elif 'DISQUALIFIED' in status.upper():
                status_badge = f'<span class="badge badge-red">{status}</span>'
            else:
                status_badge = f'<span class="badge badge-slate">{status}</span>'
                
            offered_parsed = "<br>".join([f"• {l}" for l in parse_offered_item(offered)])
            
            html += f"""
        <tr>
          <td>{sno}</td>
          <td><strong>{seller}</strong></td>
          <td><div class="offered-lines">{offered_parsed}</div></td>
          <td>{participated}</td>
          <td>{mse}</td>
          <td>{status_badge}</td>
        </tr>"""
            
        html += """
      </tbody>
    </table>
  </div>
"""

    # 4. FINANCIAL EVALUATION
    if fin_eval:
        # Calculate L1 vs L2 difference if available
        l1_row = next((r for r in fin_eval if r.get('Rank', '').upper() == 'L1'), None)
        l2_row = next((r for r in fin_eval if r.get('Rank', '').upper() == 'L2'), None)
        diff_info = None
        
        if l1_row and l2_row:
            def parse_val(s):
                c = re.sub(r'[^\d.]', '', s or '')
                return float(c) if c else 0.0
            p1 = parse_val(l1_row.get('Total Price', ''))
            p2 = parse_val(l2_row.get('Total Price', ''))
            if p1 > 0 and p2 > p1:
                diff_amt = p2 - p1
                diff_pct = (diff_amt / p1) * 100.0
                diff_info = f"L2 is higher than L1 by ₹ {diff_amt:,.2f} (+{diff_pct:.2f}%)"

        html += f"""
  <div class="card">
    <div class="card-header">
      <span>3. FINANCIAL EVALUATION</span>
      {f'<span class="badge badge-gold">{diff_info}</span>' if diff_info else ''}
    </div>
    <table class="eval-table">
      <thead>
        <tr>
          <th style="width: 5%;">S.No</th>
          <th style="width: 32%;">Seller Name</th>
          <th style="width: 28%;">Offered Item / Specification</th>
          <th style="width: 20%;">Total Price</th>
          <th style="width: 15%;">Rank</th>
        </tr>
      </thead>
      <tbody>
"""
        for row in fin_eval:
            sno = row.get('S.No.', '')
            seller = row.get('Seller Name', '')
            offered = row.get('Offered Item', '')
            price = format_price(row.get('Total Price', ''))
            rank = row.get('Rank', '')
            
            if rank.upper() == 'L1':
                rank_badge = f'<span class="badge badge-gold">{rank} (Lowest Bidder)</span>'
            elif rank.upper() == 'L2' and diff_info:
                rank_badge = f'<span class="badge badge-blue">{rank} (+{diff_pct:.2f}%)</span>'
            elif rank.upper().startswith('L'):
                rank_badge = f'<span class="badge badge-blue">{rank}</span>'
            else:
                rank_badge = f'<span class="badge badge-slate">{rank}</span>'

            offered_parsed = "<br>".join([f"• {l}" for l in parse_offered_item(offered)])

            html += f"""
        <tr>
          <td>{sno}</td>
          <td><strong>{seller}</strong></td>
          <td><div class="offered-lines">{offered_parsed}</div></td>
          <td><strong>{price}</strong></td>
          <td>{rank_badge}</td>
        </tr>"""

        html += """
      </tbody>
    </table>
  </div>
"""

    html += """
  <div class="footer">
    Report generated from GeM Portal (bidplus.gem.gov.in) data • All details extracted automatically
  </div>
</body>
</html>
"""
    return html

def resolve_gem_bid_number_to_url(gem_bid_no):
    """
    Given a GeM Bid Number like 'GEM/2023/B/4318172', search GeM portal to find its exact result URL,
    discover any associated Reverse Auction (RA) Number, and dynamically parse all real-time RA Schedules.
    """
    print(f"Searching GeM portal for exact Bid Number: '{gem_bid_no}'...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Resilient navigation with retry
        nav_success = False
        for attempt in range(1, 4):
            try:
                page.goto('https://bidplus.gem.gov.in/all-bids', wait_until='domcontentloaded', timeout=30000)
                page.wait_for_timeout(1000)
                nav_success = True
                break
            except Exception as nav_err:
                print(f"  [Attempt {attempt}/3] Navigation notice: {nav_err}. Retrying in 3s...")
                page.wait_for_timeout(3000)
        
        if not nav_success:
            print(f"  -> Could not reach GeM portal after 3 attempts (Check Internet connectivity).")
            browser.close()
            return None, None, None, "N/A", "N/A", [], None
        
        # Click Bid/RA Status radio button if available
        try:
            page.click('input#bidrastatus')
            page.wait_for_timeout(1500)
        except Exception:
            pass
            
        page.fill('input#searchBid', gem_bid_no)
        page.keyboard.press('Enter')
        page.wait_for_timeout(3500)
        
        soup = BeautifulSoup(page.content(), 'html.parser')
        cards = soup.find_all(class_='card')
        
        target_url = None
        discovered_ra_no = None
        discovered_ra_status = None
        ra_start_date = "N/A"
        ra_end_date = "N/A"
        ra_schedules = []
        ra_schedules_url = None
        active_card_data = None

        for c in cards:
            c_text = ' '.join(c.get_text().split())
            if gem_bid_no in c_text:
                # Extract RA Number directly from card header text
                ra_match = re.search(r'RA\s*NO\s*:\s*(GEM/\d+/R/\d+)', c_text, re.IGNORECASE) or re.search(r'GEM/\d+/R/\d+', c_text)
                if ra_match:
                    discovered_ra_no = ra_match.group(1) if ra_match.groups() else ra_match.group(0)
                    discovered_ra_status = "RA Created / Active"

                # Check for RA Schedules Page Link
                ra_sched_link = c.find('a', href=re.compile(r'ra-schedules', re.IGNORECASE))
                if ra_sched_link:
                    sched_href = ra_sched_link['href']
                    ra_schedules_url = sched_href if sched_href.startswith('http') else 'https://bidplus.gem.gov.in' + sched_href
                    print(f"  -> ⚡ Fetching Real-Time RA Schedules Page: {ra_schedules_url}")
                    try:
                        page.goto(ra_schedules_url, wait_until='domcontentloaded')
                        page.wait_for_timeout(2500)
                        
                        sched_soup = BeautifulSoup(page.content(), 'html.parser')
                        # Extract all schedule cards/rows dynamically
                        sch_elements = sched_soup.find_all(class_='card') or sched_soup.find_all('div', class_=lambda x: x and ('border' in str(x) or 'panel' in str(x) or 'row' in str(x)))
                        if not sch_elements:
                            sch_elements = [sched_soup]

                        for el in sch_elements:
                            el_txt = ' '.join(el.get_text().split())
                            if 'Start Date' in el_txt or 'Schedule' in el_txt:
                                t_m = re.search(r'Schedule\s*Title\s*:\s*([^\n<]+?)(?:Start|End|RA|\$|Status)', el_txt, re.IGNORECASE) or re.search(r'Schedule\s*\d+', el_txt, re.IGNORECASE)
                                s_m = re.search(r'Start\s*Date\s*:\s*([\d\-\/\:\sA-Za-z]+?)(?=\s*End|\s*Status|\$)', el_txt, re.IGNORECASE)
                                e_m = re.search(r'End\s*Date\s*:\s*([\d\-\/\:\sA-Za-z]+)', el_txt, re.IGNORECASE)

                                if s_m or e_m:
                                    t_str = t_m.group(1).strip() if t_m and t_m.groups() else (t_m.group(0).strip() if t_m else f"Schedule {len(ra_schedules)+1}")
                                    s_str = s_m.group(1).strip() if s_m else 'N/A'
                                    e_str = e_m.group(1).strip() if e_m else 'N/A'

                                    # Clean dates
                                    s_clean = re.split(r'(?:End|Status|RA|\$)', s_str)[0].strip()
                                    e_clean = re.split(r'(?:Status|RA|View|\$)', e_str)[0].strip()

                                    if not any(s['title'] == t_str and s['end_date'] == e_clean for s in ra_schedules):
                                        ra_schedules.append({
                                            'title': t_str,
                                            'start_date': s_clean,
                                            'end_date': e_clean,
                                            'status': 'RA Active / Completed'
                                        })
                    except Exception as s_err:
                        print(f"  -> Error fetching RA schedules page: {s_err}")

                # If ra_schedules were found dynamically, set start/end date from first schedule
                if ra_schedules:
                    ra_start_date = ra_schedules[0]['start_date']
                    ra_end_date = ra_schedules[0]['end_date']
                else:
                    # Fallback to dates directly in search card text
                    start_m = re.search(r'Start\s*Date\s*:\s*([\d\-\/\:\sA-Za-z]+?)(?=\s*End|\s*Status|\$)', c_text, re.IGNORECASE)
                    end_m = re.search(r'End\s*Date\s*:\s*([\d\-\/\:\sA-Za-z]+)', c_text, re.IGNORECASE)
                    if start_m:
                        ra_start_date = start_m.group(1).strip()
                    if end_m:
                        ra_end_date = end_m.group(1).strip()

                bid_result_links = []
                for a in c.find_all('a', href=True):
                    href = a['href']
                    link_text = a.get_text(strip=True).upper()
                    if 'RA' in link_text or 'REVERSE' in link_text:
                        discovered_ra_status = "RA Result Published"

                    if 'getBidResultView' in href or 'getBidResultViewSchedule' in href:
                        full_h = href if href.startswith('http') else 'https://bidplus.gem.gov.in' + href
                        if full_h not in bid_result_links:
                            bid_result_links.append(full_h)

                # Prioritize first / main Bid Result View URL (contains full Technical and Financial evaluation tables)
                if bid_result_links:
                    target_url = bid_result_links[0]
                        
                # If no evaluation result link yet, extract the active bid card details so it isn't skipped
                active_card_data = None
                if not target_url:
                    # Parse start / end dates, quantity, department from search card
                    b_start = "N/A"
                    b_end = "N/A"
                    start_m = re.search(r'Start\s*Date\s*:\s*([\d\-\/\:\sA-Za-z]+?)(?=\s*End|\s*Status|\$)', c_text, re.IGNORECASE)
                    end_m = re.search(r'End\s*Date\s*:\s*([\d\-\/\:\sA-Za-z]+)', c_text, re.IGNORECASE)
                    if start_m: b_start = start_m.group(1).strip()
                    if end_m: b_end = end_m.group(1).strip()

                    items_m = re.search(r'Items\s*:\s*([^\n\r]+?)(?=\s*Quantity|\s*Department|\s*Start|\$)', c_text, re.IGNORECASE)
                    qty_m = re.search(r'Quantity\s*:\s*([\d,]+)', c_text, re.IGNORECASE)
                    dept_m = re.search(r'Department\s*Name\s*And\s*Address\s*:\s*([^\n\r]+?)(?=\s*Start|\s*End|\$)', c_text, re.IGNORECASE)

                    active_card_data = {
                        'source_id': gem_bid_no,
                        'bid_number': gem_bid_no,
                        'bid_title_type': 'BID DETAILS',
                        'bid_details': {
                            'Bid Status': 'Active / Ongoing (Evaluation Pending)',
                            'Bid Start Date / Time': b_start,
                            'Bid End Date / Time': b_end,
                            'Quantity': qty_m.group(1).strip() if qty_m else 'N/A',
                            'Items': items_m.group(1).strip() if items_m else 'N/A'
                        },
                        'buyer_details': {
                            'Department Name': dept_m.group(1).strip() if dept_m else 'N/A'
                        },
                        'technical_evaluation': [],
                        'financial_evaluation': [],
                        'ra_info': {
                            'is_ra': bool(discovered_ra_no),
                            'ra_number': discovered_ra_no or 'N/A',
                            'ra_status': discovered_ra_status or ('RA Active' if discovered_ra_no else 'N/A'),
                            'ra_start_date': ra_start_date,
                            'ra_end_date': ra_end_date,
                            'ra_schedules': ra_schedules,
                            'ra_schedules_url': ra_schedules_url
                        }
                    }

                if target_url or discovered_ra_no or active_card_data:
                    break
                    
        browser.close()

        if target_url or discovered_ra_no or active_card_data:
            if target_url:
                print(f"  -> Found Exact Bid Result URL: {target_url}")
            if ra_schedules_url:
                print(f"  -> Found Exact RA Schedules URL: {ra_schedules_url}")
            if discovered_ra_no:
                print(f"  -> ⚡ Discovered RA Number: {discovered_ra_no} (Schedules: {len(ra_schedules)}, Start: {ra_start_date}, End: {ra_end_date})")
            return target_url, discovered_ra_no, discovered_ra_status, ra_start_date, ra_end_date, ra_schedules, ra_schedules_url, active_card_data
        else:
            print(f"  -> No search result card found on portal for '{gem_bid_no}' (Bid may be fresh or unpublished)")
            return None, None, None, "N/A", "N/A", [], None, None

def scrape_gem_bid(bid_input, output_dir="scraped_output"):
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(os.path.join(output_dir, "pdfs"), exist_ok=True)
    os.makedirs(os.path.join(output_dir, "json"), exist_ok=True)

    html_content = ""
    bid_input_orig = str(bid_input).strip()
    source_id = str(bid_input).strip()
    
    discovered_ra_no = None
    discovered_ra_status = None
    ra_start_date = "N/A"
    ra_end_date = "N/A"
    ra_schedules = []
    ra_schedules_url = None

    active_card = None
    # Check if input is a GEM Bid Number e.g. GEM/2023/B/4309262
    if source_id.upper().startswith("GEM/") or "/B/" in source_id.upper() or "/R/" in source_id.upper():
        resolved_url, discovered_ra_no, discovered_ra_status, ra_start_date, ra_end_date, ra_schedules, ra_schedules_url, active_card = resolve_gem_bid_number_to_url(source_id)
        if resolved_url:
            bid_input = resolved_url
            match = re.search(r'getBidResultView(?:Schedule)?/(\d+)', resolved_url)
            if match:
                source_id = match.group(1)
        elif active_card:
            print(f"  -> Captured Active/Ongoing Bid card data for '{source_id}'")
        elif discovered_ra_no:
            print(f"  -> Discovered RA Number '{discovered_ra_no}' for '{source_id}' even without direct result link")
        else:
            print(f"[SKIP] Bid result not yet available or non-existent on portal for '{source_id}'")
            return None, None

    if active_card and not (bid_input.startswith("http://") or bid_input.startswith("https://") or os.path.exists(bid_input)):
        scraped_data = active_card
    else:
        if os.path.exists(bid_input):
            print(f"Reading local HTML file: {bid_input}")
            with open(bid_input, 'r', encoding='utf-8', errors='ignore') as f:
                html_content = f.read()
            source_id = os.path.splitext(os.path.basename(bid_input))[0]
        elif bid_input.startswith("http://") or bid_input.startswith("https://"):
            print(f"Fetching URL: {bid_input}")
            match = re.search(r'getBidResultView(?:Schedule)?/(\d+)', bid_input)
            if match:
                source_id = match.group(1)
            res = requests.get(bid_input, headers=HEADERS, timeout=15)
            res.raise_for_status()
            html_content = res.text
        else:
            url = f"https://bidplus.gem.gov.in/bidding/bid/getBidResultView/{bid_input}"
            print(f"Fetching Bid Result View ID {bid_input} from URL: {url}")
            res = requests.get(url, headers=HEADERS, timeout=15)
            res.raise_for_status()
            html_content = res.text

        scraped_data = extract_bid_details_from_html(html_content, source_id=source_id)
        if str(bid_input).startswith("http://") or str(bid_input).startswith("https://"):
            scraped_data['bid_result_url'] = bid_input

    if discovered_ra_no:
        if 'ra_info' not in scraped_data:
            scraped_data['ra_info'] = {}
        scraped_data['ra_info']['is_ra'] = True
        scraped_data['ra_info']['ra_number'] = discovered_ra_no
        if discovered_ra_status:
            scraped_data['ra_info']['ra_status'] = discovered_ra_status
        if ra_start_date != "N/A":
            scraped_data['ra_info']['ra_start_date'] = ra_start_date
            scraped_data['bid_details']['RA Start Date / Time'] = ra_start_date
        if ra_end_date != "N/A":
            scraped_data['ra_info']['ra_end_date'] = ra_end_date
            scraped_data['bid_details']['RA End Date / Time'] = ra_end_date
        if ra_schedules:
            scraped_data['ra_info']['ra_schedules'] = ra_schedules
        if ra_schedules_url:
            scraped_data['ra_info']['ra_schedules_url'] = ra_schedules_url

    # Record parent_bid_number if input was a /B/ bid number that resolved to an RA
    if isinstance(bid_input_orig, str) and ("/B/" in bid_input_orig.upper() or "GEM/" in bid_input_orig.upper()):
        scraped_data['parent_bid_number'] = bid_input_orig
        if 'ra_info' not in scraped_data:
            scraped_data['ra_info'] = {}
        scraped_data['ra_info']['parent_bid_number'] = bid_input_orig

    bid_no = scraped_data.get('bid_number', source_id).replace('/', '_')

    json_filename = os.path.join(output_dir, "json", f"{bid_no}.json")
    with open(json_filename, 'w', encoding='utf-8') as f:
        json.dump(scraped_data, f, indent=2, ensure_ascii=False)
    print(f"  -> Saved JSON data to {json_filename}")

    # Also save with parent_bid_number filename so lookups directly by parent bid ID always match
    if 'parent_bid_number' in scraped_data and scraped_data['parent_bid_number'] != scraped_data.get('bid_number'):
        parent_file_key = scraped_data['parent_bid_number'].replace('/', '_')
        parent_json_file = os.path.join(output_dir, "json", f"{parent_file_key}.json")
        with open(parent_json_file, 'w', encoding='utf-8') as f_p:
            json.dump(scraped_data, f_p, indent=2, ensure_ascii=False)

    html_report = build_pdf_html(scraped_data)
    temp_html_path = os.path.join(output_dir, "json", f"temp_{bid_no}.html")
    with open(temp_html_path, 'w', encoding='utf-8') as f:
        f.write(html_report)

    pdf_filename = os.path.join(output_dir, "pdfs", f"{bid_no}.pdf")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto('file:///' + os.path.abspath(temp_html_path).replace('\\', '/'))
        page.pdf(
            path=pdf_filename,
            format='A4',
            margin={'top': '12mm', 'bottom': '12mm', 'left': '12mm', 'right': '12mm'},
            print_background=True
        )
        browser.close()

    if os.path.exists(temp_html_path):
        os.remove(temp_html_path)

    print(f"  -> Successfully generated PDF: {pdf_filename}")
    return scraped_data, pdf_filename

def main():
    parser = argparse.ArgumentParser(description="GeM Portal Bid Details & Evaluation Scraper & PDF Generator")
    parser.add_argument("inputs", nargs="*", help="Bid Result View IDs (e.g. 5705747), URLs, or local HTML files")
    parser.add_argument("--file", "-f", help="Text file containing list of Bid Result View IDs or URLs (one per line)")
    parser.add_argument("--output", "-o", default="scraped_output", help="Directory to save output PDFs and JSON files")

    args = parser.parse_args()
    
    bid_list = []
    if args.inputs:
        bid_list.extend(args.inputs)
    if args.file and os.path.exists(args.file):
        with open(args.file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    bid_list.append(line)
                    
    if not bid_list:
        print("\n--- GeM Bid Scraper & PDF Generator ---")
        user_in = input("Enter GeM Bid Result View ID(s), URL(s), or HTML file path(s) (space or comma-separated): ").strip()
        if user_in:
            bid_list = [x.strip() for x in user_in.replace(',', ' ').split() if x.strip()]

    if not bid_list:
        print("No inputs provided. Usage examples:")
        print("  python gem_scraper.py 5705747 6000000")
        print("  python gem_scraper.py https://bidplus.gem.gov.in/bidding/bid/getBidResultView/5705747")
        print("  python gem_scraper.py --file bids_list.txt")
        sys.exit(1)

    all_results = []
    pdf_paths = []
    
    for item in bid_list:
        try:
            data, pdf_path = scrape_gem_bid(item, output_dir=args.output)
            if data and pdf_path:
                all_results.append(data)
                pdf_paths.append(pdf_path)
        except Exception as e:
            print(f"[ERROR] Could not process '{item}': {e}")

    if all_results:
        summary_rows = []
        for d in all_results:
            b_details = d.get('bid_details', {})
            b_buyer = d.get('buyer_details', {})
            t_eval = d.get('technical_evaluation', [])
            f_eval = d.get('financial_evaluation', [])
            
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
                'Total Tech Sellers': len(t_eval),
                'Qualified Sellers': sum(1 for x in t_eval if 'QUALIFIED' in x.get('Status', '').upper() and 'DISQUALIFIED' not in x.get('Status', '').upper()),
                'Disqualified Sellers': sum(1 for x in t_eval if 'DISQUALIFIED' in x.get('Status', '').upper()),
                'Financial L1 Seller': f_eval[0].get('Seller Name', '') if f_eval else 'N/A',
                'Financial L1 Price': f_eval[0].get('Total Price', '') if f_eval else 'N/A'
            }
            summary_rows.append(row)

        summary_df = pd.DataFrame(summary_rows)
        csv_path = os.path.join(args.output, "bids_summary.csv")
        summary_df.to_csv(csv_path, index=False, encoding='utf-8-sig')
        print(f"\n[SUMMARY] Generated Summary CSV: {csv_path}")
        print(f"[SUCCESS] Processed {len(all_results)} bid(s). Individual PDFs saved in '{os.path.join(args.output, 'pdfs')}'")

        # Optionally merge all generated PDFs into one master report
        if len(pdf_paths) > 1:
            try:
                from PyPDF2 import PdfMerger
                merger = PdfMerger()
                for pdf in pdf_paths:
                    if os.path.exists(pdf):
                        merger.append(pdf)
                merged_pdf_path = os.path.join(args.output, "ALL_BIDS_COMBINED_REPORT.pdf")
                merger.write(merged_pdf_path)
                merger.close()
                print(f"[MERGED] Generated Combined Master PDF: {merged_pdf_path}")
            except Exception as me:
                print(f"[WARNING] Could not merge PDFs: {me}")

if __name__ == "__main__":
    main()

