"""Daily background enforcement of the delivery-analytics retention ceiling.

The delivery-analytics consent promises stored webcam summaries are deleted no
later than `DELIVERY_ANALYTICS_RETENTION_MONTHS` after a user's last session. A
stated retention term that isn't enforced is worse than none, so this module
runs `purge_expired_delivery_analytics` on a loop instead of relying on manual
cleanup. The same daily sweep also scrubs stale `incidents` payloads
(`scrub_old_incident_content`), since those can hold user-supplied text.

Topology note: production runs two API replicas (blue/green) behind Caddy, so
the loop lives in *both* — a Postgres transaction-level advisory lock
(`pg_try_advisory_xact_lock`) ensures only one replica actually sweeps at a
time, and the purge is idempotent anyway. The whole sweep runs inside one
transaction so the xact lock auto-releases on commit/rollback (no manual
unlock, no connection-pinning across the pool).
"""

import asyncio
import logging

from sqlalchemy import text

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.services.delivery_consent import purge_expired_delivery_analytics
from app.services.incidents import scrub_old_incident_content

logger = logging.getLogger(__name__)

# Arbitrary but stable 64-bit key namespacing this job's advisory lock. Distinct
# from any other advisory lock the app might add later.
_ADVISORY_LOCK_KEY = 0x5D11_3E47_2026_0610


async def _run_sweep_once() -> None:
    """Acquire the cross-replica lock and purge expired analytics, atomically."""
    async with AsyncSessionLocal() as db:
        async with db.begin():
            acquired = await db.scalar(
                text("SELECT pg_try_advisory_xact_lock(:key)"),
                {"key": _ADVISORY_LOCK_KEY},
            )
            if not acquired:
                # Another replica holds the lock — it's sweeping now. Skip; the
                # empty transaction commits and releases nothing.
                return
            purged = await purge_expired_delivery_analytics(db)
            if purged:
                logger.info(
                    "Delivery-analytics retention purge: cleared analytics "
                    "for %d user(s) past the retention window.",
                    purged,
                )
            # Same sweep also scrubs stale incident payloads (user-supplied
            # text retained no longer than the configured window).
            scrubbed = await scrub_old_incident_content(db)
            if scrubbed:
                logger.info(
                    "Incident content scrub: cleared payloads on %d old "
                    "incident row(s).",
                    scrubbed,
                )


async def _retention_loop() -> None:
    interval = settings.DELIVERY_RETENTION_PURGE_INTERVAL_SECONDS
    while True:
        try:
            await _run_sweep_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            # Never let a transient DB hiccup kill the loop — log and retry on
            # the next tick.
            logger.exception("Delivery-analytics retention purge failed")
        await asyncio.sleep(interval)


def start_retention_scheduler() -> asyncio.Task | None:
    """Spawn the daily purge loop as a background task (or None if disabled)."""
    if not settings.DELIVERY_RETENTION_PURGE_ENABLED:
        logger.info("Delivery-analytics retention purge disabled via settings.")
        return None
    logger.info("Starting delivery-analytics retention purge loop.")
    return asyncio.create_task(_retention_loop())


async def stop_retention_scheduler(task: asyncio.Task | None) -> None:
    """Cancel the background loop and wait for it to unwind."""
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


def run_retention_worker() -> None:
    """Blocking entrypoint for a dedicated retention container.

    Runs the same advisory-lock-guarded loop as the in-API scheduler, but
    unconditionally — the `DELIVERY_RETENTION_PURGE_ENABLED` flag only governs
    the in-API loop. This process exists so the retention promise holds even
    when the API replicas are down; the advisory lock + idempotency let it
    coexist safely with the in-API loop (whoever grabs the lock sweeps; the
    rest skip). See the `retention_purge` service in docker-compose.prod.yml.
    """
    logging.basicConfig(
        level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s"
    )
    logger.info(
        "Delivery-analytics retention worker starting (standalone; "
        "interval=%ss).",
        settings.DELIVERY_RETENTION_PURGE_INTERVAL_SECONDS,
    )
    try:
        asyncio.run(_retention_loop())
    except KeyboardInterrupt:
        logger.info("Delivery-analytics retention worker stopped.")
