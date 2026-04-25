"""Gmail SMTP fallback for transactional email.

Used when the Resend API isn't configured or the Resend send fails (typical
in dev where the project's domain isn't verified yet). Mirrors the shape of
`send_via_resend` so `_send()` in `email.py` can fall through transparently.
"""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_via_gmail(
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
) -> bool:
    """Send a multipart/alternative email via Gmail SMTP over SSL (port 465).

    Requires:
      - `GMAIL_FROM`: full Gmail address.
      - `GMAIL_APP_PASSWORD`: 16-character app password generated at
        https://myaccount.google.com/apppasswords (NOT the regular
        account password — that won't work with 2-step verification on).

    Returns True on success, False on any failure (logged).
    """
    if not settings.gmail_app_password or not settings.gmail_from:
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"AutoTradeIL <{settings.gmail_from}>"
        msg["To"] = to
        # Plain-text part FIRST (RFC 2046 — most preferred last; for
        # multipart/alternative the LAST part is the most preferred, so
        # html should be attached last).
        if text:
            msg.attach(MIMEText(text, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as server:
            server.login(settings.gmail_from, settings.gmail_app_password)
            server.sendmail(settings.gmail_from, to, msg.as_string())
        logger.info("gmail smtp sent to=%s subject=%r", to, subject)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("gmail smtp error to=%s subject=%r err=%s", to, subject, exc)
        return False
