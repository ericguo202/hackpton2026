"""
In-process registry of background evaluation tasks.

When turn 1 of a session completes, we kick off Gemma 4 evaluation in
the background (it takes ~30-40s) and immediately return the next
question so the candidate doesn't sit watching a spinner. The task
handle is parked here so that turn 2's handler can `await` it before
computing the session aggregate.

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


# Keyed by session_id only because the 2-turn flow has at most ONE pending
# background eval per session at a time (turn 1's). If we ever go to N
# turns, change this to dict[(UUID, int)] keyed by (session_id, turn_number).
_pending: dict[UUID, asyncio.Task[None]] = {}


def register(session_id: UUID, task: asyncio.Task[None]) -> None:
    """Park a background eval task so finalization can await it.

    Overwrites any existing entry for the same session — that should
    never happen in the 2-turn flow, but a stray previous task wouldn't
    be useful to await on anyway since it's already running.
    """
    existing = _pending.get(session_id)
    if existing is not None and not existing.done():
        logger.warning(
            "Replacing in-flight eval task for session %s; previous task "
            "will continue running but will no longer be awaited.",
            session_id,
        )
    _pending[session_id] = task


def pop(session_id: UUID) -> asyncio.Task[None] | None:
    """Remove and return the pending task for a session, if any.

    Used by the finalization path. The caller is responsible for
    awaiting the returned task; we hand it over rather than awaiting
    inside this module so the caller controls timeout / error handling.
    """
    return _pending.pop(session_id, None)


def discard(session_id: UUID) -> None:
    """Best-effort cleanup hook for completed background tasks.

    The background eval coroutine calls this from its `finally` block
    so a finalize that never fires (e.g. user abandons the session)
    doesn't leak a strong reference to a finished Task.
    """
    _pending.pop(session_id, None)
