import requests
import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

def send_alert(label, timestamp, img_path, extra_msg=None):
    """
    Send a Telegram alert with image and optional extra message.
    Returns True if sent successfully, False otherwise.
    """
    try:
        caption = f"[ALERT] {label} detected at {timestamp}"
        if extra_msg:
            caption += f"\n{extra_msg}"

        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto"
        with open(img_path, "rb") as img_file:
            files = {"photo": img_file}
            data = {"chat_id": CHAT_ID, "caption": caption}
            resp = requests.post(url, files=files, data=data)

        if resp.status_code == 200:
            print(f"[Telegram] Alert sent for {label}")
            return True
        else:
            print(f"[Telegram Error] {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"[Telegram Exception] {e}")
        return False
