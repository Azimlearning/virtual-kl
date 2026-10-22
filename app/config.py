from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All tunables live here so nothing is hardcoded in worker code.

    Previously the two prototype scripts hardcoded URLs, intervals, and
    timeouts directly in each worker function. That made it impossible to
    point at a staging feed, tune poll frequency, or run tests without
    editing source. Everything below is overridable via environment
    variables or a .env file (see .env.example).
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://cise:cise@localhost:5432/cise"

    usgs_url: str = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
    gdacs_url: str = "https://www.gdacs.org/contentdata/xml/rss_homepage.xml"
    gdelt_url: str = (
        "https://api.gdeltproject.org/api/v2/doc/doc"
        "?query=(protest%20OR%20riot%20OR%20unrest)&mode=artlist&maxrecords=10&format=json"
    )
    open_meteo_base_url: str = "https://api.open-meteo.com/v1/forecast"

    # ACLED requires free registration (email + API key) - GDELT doesn't.
    # Left optional: if unset, the ACLED worker logs once and skips
    # gracefully rather than failing the whole ingestion cycle.
    acled_api_key: str = ""
    acled_email: str = ""
    acled_url: str = "https://api.acleddata.com/acled/read"

    poll_interval_minutes_fast: int = 5  # USGS, GDACS
    poll_interval_minutes_slow: int = 30  # GDELT, GNews, Open-Meteo, ACLED

    http_timeout_seconds: float = 15.0
    http_max_retries: int = 3

    log_level: str = "INFO"

    # Knowledge layer (Chroma + Neo4j). Defaults assume local Docker: from
    # inside the app container these resolve via service name (see
    # docker-compose.yml env overrides); from your Windows host directly
    # (e.g. running pytest natively) they resolve via the host-mapped ports.
    chroma_host: str = "localhost"
    chroma_port: int = 8001

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "cisegraph123"

    knowledge_sync_interval_minutes: int = 10

    # Intelligence layer (Ollama). host.docker.internal is Docker Desktop's
    # built-in DNS name for reaching services running on the host machine
    # from inside a container - this is how the containerized app reaches
    # Ollama running natively on your Windows laptop (not in Docker).
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"
    intelligence_top_k: int = 5

    # Alerts (Telegram). Both blank = alert delivery is skipped gracefully,
    # same pattern as ACLED. See app/alerts.py for how to get the values.
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    # Lowest alert level that triggers a Telegram message: "Orange" or "Red".
    # Default Red because GDELT events are always Orange - Orange would spam.
    alert_min_level: str = "Red"
    # Safety cap so first start-up (or enabling Telegram later) can't flood
    # the chat with a backlog: at most this many messages per scheduler run.
    alert_max_per_run: int = 5
    # Only hazards newer than this are ever sent.
    alert_max_age_hours: int = 24
    # Optional public frontend URL, used to put an "open in CISE" link in alerts.
    public_app_url: str = ""

    # Email alerts (SMTP). All of host + recipients must be set, else email
    # delivery is skipped gracefully. See app/alerts.py for Gmail setup.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    # "starttls" (port 587, most providers), "ssl" (port 465) or "none".
    smtp_security: str = "starttls"
    # Sender address; defaults to smtp_user when blank.
    smtp_from: str = ""
    # Comma-separated recipient addresses.
    alert_email_to: str = ""

    # News (GNews, https://gnews.io - free key, 100 requests/day, non-commercial
    # use). Blank key = the worker skips gracefully, same as ACLED.
    gnews_api_key: str = ""
    gnews_url: str = "https://gnews.io/api/v4/search"
    gnews_query: str = (
        "earthquake OR flood OR wildfire OR cyclone OR typhoon OR hurricane OR volcano "
        "OR drought OR landslide OR tsunami OR protest OR riot OR coup OR airstrike"
    )


settings = Settings()
