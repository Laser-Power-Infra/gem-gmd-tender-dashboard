import os
import json
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_PATH = os.path.join(BASE_DIR, "token.json")

# In-memory cached access token
_cached_access_token = None

def get_valid_access_token():
    global _cached_access_token
    # Try reading from environment variables first
    refresh_token = os.environ.get("GDRIVE_REFRESH_TOKEN")
    client_id = os.environ.get("GDRIVE_CLIENT_ID")
    client_secret = os.environ.get("GDRIVE_CLIENT_SECRET")
    token_uri = os.environ.get("GDRIVE_TOKEN_URI", "https://oauth2.googleapis.com/token")

    token_data = {}
    if os.path.exists(TOKEN_PATH):
        try:
            with open(TOKEN_PATH, 'r', encoding='utf-8') as f:
                token_data = json.load(f)
            refresh_token = refresh_token or token_data.get("refresh_token")
            client_id = client_id or token_data.get("client_id")
            client_secret = client_secret or token_data.get("client_secret")
            token_uri = token_uri or token_data.get("token_uri", "https://oauth2.googleapis.com/token")
        except Exception:
            pass

    if not refresh_token or not client_id or not client_secret:
        raise ValueError("Missing GDRIVE_REFRESH_TOKEN, GDRIVE_CLIENT_ID, or GDRIVE_CLIENT_SECRET in .env or token.json")

    # Refresh the access token
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }

    res = requests.post(token_uri, data=payload, timeout=10)
    res_data = res.json()

    if "access_token" in res_data:
        access_token = res_data["access_token"]
        _cached_access_token = access_token
        # Try updating token.json if file exists
        if os.path.exists(TOKEN_PATH):
            try:
                token_data["access_token"] = access_token
                with open(TOKEN_PATH, 'w', encoding='utf-8') as f:
                    json.dump(token_data, f, indent=2)
            except Exception:
                pass
        return access_token
    else:
        raise Exception(f"Failed to refresh Google Drive access token: {res_data}")

def upload_pdf_to_gdrive(file_path, filename=None, folder_id=None):
    """
    Uploads a file (PDF, Docx, etc.) to Google Drive in the specified folder_id.
    Returns the Google Drive webViewLink URL.
    """
    if not folder_id:
        folder_id = os.environ.get("GDRIVE_FOLDER_ID", "1WR5AkLfp_ymTgBeLbLbfJq1Zng_KfB90")
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    access_token = get_valid_access_token()
    if not filename:
        filename = os.path.basename(file_path)

    metadata = {
        "name": filename,
        "parents": [folder_id]
    }

    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    # Detect mime type or default to application/octet-stream
    mime_type = "application/pdf"
    ext = os.path.splitext(filename)[1].lower()
    if ext in ['.doc', '.docx']:
        mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif ext in ['.xls', '.xlsx']:
        mime_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif ext in ['.png', '.jpg', '.jpeg']:
        mime_type = f"image/{ext.lstrip('.')}"

    files = {
        "data": ("metadata", json.dumps(metadata), "application/json; charset=UTF-8"),
        "file": (filename, open(file_path, "rb"), mime_type)
    }

    upload_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink"
    res = requests.post(upload_url, headers=headers, files=files, timeout=30)

    if res.status_code == 200:
        res_data = res.json()
        file_id = res_data.get("id")
        web_link = res_data.get("webViewLink") or f"https://drive.google.com/file/d/{file_id}/view"

        # Optionally make file readable by anyone with link
        try:
            permission_url = f"https://www.googleapis.com/drive/v3/files/{file_id}/permissions"
            perm_payload = {"role": "reader", "type": "anyone"}
            requests.post(permission_url, headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}, json=perm_payload, timeout=10)
        except Exception as pe:
            print(f"Warning setting permission: {pe}")

        return web_link
    else:
        raise Exception(f"Drive upload failed ({res.status_code}): {res.text}")
