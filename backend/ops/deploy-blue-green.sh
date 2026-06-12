#!/usr/bin/env bash
set -Eeuo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-backend}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://tfpdo.space/api/v1/health}"
STATE_DIR="${STATE_DIR:-.deploy}"
ACTIVE_FILE="${ACTIVE_FILE:-$STATE_DIR/active_color}"
UPSTREAM_DIR="${UPSTREAM_DIR:-caddy}"
UPSTREAM_FILE="${UPSTREAM_FILE:-$UPSTREAM_DIR/upstream}"
IMAGE_REF="${IMAGE_REF:?IMAGE_REF must be set to the image tag to deploy}"
MIN_ROOT_FREE_KB="${MIN_ROOT_FREE_KB:-3145728}"

compose() {
    docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

service_is_running() {
    local service="$1"
    local cid
    cid="$(compose ps -q "$service" 2>/dev/null || true)"
    [ -n "$cid" ] && [ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || true)" = "true" ]
}

legacy_api_is_running() {
    local cid
    cid="$(docker compose -p "$COMPOSE_PROJECT_NAME" -f docker-compose.yml ps -q api 2>/dev/null || true)"
    [ -n "$cid" ] && [ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || true)" = "true" ]
}

detect_active_color() {
    if [ -f "$ACTIVE_FILE" ]; then
        local recorded
        recorded="$(cat "$ACTIVE_FILE")"
        if [ "$recorded" = "blue" ] && service_is_running api_blue; then
            echo "blue"
            return
        fi
        if [ "$recorded" = "green" ] && service_is_running api_green; then
            echo "green"
            return
        fi
    fi

    if service_is_running api_blue; then
        echo "blue"
        return
    fi
    if service_is_running api_green; then
        echo "green"
        return
    fi

    echo "none"
}

wait_for_container_health() {
    local service="$1"
    local cid
    cid="$(compose ps -q "$service")"

    for _ in $(seq 1 90); do
        local running
        local health
        running="$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || true)"
        health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || true)"

        if [ "$running" != "true" ]; then
            echo "[deploy] $service exited before becoming healthy"
            docker logs "$cid" --tail 100 || true
            return 1
        fi
        if [ "$health" = "healthy" ]; then
            return 0
        fi

        sleep 2
    done

    echo "[deploy] $service did not become healthy in time"
    docker logs "$cid" --tail 100 || true
    return 1
}

wait_for_public_health() {
    for _ in $(seq 1 30); do
        if curl -fsS "$PUBLIC_HEALTH_URL" >/dev/null; then
            return 0
        fi
        sleep 2
    done
    return 1
}

write_upstream() {
    local service="$1"
    mkdir -p "$UPSTREAM_DIR"
    printf 'reverse_proxy %s:8000\n' "$service" > "$UPSTREAM_FILE"
}

reload_or_start_caddy() {
    compose up -d --no-deps caddy
    compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
}

rollback_caddy() {
    local service="$1"
    if [ "$service" = "none" ]; then
        return
    fi

    echo "[deploy] Public health failed; rolling Caddy back to $service"
    write_upstream "$service"
    reload_or_start_caddy || true
}

print_disk_usage() {
    echo "[deploy] Root filesystem usage"
    df -h /
    echo "[deploy] Docker disk usage"
    docker system df || true
}

require_root_free_space() {
    local available_kb
    available_kb="$(df -Pk / | awk 'NR == 2 {print $4}')"

    if [ -z "$available_kb" ] || [ "$available_kb" -lt "$MIN_ROOT_FREE_KB" ]; then
        echo "[deploy] Not enough free space on / for a safe image pull"
        echo "[deploy] Available: ${available_kb:-unknown} KiB; required: $MIN_ROOT_FREE_KB KiB"
        print_disk_usage
        return 1
    fi
}

remove_stopped_legacy_api_container() {
    local container_name="${COMPOSE_PROJECT_NAME}-api-1"
    local cid
    cid="$(docker ps -aq --filter "name=^/${container_name}$" --filter "status=exited" | head -n 1)"

    if [ -n "$cid" ]; then
        echo "[deploy] Removing stopped legacy api container $container_name"
        docker rm "$cid" || true
    fi
}

pre_pull_cleanup() {
    print_disk_usage
    remove_stopped_legacy_api_container

    echo "[deploy] Pruning unused Docker images and build cache before pull"
    docker image prune -af --filter "until=24h" || true
    docker builder prune -af --filter "until=24h" || true

    require_root_free_space
}

mkdir -p "$STATE_DIR" "$UPSTREAM_DIR"

if [ -n "${GHCR_USERNAME:-}" ] && [ -n "${GHCR_TOKEN:-}" ]; then
    echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
fi

pre_pull_cleanup

echo "[deploy] Pulling $IMAGE_REF"
docker pull "$IMAGE_REF"
export API_IMAGE="$IMAGE_REF"

echo "[deploy] Ensuring Postgres is running"
compose up -d db

echo "[deploy] Running migrations"
compose run --rm migrate

active_color="$(detect_active_color)"
if [ "$active_color" = "blue" ]; then
    target_color="green"
else
    target_color="blue"
fi
target_service="api_$target_color"
rollback_service="none"
if [ "$active_color" != "none" ]; then
    rollback_service="api_$active_color"
elif legacy_api_is_running; then
    rollback_service="api"
fi

echo "[deploy] Starting $target_service from $IMAGE_REF"
compose up -d --no-deps --force-recreate "$target_service"
wait_for_container_health "$target_service"

echo "[deploy] Switching Caddy to $target_service"
write_upstream "$target_service"
reload_or_start_caddy

if ! wait_for_public_health; then
    rollback_caddy "$rollback_service"
    exit 1
fi

printf '%s\n' "$target_color" > "$ACTIVE_FILE"

if [ "$active_color" != "none" ]; then
    echo "[deploy] Stopping old api_$active_color"
    compose stop "api_$active_color" || true
    compose rm -f "api_$active_color" || true
fi

if legacy_api_is_running; then
    echo "[deploy] Stopping legacy api service"
    docker compose -p "$COMPOSE_PROJECT_NAME" -f docker-compose.yml stop api || true
fi

echo "[deploy] Pruning old Docker images and build cache"
docker image prune -f --filter "until=168h" || true
docker builder prune -af --filter "until=168h" || true

echo "[deploy] Deployed $IMAGE_REF to $target_service"
