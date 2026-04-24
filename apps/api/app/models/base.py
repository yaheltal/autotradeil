"""SQLAlchemy declarative base.

Kept in its own module so migrations and models can import it without
pulling in the async engine (which requires env vars at import time).
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all ORM models."""
