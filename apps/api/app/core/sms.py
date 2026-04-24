"""Twilio SMS delivery.

Phase 3.5 introduces SMS as an alternative second factor for the dealer
OTP flow. Mirrors the shape of `app.core.email` — failures are logged
and return False; a failed SMS must never break the flow that triggered
it (the dealer can always fall back to email OTP).

Twilio's SDK is synchronous; we expose an async-looking wrapper so call
sites stay consistent. The actual network call is small enough that
blocking the loop briefly is acceptable for this tier.
"""

from __future__ import annotations

import logging

from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

from app.core.config import settings

logger = logging.getLogger(__name__)


def _normalize_il_phone(raw: str) -> str:
    """Convert common Israeli entry forms to E.164 (+972…).

    Accepts:
      - "052-1234567" / "052 1234567" / "0521234567"  → "+972521234567"
      - "+972521234567"                                → unchanged
      - "972521234567"                                 → "+972521234567"

    Returns the normalized string, or the trimmed input unchanged if we
    can't confidently normalize it — the Twilio API will reject bad
    numbers itself in that case.
    """
    s = "".join(ch for ch in raw if ch.isdigit() or ch == "+")
    if s.startswith("+"):
        return s
    if s.startswith("00"):
        return "+" + s[2:]
    if s.startswith("972"):
        return "+" + s
    if s.startswith("0"):
        return "+972" + s[1:]
    return s


async def send_sms(to_phone: str, message: str) -> bool:
    """Send an SMS via Twilio. Returns True on success, False on failure."""
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        logger.warning("Twilio not configured — skipping SMS to %s", to_phone)
        return False

    to = _normalize_il_phone(to_phone)

    try:
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        response = client.messages.create(
            body=message,
            from_=settings.twilio_phone_number,
            to=to,
        )
        logger.info("sms sent sid=%s to=%s", response.sid, to)
        return True
    except TwilioRestException as exc:
        logger.error("twilio rest error to=%s status=%s msg=%s", to, exc.status, exc.msg)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.error("sms send failed to=%s err=%s", to, exc)
        return False
