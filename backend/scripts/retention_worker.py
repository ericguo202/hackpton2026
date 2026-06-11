"""Long-running, API-independent worker enforcing the delivery-analytics
retention ceiling.

Runs as its own container (the `retention_purge` service in
docker-compose.prod.yml) so the consent's "deleted within 12 months of your
last session" promise holds even when the API replicas are down or mid-redeploy.
It
reuses the exact advisory-lock-guarded daily loop the in-API scheduler uses, so
the two coexist safely: the purge is idempotent and a Postgres advisory lock
guarantees only one process sweeps at a time.

    python -m scripts.retention_worker
"""

from app.services.delivery_retention_scheduler import run_retention_worker

if __name__ == "__main__":
    run_retention_worker()
