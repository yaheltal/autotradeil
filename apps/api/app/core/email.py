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
    OFFER_RECEIVED = "offer_received"
    OFFER_ACCEPTED = "offer_accepted"
    OFFER_REJECTED = "offer_rejected"
    COUNTER_OFFER = "counter_offer"
    OTP_CODE = "otp_code"
    KYC_APPROVED = "kyc_approved"
    KYC_REJECTED = "kyc_rejected"
    DEAL_COMPLETED_BUYER = "deal_completed_buyer"
    DEAL_COMPLETED_SELLER = "deal_completed_seller"
    OFFER_REMINDER = "offer_reminder"
    PASSWORD_RESET = "password_reset"


def _fmt_price(v: int) -> str:
    return f"{v:,}".replace(",", ",")


def _marketplace_shell(
    title: str,
    badge_text: str,
    badge_class: str,
    heading: str,
    body_html: str,
    cta_href: str = "https://autotradeil.co.il/dashboard/offers",
    cta_text: str = "פתיחת מערכת ההצעות",
) -> str:
    return f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style>{_BASE_STYLE}
    .vehicle-box {{ background: #f8f8f6; border-radius: 8px;
                    padding: 16px 20px; margin: 20px 0; color: #1a1a2e;
                    font-size: 15px; }}
    .vehicle-box strong {{ color: #1a1a2e; }}
    .price {{ color: #1a1a2e; font-weight: 700; font-size: 18px; }}
    .message-box {{ background: #fffbeb; border-right: 4px solid #e8b84b;
                    padding: 16px 20px; border-radius: 4px; margin: 20px 0;
                    color: #1a1a2e; font-size: 15px; }}
    .badge-info {{ background: #1a1a2e; }}
    .badge-gold {{ background: #e8b84b; color: #1a1a2e; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>AutoTradeIL</h1></div>
    <div class="body">
      <span class="badge {badge_class}">{badge_text}</span>
      <h2>{heading}</h2>
      {body_html}
      <p style="text-align:center;">
        <a class="cta" href="{cta_href}">{cta_text}</a>
      </p>
    </div>
    <div class="footer">
      AutoTradeIL &copy; 2026 &middot; המערכת המקצועית לסחר רכבים
    </div>
  </div>
</body>
</html>"""


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


# --------------------------------------------------------------------------
# Marketplace (Phase 4.1)
# --------------------------------------------------------------------------


def _vehicle_line(make: str, model: str, year: int) -> str:
    return f"{make} {model} {year}"


async def send_offer_received(
    to_email: str,
    seller_business_name: str,
    buyer_business_name: str,
    vehicle: dict[str, object],
    offered_price: int,
    message: str | None,
) -> bool:
    veh_line = _vehicle_line(str(vehicle["make"]), str(vehicle["model"]), int(vehicle["year"]))
    price_html = f'<span class="price">{_fmt_price(offered_price)} ₪</span>'
    message_html = (
        f'<div class="message-box"><strong>הודעה מהקונה:</strong><br>{message}</div>'
        if message
        else ""
    )
    html = _marketplace_shell(
        title="התקבלה הצעת רכישה חדשה",
        badge_text="הצעה חדשה",
        badge_class="badge-gold",
        heading=f"שלום, {seller_business_name}",
        body_html=(
            f'<p>התקבלה הצעת רכישה חדשה מהסוחר <strong>{buyer_business_name}</strong>.</p>'
            f'<div class="vehicle-box">'
            f'<strong>רכב:</strong> {veh_line}<br>'
            f'<strong>הצעה:</strong> {price_html}'
            f'</div>'
            f'{message_html}'
            f'<p>ניתן לאשר, לדחות או לשלוח הצעה נגדית מתוך מערכת ההצעות.</p>'
        ),
    )
    return await _send(
        to=to_email,
        subject=f"💰 הצעה חדשה: {veh_line}",
        html=html,
    )


async def send_offer_accepted(
    to_email: str,
    buyer_business_name: str,
    seller_business_name: str,
    vehicle: dict[str, object],
    offered_price: int,
) -> bool:
    veh_line = _vehicle_line(str(vehicle["make"]), str(vehicle["model"]), int(vehicle["year"]))
    price_html = f'<span class="price">{_fmt_price(offered_price)} ₪</span>'
    html = _marketplace_shell(
        title="ההצעה אושרה",
        badge_text="ההצעה אושרה",
        badge_class="badge-ok",
        heading=f"ברכות, {buyer_business_name}!",
        body_html=(
            f'<p>הסוחר <strong>{seller_business_name}</strong> אישר את ההצעה שלך.</p>'
            f'<div class="vehicle-box">'
            f'<strong>רכב:</strong> {veh_line}<br>'
            f'<strong>מחיר מוסכם:</strong> {price_html}'
            f'</div>'
            f'<p>ניתן כעת ליצור קשר עם המוכר להשלמת העסקה. פרטי הקשר זמינים במערכת.</p>'
        ),
    )
    return await _send(
        to=to_email,
        subject=f"✅ ההצעה אושרה: {veh_line}",
        html=html,
    )


async def send_offer_rejected(
    to_email: str,
    buyer_business_name: str,
    seller_business_name: str,
    vehicle: dict[str, object],
    offered_price: int,
) -> bool:
    veh_line = _vehicle_line(str(vehicle["make"]), str(vehicle["model"]), int(vehicle["year"]))
    price_html = f'<span class="price">{_fmt_price(offered_price)} ₪</span>'
    html = _marketplace_shell(
        title="ההצעה נדחתה",
        badge_text="ההצעה נדחתה",
        badge_class="badge-no",
        heading=f"שלום, {buyer_business_name}",
        body_html=(
            f'<p>הסוחר <strong>{seller_business_name}</strong> דחה את ההצעה שלך.</p>'
            f'<div class="vehicle-box">'
            f'<strong>רכב:</strong> {veh_line}<br>'
            f'<strong>הצעה שהוגשה:</strong> {price_html}'
            f'</div>'
            f'<p>ניתן להמשיך לחפש רכבים נוספים בשוק הסיטונאי שלנו.</p>'
        ),
        cta_href="https://autotradeil.co.il/dashboard/marketplace",
        cta_text="חזרה לשוק",
    )
    return await _send(
        to=to_email,
        subject=f"עדכון על הצעת הרכישה: {veh_line}",
        html=html,
    )


async def send_counter_offer(
    to_email: str,
    recipient_business_name: str,
    from_business_name: str,
    vehicle: dict[str, object],
    original_price: int,
    counter_price: int,
    counter_message: str | None,
    role: str,  # "buyer" | "seller" — recipient's role
) -> bool:
    """Sent when either side posts a counter-offer. `role` describes who the
    email recipient is — controls the wording."""
    veh_line = _vehicle_line(str(vehicle["make"]), str(vehicle["model"]), int(vehicle["year"]))
    orig_html = f'<span class="price">{_fmt_price(original_price)} ₪</span>'
    cnt_html = f'<span class="price">{_fmt_price(counter_price)} ₪</span>'
    message_html = (
        f'<div class="message-box"><strong>הודעה:</strong><br>{counter_message}</div>'
        if counter_message
        else ""
    )
    side_word = "מהמוכר" if role == "buyer" else "מהקונה"
    html = _marketplace_shell(
        title="התקבלה הצעה נגדית",
        badge_text="הצעה נגדית",
        badge_class="badge-info",
        heading=f"שלום, {recipient_business_name}",
        body_html=(
            f'<p>התקבלה הצעה נגדית {side_word} <strong>{from_business_name}</strong>.</p>'
            f'<div class="vehicle-box">'
            f'<strong>רכב:</strong> {veh_line}<br>'
            f'<strong>הצעה קודמת:</strong> {orig_html}<br>'
            f'<strong>הצעה נגדית:</strong> {cnt_html}'
            f'</div>'
            f'{message_html}'
            f'<p>ניתן לאשר, לדחות או להגיב בהצעה נגדית נוספת.</p>'
        ),
    )
    return await _send(
        to=to_email,
        subject=f"🔄 הצעה נגדית: {veh_line}",
        html=html,
    )


# --------------------------------------------------------------------------
# Security (Phase 3.5) — OTP, KYC approval/rejection
# --------------------------------------------------------------------------


async def send_suspension_notice(
    to_email: str, business_name: str, reason: str
) -> bool:
    """Phase 6.7 — notify a dealer that an admin suspended their account.

    Only sent for `suspension_silent=false` suspensions. Silent suspensions
    intentionally don't send anything."""
    html = f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>החשבון שלך הושעה</title>
  <style>{_BASE_STYLE}
    .badge-warn {{ background: #b45309; color: white; }}
    .reason-box {{ background: #fff7ed; border-right: 4px solid #b45309;
                   padding: 16px 20px; margin: 20px 0; border-radius: 4px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="badge badge-warn">⚠️ הודעה מהמערכת</p>
      <h1>החשבון שלך הושעה</h1>
    </div>
    <div class="content">
      <p>שלום {business_name},</p>
      <p>אנו מודיעים לך כי חשבון הסוחר שלך ב-AutoTradeIL הושעה ע"י צוות הניהול.</p>
      <div class="reason-box">
        <strong>סיבת ההשעיה:</strong>
        <p style="margin: 8px 0 0;">{reason}</p>
      </div>
      <p>בזמן שהחשבון מושעה לא תוכל לבצע פעולות במערכת — צפייה במלאי, שליחת הצעות, או סגירת עסקאות.</p>
      <p>לבירור או לערעור, אנא פנה אלינו במייל החוזר או דרך אמצעי התמיכה הרגילים.</p>
    </div>
    <div class="footer">
      <p>הודעה זו נשלחה אוטומטית ממערכת AutoTradeIL.</p>
    </div>
  </div>
</body>
</html>"""
    text = (
        f"שלום {business_name},\n\n"
        f"חשבון הסוחר שלך ב-AutoTradeIL הושעה.\n"
        f"סיבת ההשעיה: {reason}\n\n"
        f"לא תוכל לבצע פעולות במערכת בזמן שהחשבון מושעה. "
        f"לבירור או לערעור, פנה אלינו במייל החוזר.\n\n"
        f"AutoTradeIL"
    )
    return await _send(
        to=to_email,
        subject=f"⚠️ החשבון שלך ב-AutoTradeIL הושעה",
        html=html,
        text=text,
    )


async def send_otp_email(to_email: str, business_name: str, code: str) -> bool:
    """Email OTP code. Valid for 10 minutes."""
    html = f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>קוד אימות</title>
  <style>{_BASE_STYLE}
    .otp-code {{ font-size: 36px; font-weight: 700; letter-spacing: 8px;
                 color: #1a1a2e; background: #f8f8f6; padding: 20px 30px;
                 border-radius: 8px; text-align: center; margin: 24px 0;
                 font-family: 'Courier New', monospace; direction: ltr; }}
    .badge-info {{ background: #1a1a2e; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>AutoTradeIL</h1></div>
    <div class="body">
      <span class="badge badge-info">קוד אימות</span>
      <h2>שלום, {business_name}</h2>
      <p>להלן קוד האימות שלך. הקוד תקף ל-10 דקות בלבד.</p>
      <div class="otp-code">{code}</div>
      <p>אם לא ביקשת קוד אימות — ניתן להתעלם מהמייל הזה.</p>
    </div>
    <div class="footer">
      AutoTradeIL &copy; 2026 &middot; המערכת המקצועית לסחר רכבים
    </div>
  </div>
</body>
</html>"""
    return await _send(
        to=to_email,
        subject=f"🔐 קוד אימות AutoTradeIL: {code}",
        html=html,
    )


async def send_kyc_approved(to_email: str, business_name: str) -> bool:
    html = f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>אימות הזהות אושר</title>
  <style>{_BASE_STYLE}</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>AutoTradeIL</h1></div>
    <div class="body">
      <span class="badge badge-ok">✓ אומת</span>
      <h2>ברכות, {business_name}!</h2>
      <p>אימות הזהות שלך (KYC) <strong>אושר</strong>. כעת יש לך גישה מלאה לשוק הסיטונאי B2B ולכל תכונות המערכת.</p>
      <p style="text-align:center;">
        <a class="cta" href="https://autotradeil.co.il/dashboard/marketplace">כניסה לשוק</a>
      </p>
    </div>
    <div class="footer">
      AutoTradeIL &copy; 2026 &middot; המערכת המקצועית לסחר רכבים
    </div>
  </div>
</body>
</html>"""
    return await _send(
        to=to_email,
        subject="✅ אימות הזהות שלך ב-AutoTradeIL אושר",
        html=html,
    )


async def send_deal_completed_buyer(
    to_email: str,
    seller_business_name: str,
    vehicle: dict[str, object],
    final_price: int,
) -> bool:
    veh_line = _vehicle_line(
        str(vehicle["make"]), str(vehicle["model"]), int(vehicle["year"])
    )
    price_html = f'<span class="price">{_fmt_price(final_price)} ₪</span>'
    html = _marketplace_shell(
        title="עסקה נסגרה",
        badge_text="עסקה נסגרה",
        badge_class="badge-ok",
        heading="ברכות — העסקה אושרה משני הצדדים",
        body_html=(
            f'<p>העסקה מול <strong>{seller_business_name}</strong> נסגרה.</p>'
            f'<div class="vehicle-box">'
            f'<strong>רכב:</strong> {veh_line}<br>'
            f'<strong>מחיר סופי:</strong> {price_html}'
            f'</div>'
            f'<p>ניתן להשלים את המשך התהליך ישירות מול המוכר — פרטי הקשר זמינים במערכת.</p>'
        ),
        cta_href="https://autotradeil.co.il/dashboard/deals",
        cta_text="צפה בעסקאות",
    )
    return await _send(
        to=to_email, subject=f"✅ עסקה נסגרה: {veh_line}", html=html
    )


async def send_deal_completed_seller(
    to_email: str,
    buyer_business_name: str,
    vehicle: dict[str, object],
    final_price: int,
) -> bool:
    veh_line = _vehicle_line(
        str(vehicle["make"]), str(vehicle["model"]), int(vehicle["year"])
    )
    price_html = f'<span class="price">{_fmt_price(final_price)} ₪</span>'
    html = _marketplace_shell(
        title="עסקה נסגרה",
        badge_text="עסקה נסגרה",
        badge_class="badge-ok",
        heading="העסקה אושרה משני הצדדים",
        body_html=(
            f'<p>העסקה מול <strong>{buyer_business_name}</strong> נסגרה. '
            f'הרכב סומן כנמכר במלאי שלך.</p>'
            f'<div class="vehicle-box">'
            f'<strong>רכב:</strong> {veh_line}<br>'
            f'<strong>מחיר סופי:</strong> {price_html}'
            f'</div>'
            f'<p>ניתן להשלים את המשך התהליך מול הקונה. מומלץ לעדכן את רישיון הרכב בהתאם.</p>'
        ),
        cta_href="https://autotradeil.co.il/dashboard/deals",
        cta_text="צפה בעסקאות",
    )
    return await _send(
        to=to_email, subject=f"✅ עסקה נסגרה: {veh_line}", html=html
    )


async def send_offer_reminder(
    to_email: str,
    buyer_business_name: str,
    vehicle: dict[str, object],
    offered_price: int,
    hours_ago: int,
) -> bool:
    veh_line = _vehicle_line(
        str(vehicle["make"]), str(vehicle["model"]), int(vehicle["year"])
    )
    price_html = f'<span class="price">{_fmt_price(offered_price)} ₪</span>'
    html = _marketplace_shell(
        title="תזכורת — הצעה ממתינה",
        badge_text="תזכורת",
        badge_class="badge-gold",
        heading="יש הצעה שממתינה לתגובתך",
        body_html=(
            f'<p>הצעה מ-<strong>{buyer_business_name}</strong> ממתינה לתגובה כבר {hours_ago} שעות.</p>'
            f'<div class="vehicle-box">'
            f'<strong>רכב:</strong> {veh_line}<br>'
            f'<strong>הצעה:</strong> {price_html}'
            f'</div>'
            f'<p>ניתן לאשר, לדחות או להציע הצעה נגדית מתוך מערכת ההצעות.</p>'
        ),
    )
    return await _send(
        to=to_email, subject=f"⏰ תזכורת — הצעה על {veh_line}", html=html
    )


async def send_password_reset(to_email: str, reset_link: str) -> bool:
    """Send password-reset email via Resend (supersedes Supabase default).

    Branded email-safe template — fully inline styles, table-based layout,
    no flexbox/grid/web fonts. Colors are pulled directly from the locked
    design tokens in apps/web/tailwind.config.ts + apps/web/src/app/
    globals.css:

      ink            #0A0A0A   primary text + heading
      paper          #FFFFFF   card surface
      muted          #6B6B6E   secondary body text
      subtle         #9A9A9D   footer caption
      accent         #A8723A   CTA button — the one editorial accent
      accent.subtle  #F4ECDF   URL fallback callout
      shadcn --muted #F4F4F5   outer body background (token in the system)

    Logo is the production-hosted full wordmark; the file lives at
    apps/web/public/logo-full.png so it ships with every Vercel deploy
    and email clients can fetch it from the public origin.

    A11y / deliverability:
      - <html dir="rtl" lang="he"> for screen readers.
      - alt="AutoTradeIL" on the logo so image-blocking clients still
        announce the brand.
      - CTA renders as a styled <a> inside a single-cell table so Outlook
        gives it a real bounding box (text-only fallback if the table is
        stripped).
      - A plain-text MIME alternative is sent alongside the HTML for
        clients that strip styling and for spam-filter scoring.
      - Hidden preheader line at the top of the body controls the
        notification-preview snippet on iOS / Gmail.
    """
    preheader = "איפוס סיסמה ב-AutoTradeIL — הקישור תקף לזמן מוגבל."
    html = f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>איפוס סיסמה ב-AutoTradeIL</title>
</head>
<body style="margin:0; padding:0; background-color:#F4F4F5; font-family:'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; color:#0A0A0A;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">{preheader}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F4F4F5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%; max-width:600px; background-color:#FFFFFF; border:1px solid #ECECEC; border-radius:8px;">
          <tr>
            <td align="center" style="padding:32px 32px 24px 32px; border-bottom:1px solid #ECECEC;">
              <img src="https://www.autotradeil.com/logo-full.png" alt="AutoTradeIL" width="180" style="max-width:180px; height:auto; border:0; display:block; outline:none; text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px 0; font-family:Georgia, 'Times New Roman', serif; font-size:28px; line-height:1.2; font-weight:500; color:#0A0A0A; text-align:right;">איפוס סיסמה</h1>
              <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#0A0A0A; text-align:right;">קיבלנו בקשה לאיפוס הסיסמה לחשבון שלך. לחץ על הכפתור למטה כדי לקבוע סיסמה חדשה.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto;">
                <tr>
                  <td align="center" style="background-color:#A8723A; border-radius:6px;">
                    <a href="{reset_link}" target="_blank" style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:600; color:#FFFFFF; text-decoration:none; font-family:'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;">איפוס הסיסמה</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 8px 0; font-size:13px; line-height:1.5; color:#6B6B6E; text-align:right;">או העתק את הקישור לדפדפן:</p>
              <p style="margin:0 0 24px 0; padding:12px 14px; background-color:#F4ECDF; border-radius:6px; font-size:12px; line-height:1.5; word-break:break-all; direction:ltr; text-align:left;"><a href="{reset_link}" style="color:#0A0A0A; text-decoration:underline;">{reset_link}</a></p>
              <p style="margin:24px 0 0 0; padding-top:24px; border-top:1px solid #ECECEC; font-size:13px; line-height:1.5; color:#6B6B6E; text-align:right;">הקישור תקף לזמן מוגבל. אם לא ביקשת איפוס, התעלם מהודעה זו.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 32px; border-top:1px solid #ECECEC; background-color:#FAFAF9; border-radius:0 0 8px 8px;">
              <p style="margin:0; font-size:12px; line-height:1.5; color:#9A9A9D; text-align:center;">&copy; 2026 AutoTradeIL</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    text = (
        "איפוס סיסמה ב-AutoTradeIL\n"
        "===========================\n\n"
        "קיבלנו בקשה לאיפוס הסיסמה לחשבון שלך.\n"
        "לחץ על הקישור הבא כדי לקבוע סיסמה חדשה:\n\n"
        f"{reset_link}\n\n"
        "הקישור תקף לזמן מוגבל. אם לא ביקשת איפוס, התעלם מהודעה זו.\n\n"
        "© 2026 AutoTradeIL\n"
    )
    return await _send(
        to=to_email,
        subject="איפוס סיסמה ב-AutoTradeIL",
        html=html,
        text=text,
    )


async def send_kyc_rejected(to_email: str, business_name: str, reason: str) -> bool:
    html = f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>אימות הזהות נדחה</title>
  <style>{_BASE_STYLE}</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>AutoTradeIL</h1></div>
    <div class="body">
      <span class="badge badge-no">✗ לא אושר</span>
      <h2>שלום, {business_name}</h2>
      <p>אימות המסמכים שלך לא אושר בשלב זה.</p>
      <div class="reason-box"><strong>סיבה:</strong> {reason}</div>
      <p>ניתן להעלות מסמכים מתוקנים מתוך אזור "אבטחה" בלוח הבקרה.</p>
      <p style="text-align:center;">
        <a class="cta" href="https://autotradeil.co.il/dashboard/security">לאזור אבטחה</a>
      </p>
    </div>
    <div class="footer">
      AutoTradeIL &copy; 2026 &middot; המערכת המקצועית לסחר רכבים
    </div>
  </div>
</body>
</html>"""
    return await _send(
        to=to_email,
        subject="עדכון על אימות הזהות ב-AutoTradeIL",
        html=html,
    )


async def send_kyc_submitted_to_support(
    *,
    to_email: str,
    business_name: str,
    dealer_email: str,
    dealer_phone: str | None,
    dealer_id: str,
    city: str | None,
) -> bool:
    """Notify the support inbox that a dealer just finalized KYC."""
    admin_link = f"https://autotradeil.co.il/admin/dealers/{dealer_id}"
    phone_html = dealer_phone or "—"
    city_html = city or "—"
    html = f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>בקשת אימות KYC חדשה</title>
  <style>{_BASE_STYLE}</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>AutoTradeIL</h1></div>
    <div class="body">
      <span class="badge badge-info">בקשת KYC חדשה</span>
      <h2>{business_name}</h2>
      <p>סוחר השלים העלאת 3 מסמכי זיהוי וממתין לסקירה.</p>
      <div class="reason-box">
        <p><strong>אימייל:</strong> {dealer_email}</p>
        <p><strong>טלפון:</strong> {phone_html}</p>
        <p><strong>עיר:</strong> {city_html}</p>
        <p><strong>מזהה סוחר:</strong> <code>{dealer_id}</code></p>
      </div>
      <p style="text-align:center;">
        <a class="cta" href="{admin_link}">פתיחת הסוחר בלוח האדמין</a>
      </p>
    </div>
    <div class="footer">
      AutoTradeIL &copy; 2026 &middot; המערכת המקצועית לסחר רכבים
    </div>
  </div>
</body>
</html>"""
    return await _send(
        to=to_email,
        subject=f"[KYC] בקשת אימות חדשה — {business_name}",
        html=html,
    )


async def _send(
    to: str, subject: str, html: str, text: str | None = None
) -> bool:
    """Internal send. Never raises — logs failures instead.

    Send order (Phase 4.4 addendum):
      1. Try Resend if RESEND_API_KEY is set.
      2. On Resend failure (or no API key), fall back to Gmail SMTP if
         GMAIL_FROM + GMAIL_APP_PASSWORD are configured.
      3. If both fail, log and return False — callers must never let
         email failure break the originating request.

    `text` is an optional plain-text MIME alternative (multipart/alternative).
    Improves deliverability and is preferred by screen-reader-friendly mail
    clients that disable HTML.
    """
    from app.core.smtp import send_via_gmail

    if not settings.resend_api_key:
        # Resend not configured — try Gmail SMTP fallback directly.
        ok = await send_via_gmail(to=to, subject=subject, html=html, text=text)
        if not ok:
            logger.warning(
                "no email transport configured (Resend + Gmail both off) — skipping to=%s",
                to,
            )
        return ok

    try:
        resend.api_key = settings.resend_api_key
        params: resend.Emails.SendParams = {
            "from": settings.resend_from_email,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if settings.reply_to_email:
            # Reply-To overrides Resend's default; customer replies
            # land in support@ even though the visible FROM is info@.
            params["reply_to"] = settings.reply_to_email  # type: ignore[typeddict-item]
        if text:
            params["text"] = text  # type: ignore[typeddict-item]
        response = resend.Emails.send(params)
        logger.info(
            "email sent id=%s to=%s subject=%r",
            response.get("id") if isinstance(response, dict) else response,
            to,
            subject,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "resend send failed (will try gmail smtp fallback) to=%s err=%s",
            to,
            exc,
        )
        # Phase 4.4 — fall through to Gmail SMTP.
        ok = await send_via_gmail(to=to, subject=subject, html=html, text=text)
        if not ok:
            logger.error(
                "email send failed via both resend + gmail to=%s subject=%r",
                to,
                subject,
            )
        return ok
