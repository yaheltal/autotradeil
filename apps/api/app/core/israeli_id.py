"""Israeli teudat-zehut checksum (Luhn-like).

Used to validate the 9-digit ID number before we send an SMS or trust it
as one of the two factors in the phone+ID login flow. The DB-level CHECK
constraint only enforces the digit-count format (`^[0-9]{9}$`); the real
checksum lives here so we reject malformed IDs at the API boundary.

Algorithm (per Population Registry spec):
    For each digit at index i (0-based, left-to-right):
        step = digit * (i % 2 + 1)        # alternating x1, x2
        if step > 9: step -= 9            # collapse two-digit results
    sum(step) % 10 == 0  →  valid

Reference:
    https://en.wikipedia.org/wiki/Israeli_identity_card#Israeli_identity_number
"""

from __future__ import annotations


def is_valid_israeli_id(id_number: str | None) -> bool:
    if not id_number or len(id_number) != 9 or not id_number.isdigit():
        return False
    total = 0
    for i, ch in enumerate(id_number):
        step = int(ch) * ((i % 2) + 1)
        if step > 9:
            step -= 9
        total += step
    return total % 10 == 0
