from typing import Callable, TypeVar

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .config import settings

T = TypeVar("T")

# None of the four external APIs (USGS, GDACS, Open-Meteo, GDELT) are under
# our control, and the report itself flags "continued availability and rate
# limits of third-party public APIs" as a limitation. The prototype had a
# bare try/except around each fetch with no retry at all, so a single
# transient timeout silently dropped that poll cycle's data. This wraps
# every external call in exponential-backoff retry instead.

RETRYABLE_EXCEPTIONS = (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError)


def get_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=settings.http_timeout_seconds)


def with_retry(func: Callable[..., T]) -> Callable[..., T]:
    return retry(
        stop=stop_after_attempt(settings.http_max_retries),
        wait=wait_exponential(multiplier=1, min=2, max=20),
        retry=retry_if_exception_type(RETRYABLE_EXCEPTIONS),
        reraise=True,
    )(func)
