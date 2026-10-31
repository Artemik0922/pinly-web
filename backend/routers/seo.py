# Маршрут поисковой карты: GET /api/seo/urls.

from fastapi import APIRouter, Request

from .. import ratelimit, seo

router = APIRouter()


@router.get("/api/seo/urls")
def seo_urls(request: Request, kind: str = "all", limit: int = seo.MAX_URLS) -> dict:
    """Адреса для sitemap: `/pin/up-…`, `/board/<uuid>`, `/profile/<uuid>`."""
    seo.check_kind(kind)
    ratelimit.rate_limit(request, "seo", limit=seo.RATE_LIMIT, window_s=seo.RATE_WINDOW_S)
    return {"urls": seo.urls(kind, seo.cap_limit(limit))}
