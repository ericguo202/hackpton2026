"""Manual / cron entrypoint for the delivery-analytics retention purge.

The app already enforces the retention ceiling via an in-process daily loop
(`delivery_retention_scheduler.py`). This script is the out-of-band lever: run
it by hand to force a sweep, or wire it to a host cron / one-off compose service
as a belt-and-suspenders backstop. It shares the exact purge primitive, so it is
idempotent and safe to run anytime.

    python -m scripts.purge_delivery_analytics

(Run from the backend root, same working dir as Alembic.)
"""

import asyncio
import logging

from app.db.session import AsyncSessionLocal
from app.services.delivery_consent import purge_expired_delivery_analytics

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger("purge_delivery_analytics")


async def _main() -> None:
    async with AsyncSessionLocal() as db:
        async with db.begin():
            purged = await purge_expired_delivery_analytics(db)
    logger.info(
        "Delivery-analytics retention purge complete: %d user(s) purged.", purged
    )


if __name__ == "__main__":
    asyncio.run(_main())
