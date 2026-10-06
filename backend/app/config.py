from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    database_url: str = "postgresql+psycopg://ward:ward@localhost:5432/ward"

    mqtt_host: str = "localhost"
    mqtt_port: int = 1883

    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_expire_hours: int = 12

    minio_endpoint: str = "localhost:9000"
    minio_root_user: str = "ward"
    minio_root_password: str = "wardminio123"
    minio_bucket: str = "ward-docs"

    n8n_webhook_url: str = "http://localhost:5678/webhook/ward-events"
    n8n_event_secret: str = "change-me-event"
    n8n_callback_secret: str = "change-me-callback"

    llm_provider: str = "fallback"  # fallback | anthropic | local
    anthropic_api_key: str = ""
    llm_model: str = "claude-opus-5-5"
    llm_local_base_url: str = "http://localhost:11434"
    llm_local_model: str = "qwen2.5:7b-instruct"
    llm_timeout_s: float = 15.0
    laya_enabled: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
