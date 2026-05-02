"""Redis cache client."""
import os
import redis.asyncio as redis

REDIS_URL = os.getenv("REDIS_URL", None)

if REDIS_URL:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
else:
    redis_client = None
