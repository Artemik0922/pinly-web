# Маршруты прокси картинок: /api/img?u= и /api/img/download.

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse

from .. import imgproxy

router = APIRouter()


@router.get("/api/img")
async def api_img(u: str = Query(...)) -> FileResponse:
    imgproxy.check_url(u)
    file = await imgproxy.fetch_to_cache(u)
    return FileResponse(
        file, media_type=imgproxy.media_type(imgproxy.kind(file)), headers=imgproxy.IMG_HEADERS
    )


@router.get("/api/img/download")
async def api_img_download(u: str = Query(...)) -> FileResponse:
    """Скачать оригинал: тот же кэш, но с Content-Disposition: attachment."""
    imgproxy.check_url(u)
    file = await imgproxy.fetch_to_cache(u)
    kind = imgproxy.kind(file)
    name = f"pinly-{file.stem[:10]}.{kind}"
    return FileResponse(
        file,
        media_type=imgproxy.media_type(kind),
        filename=name,
        headers={**imgproxy.IMG_HEADERS, "Content-Disposition": f'attachment; filename="{name}"'},
    )
