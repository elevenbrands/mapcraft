"""
Configuration management using pydantic-settings
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Default storage path: project_root/.storage/sessions
# (config.py lives at backend/app/config.py → 3 parents = project root)
_DEFAULT_STORAGE_PATH = str(
    Path(__file__).parent.parent.parent / ".storage" / "sessions"
)

# Model to provider mapping (prefix-based)
MODEL_PREFIXES = {
    "gpt-": "openai",
    "claude-": "anthropic",
    "gemini/": "gemini",
}

DEFAULT_MODEL = "gemini/gemini-2.5-pro"


def get_provider_for_model(model: str) -> str:
    """Infer provider from model name"""
    for prefix, provider in MODEL_PREFIXES.items():
        if model.startswith(prefix):
            return provider
    raise ValueError(
        f"Unknown model '{model}'. Model must start with one of: {list(MODEL_PREFIXES.keys())}"
    )


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # API Keys (all optional - only need key for selected provider)
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None

    # Model selection - just set the model, provider is inferred
    llm_model: str = DEFAULT_MODEL

    # Stripe payment settings
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    # Public base URL used to build Stripe success/cancel redirect URLs.
    # Set to your deployed domain in production (e.g. https://mapcraft.app).
    # Defaults to localhost for local dev.
    public_url: str = "http://localhost:5173"

    # Storage path for session files.
    # Override with STORAGE_PATH=/data/sessions in Railway (persistent volume).
    storage_path: str = _DEFAULT_STORAGE_PATH

    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False
    )

    def get_provider(self) -> str:
        """Get the provider for the configured model"""
        return get_provider_for_model(self.llm_model)


settings = Settings()
