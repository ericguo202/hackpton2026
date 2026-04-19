"""
Central application settings.

Uses pydantic-settings to load config from environment variables and a `.env`
file at the backend root. Any field declared here becomes settable via env var
(case-insensitive). Fields without a default are REQUIRED — the app will fail
to boot if they're missing, which is what we want for secrets/URLs we can't
sensibly guess a default for.
"""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    PROJECT_NAME: str = "Hackathon API"

    # Origins allowed to call the API with credentials (cookies / Authorization).
    # 5173 = Vite dev server default. Add your deployed frontend origin before
    # shipping; "*" will silently break because of credentials mode.
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
        "https://hackpton2026.vercel.app",
    ]

    # Postgres connection parts. We keep them split (rather than a single URL)
    # so docker-compose.yml and local dev can share the same defaults.
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "hpton"

    # Clerk auth config.
    # - CLERK_JWT_ISSUER: the Clerk Frontend API URL (e.g.
    #   "https://your-app.clerk.accounts.dev"). Used to fetch JWKS and enforce
    #   the `iss` claim on incoming tokens. Required — no sensible default.
    # - CLERK_SECRET_KEY: Clerk Backend API key (sk_test_... / sk_live_...).
    #   Not needed for JWT verification; only required if we later call Clerk's
    #   Backend API directly (e.g. to read user metadata server-side).
    CLERK_JWT_ISSUER: str
    CLERK_SECRET_KEY: str | None = None

    # Google AI Studio API key — authenticates `google-generativeai` for the
    # Gemma 4 evaluator call (and later Gemini 2.5 Flash for research +
    # opening-question generation). Optional at app boot so tests (which
    # mock the SDK) can import `settings` without a live key; the evaluator
    # configures the SDK lazily and raises if the key is missing when a
    # real call is actually attempted.
    GEMINI_API_KEY: str | None = None

    # serper.dev API key — feeds `POST https://google.serper.dev/search` in
    # the company-research service. Optional at boot for the same reason as
    # GEMINI_API_KEY: tests monkeypatch the httpx call, no key required.
    SERPER_API_KEY: str | None = None

    # ElevenLabs TTS (T+8-10). `VOICE_ID` picks which voice speaks the
    # question — grab one from the Voice Library (e.g. `JBFqnCBsd6RMkjVDRZzb`
    # for "George"). Both are optional at boot so tests that mock the HTTP
    # call can import `settings` without live credentials; the TTS service
    # raises RuntimeError at call time if either is missing.
    ELEVENLABS_API_KEY: str | None = None
    ELEVENLABS_VOICE_ID: str | None = None

    @property
    def DATABASE_URL(self) -> str:
        """SQLAlchemy async URL composed from the POSTGRES_* parts above."""
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    class Config:
        # Load from backend/.env at import time. Pydantic reads it once here.
        env_file = ".env"
        # Don't crash if .env has extra keys we haven't declared (e.g. keys
        # consumed by other tooling like alembic). "forbid" would be stricter.
        extra = "ignore"


# Import this `settings` singleton anywhere in the app — it's instantiated once
# at module load, so accessing fields is a plain attribute lookup.
settings = Settings()
