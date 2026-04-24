"""Email delivery via Resend.

All emails are sent synchronously through Resend's SDK but exposed via
async wrappers so callers look consistent with the rest of the codebase.
Failures are logged and return False — a failed email must never break
the request flow that triggered it.
"""

from __future__ import annotations

import logging
from enum import Enum

import resend

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailTemplate(str, Enum):
    DEALER_VERIFIED = "dealer_verified"
    DEALER_REJECTED = "dealer_rejected"


# --------------------------------------------------------------------------
# Templates (Hebrew RTL)
# --------------------------------------------------------------------------


_BASE_STYLE = """
    body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5;
            margin: 0; padding: 0; direction: rtl; }}
    .container {{ max-width: 600px; margin: 40px auto; background: white;
                  border-radius: 12px; overflow: hidden;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.08); }}
    .header {{ background: #1a1a2e; padding: 32px; text-align: center; }}
    .header h1 {{ color: white; margin: 0; font-size: 24px; }}
    .body {{ padding: 40px 32px; }}
    .badge {{ display: inline-block; color: white; padding: 6px 16px;
              border-radius: 20px; font-size: 14px; margin-bottom: 24px; }}
    .badge-ok {{ background: #22c55e; }}
    .badge-no {{ background: #ef4444; }}
    h2 {{ color: #1a1a2e; font-size: 22px; margin: 0 0 16px; }}
    p {{ color: #555; line-height: 1.7; font-size: 16px; margin: 0 0 16px; }}
    .cta {{ display: inline-block; background: #1a1a2e; color: white;
            text-align: center; padding: 14px 32px; border-radius: 8px;
            text-decoration: none; font-size: 16px; font-weight: 600;
            margin: 32px 0; }}
    .reason-box {{ background: #fef2f2; border-right: 4px solid #ef4444;
                   padding: 16px 20px; border-radius: 4px; margin: 24px 0;
                   color: #7f1d1d; font-size: 15px; }}
    .footer {{ background: #f9f9f9; padding: 20px 32px; text-align: center;
               color: #999; font-size: 13px; border-top: 1px solid #eee; }}
"""


def _get_verified_html(business_name: str) -> str:
    return f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>הבקשה שלך אושרה</title>
  <style>{_BASE_STYLE}</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>AutoTradeIL</h1></div>
    <div class="body">
      <span class="badge badge-ok">✓ אושר</span>
      <h2>ברכות, {business_name}!</h2>
      <p>שמחים לבשר כי הבקשה שלך להצטרף ל-AutoTradeIL <strong>אושרה</strong>.</p>
      <p>כעת תוכל להתחבר למערכת ולהתחיל להוסיף רכבים למלאי שלך.</p>
      <p style="text-align:center;">
        <a class="cta" href="https://autotradeil.co.il/login">כניסה למערכת</a>
      </p>
      <p>לעזרה או שאלות — ניתן להשיב למייל הזה או ליצור קשר בוואטסאפ.</p>
    </div>
    <div class="footer">
      AutoTradeIL &copy; 2026 &middot; המערכת המקצועית לסחר רכבים
    </div>
  </div>
</body>
</html>"""


def _get_rejected_html(business_name: str, reason: str) -> str:
    return f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>עדכון על בקשת ההצטרפות שלך</title>
  <style>{_BASE_STYLE}</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>AutoTradeIL</h1></div>
    <div class="body">
      <span class="badge badge-no">✗ לא אושר</span>
      <h2>שלום, {business_name}</h2>
      <p>בדקנו את בקשתך להצטרף ל-AutoTradeIL ולצערנו לא נוכל לאשר אותה בשלב זה.</p>
      <div class="reason-box"><strong>סיבה:</strong> {reason}</div>
      <p>אם ברצונך לערער על ההחלטה או לספק מידע נוסף, ניתן ליצור איתנו קשר
         ישירות בתשובה למייל הזה.</p>
    </div>
    <div class="footer">
      AutoTradeIL &copy; 2026 &middot; המערכת המקצועית לסחר רכבים
    </div>
  </div>
</body>
</html>"""


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------


async def send_dealer_verified(to_email: str, business_name: str) -> bool:
    """Send approval email. Returns True on success, False on failure."""
    return await _send(
        to=to_email,
        subject="✅ הבקשה שלך ל-AutoTradeIL אושרה",
        html=_get_verified_html(business_name),
    )


async def send_dealer_rejected(
    to_email: str,
    business_name: str,
    reason: str,
) -> bool:
    """Send rejection email. Returns True on success, False on failure."""
    return await _send(
        to=to_email,
        subject="עדכון על בקשת ההצטרפות שלך ל-AutoTradeIL",
        html=_get_rejected_html(business_name, reason),
    )


async def _send(to: str, subject: str, html: str) -> bool:
    """Internal send. Never raises — logs failures instead."""
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY not configured — skipping email to %s", to)
        return False

    try:
        resend.api_key = settings.resend_api_key
        params: resend.Emails.SendParams = {
            "from": settings.resend_from_email,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        response = resend.Emails.send(params)
        logger.info(
            "email sent id=%s to=%s subject=%r",
            response.get("id") if isinstance(response, dict) else response,
            to,
            subject,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("email send failed to=%s subject=%r err=%s", to, subject, exc)
        return False
