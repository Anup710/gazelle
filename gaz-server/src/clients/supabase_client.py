"""Singleton Supabase client. Sync — supabase-py doesn't ship an async client and our
calls are simple selects/inserts/updates against one table.
"""

from functools import lru_cache

from supabase import Client, create_client

from ..core.config import settings


@lru_cache
def get() -> Client:
    s = settings()
    return create_client(s.SUPABASE_URL, s.SUPABASE_KEY)
