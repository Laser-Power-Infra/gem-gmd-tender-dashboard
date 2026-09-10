import os
import re
import json
import sqlite3
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_URL = os.environ.get("DATABASE_URL", "postgresql://asmita:asmita@192.168.1.190:5432/gmd_gem_ids")
SQLITE_DB_PATH = os.path.join(BASE_DIR, "gem_database.db")

def get_connection():
    # Try PostgreSQL connection first
    try:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(DB_URL)
        return conn, "postgres"
    except Exception as pe:
        # Fallback to SQLite if PostgreSQL connection fails
        conn = sqlite3.connect(SQLITE_DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn, "sqlite"

def init_db():
    try:
        conn, db_type = get_connection()
        cursor = conn.cursor()
        
        if db_type == "postgres":
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS gmd_gem_ids (
                    id SERIAL PRIMARY KEY,
                    gem_id VARCHAR(255) UNIQUE NOT NULL,
                    drive_link TEXT,
                    order_pdf TEXT,
                    remarks TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                ALTER TABLE gmd_gem_ids ADD COLUMN IF NOT EXISTS order_pdf TEXT;
                CREATE TABLE IF NOT EXISTS gmd_gem_files (
                    id SERIAL PRIMARY KEY,
                    gem_id VARCHAR(255) NOT NULL,
                    file_name VARCHAR(255) NOT NULL,
                    drive_link TEXT NOT NULL,
                    file_type VARCHAR(50) DEFAULT 'pdf',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_gmd_files_gem_id ON gmd_gem_files(gem_id);
            """)
        else:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS gmd_gem_ids (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    gem_id TEXT UNIQUE NOT NULL,
                    drive_link TEXT,
                    order_pdf TEXT,
                    remarks TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS gmd_gem_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    gem_id TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    drive_link TEXT NOT NULL,
                    file_type TEXT DEFAULT 'pdf',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_gmd_files_gem_id ON gmd_gem_files(gem_id);
            """)
            try:
                cursor.execute("ALTER TABLE gmd_gem_ids ADD COLUMN order_pdf TEXT;")
            except Exception:
                pass
        conn.commit()
        cursor.close()
        conn.close()
        print(f"[DB] Initialized tables 'gmd_gem_ids' (with order_pdf) & 'gmd_gem_files' successfully in database ({db_type}).")
    except Exception as e:
        print(f"[DB ERROR] Error initializing tables: {e}")

# Initialize DB
init_db()

def parse_drive_attachments(raw):
    """Parse drive_link column into a list of attachment objects: [{'name': ..., 'url': ..., 'type': ...}]"""
    if not raw:
        return []
    raw = str(raw).strip()
    items = []
    if raw.startswith('['):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                for idx, entry in enumerate(parsed):
                    if isinstance(entry, dict):
                        url = entry.get('url') or ''
                        if url:
                            items.append({
                                'name': entry.get('name') or f"Doc {idx + 1}",
                                'url': url,
                                'type': (entry.get('type') or 'pdf').lower()
                            })
                    elif isinstance(entry, str) and entry.strip():
                        url = entry.strip()
                        items.append({'name': f"Doc {idx + 1}", 'url': url, 'type': 'pdf'})
                return items
        except Exception:
            pass
    # Fallback for single link or comma-separated string
    for idx, part in enumerate(raw.split(',')):
        url = part.strip()
        if url:
            items.append({'name': f"Doc {idx + 1}", 'url': url, 'type': 'pdf'})
    return items

def parse_drive_links(raw):
    """Parse the drive_link column value into a list of link strings for backwards compatibility."""
    atts = parse_drive_attachments(raw)
    return [a['url'] for a in atts if a.get('url')]

def save_gem_record(gem_id, drive_link=None, remarks=None, filename=None, order_pdf=None):
    if not gem_id:
        return None
    gem_id_raw = str(gem_id).strip()
    gem_id_upper = gem_id_raw.upper()
    clean_id = re.sub(r'[^A-Z0-9]', '', gem_id_upper)
    now_dt = datetime.now(timezone.utc)
    now_str = now_dt.isoformat()
    
    try:
        conn, db_type = get_connection()
        cursor = conn.cursor()
        
        if db_type == "postgres":
            cursor.execute("""
                SELECT gem_id, drive_link, order_pdf, remarks 
                FROM gmd_gem_ids 
                WHERE UPPER(gem_id) = %s 
                   OR UPPER(REPLACE(REPLACE(gem_id, '/', ''), '_', '')) = %s;
            """, (gem_id_upper, clean_id))
            row = cursor.fetchone()
            
            if row:
                matched_id, existing_link, existing_order_pdf, existing_remarks = row[0], row[1], row[2], row[3]
                if drive_link is not None:
                    existing_atts = parse_drive_attachments(existing_link)
                    existing_urls = [a['url'] for a in existing_atts]
                    if drive_link not in existing_urls:
                        file_ext = 'pdf'
                        doc_name = filename
                        if filename and '.' in filename:
                            file_ext = filename.rsplit('.', 1)[-1].lower()
                        if not doc_name:
                            doc_name = f"Doc {len(existing_atts) + 1}"
                        existing_atts.append({'name': doc_name, 'url': drive_link, 'type': file_ext})
                    updated_link = json.dumps(existing_atts)
                else:
                    updated_link = existing_link
                updated_remarks = remarks if remarks is not None else existing_remarks
                updated_order_pdf = order_pdf if order_pdf is not None else existing_order_pdf
                cursor.execute("""
                    UPDATE gmd_gem_ids
                    SET drive_link = %s, order_pdf = %s, remarks = %s, updated_at = %s
                    WHERE UPPER(gem_id) = %s;
                """, (updated_link, updated_order_pdf, updated_remarks, now_dt, matched_id.upper()))
            else:
                if drive_link is not None:
                    file_ext = 'pdf'
                    doc_name = filename
                    if filename and '.' in filename:
                        file_ext = filename.rsplit('.', 1)[-1].lower()
                    if not doc_name:
                        doc_name = "Doc 1"
                    stored_link = json.dumps([{'name': doc_name, 'url': drive_link, 'type': file_ext}])
                else:
                    stored_link = None
                cursor.execute("""
                    INSERT INTO gmd_gem_ids (gem_id, drive_link, order_pdf, remarks, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s);
                """, (gem_id_upper, stored_link, order_pdf, remarks, now_dt, now_dt))
        else:
            cursor.execute("""
                SELECT gem_id, drive_link, order_pdf, remarks 
                FROM gmd_gem_ids 
                WHERE UPPER(gem_id) = ? 
                   OR UPPER(REPLACE(REPLACE(gem_id, '/', ''), '_', '')) = ?;
            """, (gem_id_upper, clean_id))
            row = cursor.fetchone()
            
            if row:
                matched_id = row['gem_id'] if isinstance(row, sqlite3.Row) else row[0]
                existing_link = row['drive_link'] if isinstance(row, sqlite3.Row) else row[1]
                existing_order_pdf = (row['order_pdf'] if 'order_pdf' in row.keys() else row[2]) if isinstance(row, sqlite3.Row) else row[2]
                existing_remarks = (row['remarks'] if 'remarks' in row.keys() else row[3]) if isinstance(row, sqlite3.Row) else row[3]
                if drive_link is not None:
                    existing_atts = parse_drive_attachments(existing_link)
                    existing_urls = [a['url'] for a in existing_atts]
                    if drive_link not in existing_urls:
                        file_ext = 'pdf'
                        doc_name = filename
                        if filename and '.' in filename:
                            file_ext = filename.rsplit('.', 1)[-1].lower()
                        if not doc_name:
                            doc_name = f"Doc {len(existing_atts) + 1}"
                        existing_atts.append({'name': doc_name, 'url': drive_link, 'type': file_ext})
                    updated_link = json.dumps(existing_atts)
                else:
                    updated_link = existing_link
                updated_remarks = remarks if remarks is not None else existing_remarks
                updated_order_pdf = order_pdf if order_pdf is not None else existing_order_pdf
                cursor.execute("""
                    UPDATE gmd_gem_ids
                    SET drive_link = ?, order_pdf = ?, remarks = ?, updated_at = ?
                    WHERE UPPER(gem_id) = ?;
                """, (updated_link, updated_order_pdf, updated_remarks, now_str, matched_id.upper()))
            else:
                if drive_link is not None:
                    file_ext = 'pdf'
                    doc_name = filename
                    if filename and '.' in filename:
                        file_ext = filename.rsplit('.', 1)[-1].lower()
                    if not doc_name:
                        doc_name = "Doc 1"
                    stored_link = json.dumps([{'name': doc_name, 'url': drive_link, 'type': file_ext}])
                else:
                    stored_link = None
                cursor.execute("""
                    INSERT INTO gmd_gem_ids (gem_id, drive_link, order_pdf, remarks, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?);
                """, (gem_id_upper, stored_link, order_pdf, remarks, now_str, now_str))

        conn.commit()
        cursor.close()
        conn.close()
        return get_gem_record(gem_id_upper)
    except Exception as e:
        print(f"[DB ERROR] Error saving record for {gem_id}: {e}")
        return None

def _format_record(raw_dict):
    """Add parsed attachments, order_pdf, and drive_links array to a record dict."""
    if not raw_dict:
        return raw_dict
    gid = str(raw_dict.get('gem_id', '')).strip().upper()
    parsed_atts = parse_drive_attachments(raw_dict.get('drive_link'))
    db_table_files = get_files_for_gem_id(gid)

    combined = list(db_table_files)
    existing_urls = {f['url'] for f in db_table_files if f.get('url')}
    for att in parsed_atts:
        if att.get('url') and att['url'] not in existing_urls:
            existing_urls.add(att['url'])
            combined.append(att)

    raw_dict['attachments'] = combined
    raw_dict['drive_links'] = [a['url'] for a in combined if a.get('url')]
    raw_dict['order_pdf'] = raw_dict.get('order_pdf') or ''
    return raw_dict

def save_file_record(gem_id, file_name, drive_link, file_type=None):
    """Save an individual file entry in dedicated database table gmd_gem_files linked to a gem_id."""
    if not gem_id or not drive_link:
        return None
    gem_id_upper = str(gem_id).strip().upper()
    if not file_name:
        file_name = "Uploaded File"
    if not file_type:
        file_type = file_name.rsplit('.', 1)[-1].lower() if '.' in file_name else 'pdf'
    
    now_dt = datetime.now(timezone.utc)
    now_str = now_dt.isoformat()

    try:
        conn, db_type = get_connection()
        cursor = conn.cursor()
        if db_type == "postgres":
            cursor.execute("""
                INSERT INTO gmd_gem_files (gem_id, file_name, drive_link, file_type, created_at)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id;
            """, (gem_id_upper, file_name, drive_link, file_type, now_dt))
            file_id = cursor.fetchone()[0]
        else:
            cursor.execute("""
                INSERT INTO gmd_gem_files (gem_id, file_name, drive_link, file_type, created_at)
                VALUES (?, ?, ?, ?, ?);
            """, (gem_id_upper, file_name, drive_link, file_type, now_str))
            file_id = cursor.lastrowid
        
        conn.commit()
        cursor.close()
        conn.close()

        # Also sync with gmd_gem_ids table
        save_gem_record(gem_id_upper, drive_link=drive_link, filename=file_name)

        return {
            "id": file_id,
            "gem_id": gem_id_upper,
            "file_name": file_name,
            "name": file_name,
            "drive_link": drive_link,
            "url": drive_link,
            "file_type": file_type,
            "type": file_type
        }
    except Exception as e:
        print(f"[DB ERROR] Error saving file record for {gem_id}: {e}")
        return None

def get_files_for_gem_id(gem_id):
    """Fetch all file records for a specific gem_id from gmd_gem_files table."""
    if not gem_id:
        return []
    gid_upper = str(gem_id).strip().upper()
    clean_id = re.sub(r'[^A-Z0-9]', '', gid_upper)
    try:
        conn, db_type = get_connection()
        cursor = conn.cursor()
        files = []
        if db_type == "postgres":
            cursor.execute("""
                SELECT id, gem_id, file_name, drive_link, file_type, created_at 
                FROM gmd_gem_files 
                WHERE UPPER(gem_id) = %s 
                   OR UPPER(REPLACE(REPLACE(gem_id, '/', ''), '_', '')) = %s 
                ORDER BY id ASC;
            """, (gid_upper, clean_id))
            rows = cursor.fetchall()
            cursor.close()
            conn.close()
            for r in rows:
                files.append({
                    "id": r[0], "gem_id": r[1], "file_name": r[2], "name": r[2],
                    "drive_link": r[3], "url": r[3], "file_type": r[4], "type": r[4]
                })
        else:
            cursor.execute("""
                SELECT id, gem_id, file_name, drive_link, file_type, created_at 
                FROM gmd_gem_files 
                WHERE UPPER(gem_id) = ? 
                   OR UPPER(REPLACE(REPLACE(gem_id, '/', ''), '_', '')) = ? 
                ORDER BY id ASC;
            """, (gid_upper, clean_id))
            rows = cursor.fetchall()
            cursor.close()
            conn.close()
            for r in rows:
                rec = dict(r)
                files.append({
                    "id": rec['id'], "gem_id": rec['gem_id'], "file_name": rec['file_name'], "name": rec['file_name'],
                    "drive_link": rec['drive_link'], "url": rec['drive_link'], "file_type": rec['file_type'], "type": rec['file_type']
                })
        return files
    except Exception as e:
        print(f"[DB ERROR] Error fetching files for {gem_id}: {e}")
        return []

def get_all_gem_files():
    """Fetch all file records from gmd_gem_files table grouped by multiple gem_id key variations."""
    try:
        conn, db_type = get_connection()
        cursor = conn.cursor()
        files_by_gid = {}

        def add_file_for_key(k, item):
            if not k:
                return
            if k not in files_by_gid:
                files_by_gid[k] = []
            files_by_gid[k].append(item)

        if db_type == "postgres":
            cursor.execute("SELECT id, gem_id, file_name, drive_link, file_type, created_at FROM gmd_gem_files ORDER BY id ASC;")
            rows = cursor.fetchall()
            cursor.close()
            conn.close()
            for r in rows:
                gid = str(r[1]).strip().upper()
                clean_gid = re.sub(r'[^A-Z0-9]', '', gid)
                item = {"id": r[0], "gem_id": gid, "file_name": r[2], "name": r[2], "drive_link": r[3], "url": r[3], "file_type": r[4], "type": r[4]}
                for k in {gid, gid.replace('_', '/'), gid.replace('/', '_'), clean_gid}:
                    add_file_for_key(k, item)
        else:
            cursor.execute("SELECT * FROM gmd_gem_files ORDER BY id ASC;")
            rows = cursor.fetchall()
            cursor.close()
            conn.close()
            for r in rows:
                rec = dict(r)
                gid = str(rec['gem_id']).strip().upper()
                clean_gid = re.sub(r'[^A-Z0-9]', '', gid)
                item = {"id": rec['id'], "gem_id": gid, "file_name": rec['file_name'], "name": rec['file_name'], "drive_link": rec['drive_link'], "url": rec['drive_link'], "file_type": rec['file_type'], "type": rec['file_type']}
                for k in {gid, gid.replace('_', '/'), gid.replace('/', '_'), clean_gid}:
                    add_file_for_key(k, item)
        return files_by_gid
    except Exception as e:
        print(f"[DB ERROR] Error fetching all file records: {e}")
        return {}

def get_gem_record(gem_id):
    if not gem_id:
        return None
    gem_id = str(gem_id).strip().upper()
    try:
        conn, db_type = get_connection()
        cursor = conn.cursor()
        if db_type == "postgres":
            cursor.execute("SELECT id, gem_id, drive_link, order_pdf, remarks, created_at, updated_at FROM gmd_gem_ids WHERE UPPER(gem_id) = %s;", (gem_id,))
            row = cursor.fetchone()
            cursor.close()
            conn.close()
            if row:
                return _format_record({
                    "id": row[0],
                    "gem_id": row[1],
                    "drive_link": row[2],
                    "order_pdf": row[3],
                    "remarks": row[4],
                    "created_at": str(row[5]),
                    "updated_at": str(row[6])
                })
        else:
            cursor.execute("SELECT * FROM gmd_gem_ids WHERE UPPER(gem_id) = ?;", (gem_id,))
            row = cursor.fetchone()
            cursor.close()
            conn.close()
            if row:
                return _format_record(dict(row))
    except Exception as e:
        print(f"[DB ERROR] Error fetching record for {gem_id}: {e}")
    return None

def get_all_gem_records():
    try:
        conn, db_type = get_connection()
        cursor = conn.cursor()
        if db_type == "postgres":
            cursor.execute("SELECT id, gem_id, drive_link, order_pdf, remarks, created_at, updated_at FROM gmd_gem_ids ORDER BY id DESC;")
            rows = cursor.fetchall()
            cursor.close()
            conn.close()
            return [
                _format_record({
                    "id": r[0],
                    "gem_id": r[1],
                    "drive_link": r[2],
                    "order_pdf": r[3],
                    "remarks": r[4],
                    "created_at": str(r[5]),
                    "updated_at": str(r[6])
                })
                for r in rows
            ]
        else:
            cursor.execute("SELECT * FROM gmd_gem_ids ORDER BY id DESC;")
            rows = cursor.fetchall()
            cursor.close()
            conn.close()
            return [_format_record(dict(r)) for r in rows]
    except Exception as e:
        print(f"[DB ERROR] Error fetching all records: {e}")
        return []
