"""
In-process registry of background evaluation tasks.

When a non-final turn of a session completes, we kick off the turn evaluation in
the background (it takes ~30-40s) and immediately return the next
question so the candidate doesn't sit watching a spinner. The task
handle is parked here so that the finalizer can await known in-flight
evaluations before computing the session aggregate.

Why a module-level dict instead of a real task queue:
  * The deployment pins uvicorn to a single worker (see entrypoint.sh),
    so all in-flight requests share one event loop — a plain dict is
    sufficient and avoids a Redis/Celery dependency for the demo.
  * The dict holds STRONG references to the Task objects, which keeps
    asyncio from garbage-collecting them mid-flight.
  * The number of in-flight evals at any moment is O(active sessions),
    which is tiny (one row per concurrent user). No eviction policy needed.

If we ever scale beyond one worker this needs to move to Redis (or the
DB itself, polling `evaluated_at`); see `submit_turn` for the fallback
path that already runs eval inline if the registered task is missing.
"""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

logger = logging.getLogger(__name__)


_pending: dict[tuple[UUID, UUID], asyncio.Task[None]] = {}


def register(session_id: UUID, turn_id: UUID, task: asyncio.Task[None]) -> None:
    """Park a background eval task so finalization can await it.

    Overwrites any existing entry for the same turn — that should never happen,
    but a stray previous task would not be useful to await on anyway since it's
    already running.
    """
    key = (session_id, turn_id)
    existing = _pending.get(key)
    if existing is not None and not existing.done():
        logger.warning(
            "Replacing in-flight eval task for session %s turn %s; previous task "
            "will continue running but will no longer be awaited.",
            session_id, turn_id,
        )
    _pending[key] = task


def pop_session(session_id: UUID) -> list[asyncio.Task[None]]:
    """Remove and return pending tasks for a session, if any.

    Used by the finalization path. The caller is responsible for
    awaiting the returned tasks; we hand them over rather than awaiting
    inside this module so the caller controls timeout / error handling.
    """
    tasks: list[asyncio.Task[None]] = []
    for key in list(_pending):
        if key[0] == session_id:
            tasks.append(_pending.pop(key))
    return tasks


def discard(session_id: UUID, turn_id: UUID) -> None:
    """Best-effort cleanup hook for completed background tasks.

    The background eval coroutine calls this from its `finally` block
    so a finalize that never fires (e.g. user abandons the session)
    doesn't leak a strong reference to a finished Task.
    """
    _pending.pop((session_id, turn_id), None)
