import os
import json
import time
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "scraped_output")
NOTIFICATIONS_FILE = os.path.join(OUTPUT_DIR, "notifications.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)

def load_notifications():
    if os.path.exists(NOTIFICATIONS_FILE):
        try:
            with open(NOTIFICATIONS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_notifications(notifs):
    with open(NOTIFICATIONS_FILE, 'w', encoding='utf-8') as f:
        json.dump(notifs, f, indent=2, ensure_ascii=False)

def add_notification(gem_id, notif_type, title, message, change_details=None):
    notifs = load_notifications()
    now_str = datetime.now(timezone.utc).isoformat()
    
    new_notif = {
        "id": f"notif_{int(time.time()*1000)}",
        "gem_id": str(gem_id).upper(),
        "type": notif_type, # 'WON_L1', 'QUALIFIED', 'DISQUALIFIED', 'RA_TRIGGERED', 'STATUS_CHANGE', 'NEW_BID'
        "title": title,
        "message": message,
        "change_details": change_details or {},
        "timestamp": now_str,
        "read": False
    }
    
    # Insert at beginning
    notifs.insert(0, new_notif)
    # Keep last 100 notifications max
    notifs = notifs[:100]
    save_notifications(notifs)
    return new_notif

def mark_notifications_read(notif_ids=None):
    notifs = load_notifications()
    for n in notifs:
        if notif_ids is None or n.get("id") in notif_ids:
            n["read"] = True
    save_notifications(notifs)
    return notifs

def detect_bid_changes(old_data, new_data, gem_id):
    """
    Compares old bid data JSON with newly scraped bid data JSON
    and triggers automatic notifications ONLY for vital events:
    - Date changes (Bid End Date / Opening Date / RA End Date extended or changed)
    - Reverse Auction (RA) triggered or active
    - Company Bid status (Won L1, Qualified, Disqualified, Rank changed)
    - Financial Evaluation L1 winner published or price changed
    - Quantity changes
    Does NOT send noisy 'New Tender Scraped' notifications.
    """
    if not new_data or not isinstance(new_data, dict):
        return

    new_ra = new_data.get("ra_info") or {}
    new_ca = new_data.get("company_analysis") or {}
    new_bd = new_data.get("bid_details") or {}
    new_fe = new_data.get("financial_evaluation") or []

    # If first scrape of this bid, only notify if already in a vital state (e.g. active RA or G.M. DALUI L1)
    if not old_data or not isinstance(old_data, dict):
        if new_ra.get("is_ra"):
            ra_no = new_ra.get("ra_number") or gem_id
            add_notification(
                gem_id=gem_id,
                notif_type="RA_TRIGGERED",
                title=f"⚡ Reverse Auction (RA) Active: {gem_id}",
                message=f"Tender is in Reverse Auction stage! RA NO: {ra_no} (Closing: {new_ra.get('ra_end_date', 'N/A')})",
                change_details={"ra_number": ra_no, "ra_end_date": new_ra.get("ra_end_date")}
            )
        if new_ca.get("is_l1"):
            add_notification(
                gem_id=gem_id,
                notif_type="WON_L1",
                title=f"🏆 WON L1! {gem_id}",
                message=f"G.M. DALUI & SONS is the L1 lowest bidder!",
                change_details={"rank": "L1", "price": new_ca.get("my_price")}
            )
        return

    old_ra = old_data.get("ra_info") or {}
    old_ca = old_data.get("company_analysis") or {}
    old_bd = old_data.get("bid_details") or {}
    old_fe = old_data.get("financial_evaluation") or []

    # 1. Reverse Auction (RA) Triggered / New RA Appears
    if new_ra.get("is_ra") and (not old_ra.get("is_ra") or (new_ra.get("ra_number") and new_ra.get("ra_number") != old_ra.get("ra_number"))):
        ra_no = new_ra.get("ra_number", "N/A")
        add_notification(
            gem_id=gem_id,
            notif_type="RA_TRIGGERED",
            title=f"⚡ Reverse Auction (RA) Triggered: {gem_id}",
            message=f"Tender has entered Reverse Auction stage! RA NO: {ra_no} (Closing: {new_ra.get('ra_end_date', 'N/A')})",
            change_details={"ra_number": ra_no, "ra_end_date": new_ra.get("ra_end_date")}
        )

    # 2. Date Changes (Corrigendum / Extension)
    old_end = str(old_bd.get("Bid End Date / Time") or "").strip()
    new_end = str(new_bd.get("Bid End Date / Time") or "").strip()
    if old_end and new_end and old_end != new_end:
        add_notification(
            gem_id=gem_id,
            notif_type="DATE_CHANGED",
            title=f"📅 Bid End Date Changed: {gem_id}",
            message=f"Bid End Date extended/updated from '{old_end}' to '{new_end}'.",
            change_details={"field": "Bid End Date", "old_value": old_end, "new_value": new_end}
        )

    old_open = str(old_bd.get("Bid Opening Date / Time") or "").strip()
    new_open = str(new_bd.get("Bid Opening Date / Time") or "").strip()
    if old_open and new_open and old_open != new_open:
        add_notification(
            gem_id=gem_id,
            notif_type="DATE_CHANGED",
            title=f"📅 Bid Opening Date Changed: {gem_id}",
            message=f"Bid Opening Date updated from '{old_open}' to '{new_open}'.",
            change_details={"field": "Bid Opening Date", "old_value": old_open, "new_value": new_open}
        )

    old_ra_end = str(old_ra.get("ra_end_date") or "").strip()
    new_ra_end = str(new_ra.get("ra_end_date") or "").strip()
    if old_ra_end and new_ra_end and old_ra_end != new_ra_end and new_ra_end != "N/A":
        add_notification(
            gem_id=gem_id,
            notif_type="DATE_CHANGED",
            title=f"⚡📅 RA End Date Changed: {gem_id}",
            message=f"Reverse Auction closing date updated from '{old_ra_end}' to '{new_ra_end}'.",
            change_details={"field": "RA End Date", "old_value": old_ra_end, "new_value": new_ra_end}
        )

    # 3. Company Analysis / Evaluation Changes for G.M. DALUI & SONS
    if new_ca.get("is_l1") and not old_ca.get("is_l1"):
        add_notification(
            gem_id=gem_id,
            notif_type="WON_L1",
            title=f"🏆 WON L1! {gem_id}",
            message=f"G.M. DALUI & SONS achieved L1 lowest bidder position! {new_ca.get('gap_message', '')}",
            change_details={"rank": "L1", "price": new_ca.get("my_price")}
        )
    elif new_ca.get("is_disqualified") and not old_ca.get("is_disqualified"):
        add_notification(
            gem_id=gem_id,
            notif_type="DISQUALIFIED",
            title=f"🔴 Technical Disqualification: {gem_id}",
            message=f"G.M. DALUI status updated to Disqualified in Technical Evaluation.",
            change_details={"status": new_ca.get("tech_status")}
        )
    elif new_ca.get("is_qualified") and not old_ca.get("is_qualified"):
        add_notification(
            gem_id=gem_id,
            notif_type="QUALIFIED",
            title=f"🟢 Technical Qualified: {gem_id}",
            message=f"G.M. DALUI successfully Qualified in Technical Evaluation.",
            change_details={"rank": new_ca.get("rank")}
        )
    elif old_ca.get("rank") and new_ca.get("rank") and old_ca.get("rank") != new_ca.get("rank"):
        add_notification(
            gem_id=gem_id,
            notif_type="STATUS_CHANGE",
            title=f"📊 Rank Changed ({old_ca.get('rank')} ➔ {new_ca.get('rank')}): {gem_id}",
            message=f"G.M. DALUI rank updated from {old_ca.get('rank')} to {new_ca.get('rank')}.",
            change_details={"old_rank": old_ca.get("rank"), "new_rank": new_ca.get("rank")}
        )

    # 4. Financial Evaluation Publishing & Price Changes
    if len(old_fe) == 0 and len(new_fe) > 0:
        l1_seller = new_fe[0].get("Seller Name", "N/A") if isinstance(new_fe[0], dict) else "N/A"
        l1_price = new_fe[0].get("Total Price", "N/A") if isinstance(new_fe[0], dict) else "N/A"
        add_notification(
            gem_id=gem_id,
            notif_type="STATUS_CHANGE",
            title=f"💰 Financial Evaluation Published: {gem_id}",
            message=f"Financial bids evaluated! Current L1: {l1_seller} @ {l1_price}",
            change_details={"l1_seller": l1_seller, "l1_price": l1_price}
        )
    elif len(old_fe) > 0 and len(new_fe) > 0:
        old_p = str((old_fe[0] if isinstance(old_fe[0], dict) else {}).get("Total Price") or "").strip()
        new_p = str((new_fe[0] if isinstance(new_fe[0], dict) else {}).get("Total Price") or "").strip()
        if old_p and new_p and old_p != new_p:
            add_notification(
                gem_id=gem_id,
                notif_type="STATUS_CHANGE",
                title=f"💰 L1 Price Updated: {gem_id}",
                message=f"L1 Price changed from '{old_p}' to '{new_p}'.",
                change_details={"old_price": old_p, "new_price": new_p}
            )

    # 5. Quantity Changes
    old_qty = str(old_bd.get("Quantity") or "").strip()
    new_qty = str(new_bd.get("Quantity") or "").strip()
    if old_qty and new_qty and old_qty != new_qty:
        add_notification(
            gem_id=gem_id,
            notif_type="STATUS_CHANGE",
            title=f"📦 Quantity Changed: {gem_id}",
            message=f"Bid quantity modified from '{old_qty}' to '{new_qty}'.",
            change_details={"old_qty": old_qty, "new_qty": new_qty}
        )
