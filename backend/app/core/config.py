"""
Central application settings.

Uses pydantic-settings to load config from environment variables and a `.env`
file at the backend root. Any field declared here becomes settable via env var
(case-insensitive). Fields without a default are REQUIRED — the app will fail
to boot if they're missing, which is what we want for secrets/URLs we can't
sensibly guess a default for.
"""

from pydantic import field_validator
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    PROJECT_NAME: str = "Hackathon API"

    # Origins allowed to call the API with credentials (cookies / Authorization).
    # 5173 = Vite dev server default, 4173 = `vite preview`. The production
    # Vercel alias is included explicitly; per-deployment preview URLs (with
    # random hash suffixes) are matched by ALLOWED_ORIGIN_REGEX below.
    # "*" cannot be used here because allow_credentials=True forbids it.
    #
    # Override at deploy time via env var, comma-separated:
    #   ALLOWED_ORIGINS=https://foo.com,https://bar.com
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:4173",
        "http://localhost:5173",
        "http://localhost:8080",
        "https://hackpton2026.vercel.app",
    ]

    # Regex matched against the request Origin header. Vercel mints a unique
    # hostname for every deployment / branch / preview, so a static list can't
    # keep up. This pattern covers:
    #   hackpton2026.vercel.app                              (production alias)
    #   hackpton2026-<hash>-<team>.vercel.app                (deployment URLs)
    #   hackpton2026-git-<branch>-<team>.vercel.app          (branch URLs)
    # Override via env var if you rename the Vercel project.
    ALLOWED_ORIGIN_REGEX: str | None = (
        r"^https://hackpton2026(-[a-z0-9-]+)?\.vercel\.app$"
    )

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _split_allowed_origins(cls, v):
        # pydantic-settings parses List[str] from env vars as JSON by default,
        # which is awkward in deploy UIs. Accept a plain comma-separated string
        # too: ALLOWED_ORIGINS=https://a.com,https://b.com
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

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

    # OpenRouter API key — authenticates the OpenAI SDK pointed at
    # `https://openrouter.ai/api/v1`. All LLM services (evaluator on
    # `deepseek/deepseek-v3.2`; research / opening question / follow-up on
    # `google/gemini-2.5-flash`) share this one key. Optional at app boot
    # so tests (which monkeypatch the client) can import `settings` without
    # a live key; the shared `_openrouter.get_client()` helper raises lazily
    # if the key is missing when a real call is attempted.
    OPENROUTER_API_KEY: str | None = None

    # serper.dev API key — feeds `POST https://google.serper.dev/search` in
    # the company-research service. Optional at boot for the same reason as
    # OPENROUTER_API_KEY: tests monkeypatch the httpx call, no key required.
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
