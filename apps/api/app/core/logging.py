import logging
import sys
from typing import Any


def configure_logging(level: str = "INFO") -> None:
    """Configure root logger with structured format and stdout output.

    Called once at app startup. Uses stdlib logging (works with uvicorn's
    own loggers when reuse=True).
    """
    log_level = getattr(logging, level.upper(), logging.INFO)

    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)-8s %(name)s :: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)

    # Quiet noisy libraries in dev
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def log_request(
    logger: logging.Logger,
    method: str,
    path: str,
    status: int,
    duration_ms: float,
    **extra: Any,
) -> None:
    logger.info(
        "%s %s -> %d (%.1fms)%s",
        method,
        path,
        status,
        duration_ms,
        " " + " ".join(f"{k}={v}" for k, v in extra.items()) if extra else "",
    )
