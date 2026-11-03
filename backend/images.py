# Разбор картинок и видео по сигнатуре (магическим байтам), а не по имени файла.
# Имя файла и Content-Type, присланные браузером, ничего не гарантируют:
# без проверки под видом .png можно сохранить HTML или SVG, который затем
# отдаётся с нашего домена.

# Описательный UA для чужих CDN (требование robot policy Wikimedia): маскировка
# под браузер у них даёт 403, честный бот — 200.
FETCHER_USER_AGENT = "Pinly demo image fetcher / contact: pinly@test.local"

JPEG = b"\xff\xd8\xff"
PNG = b"\x89PNG\r\n\x1a\n"
WEBP = b"RIFF"
FTYP = b"ftyp"
QUICKTIME_BRAND = b"qt  "
EBML = b"\x1a\x45\xdf\xa3"


def detect_image_ext(data: bytes) -> str | None:
    """Расширение по сигнатуре: 'jpg' | 'png' | 'webp' | None.

    WebP — это RIFF с маркером WEBP на позиции 8; GIF и SVG не пропускаем:
    первый не нужен продукту, второй исполняется браузером как разметка.
    """
    if data.startswith(JPEG):
        return "jpg"
    if data.startswith(PNG):
        return "png"
    if data.startswith(WEBP) and data[8:12] == b"WEBP":
        return "webp"
    return None


def detect_media_ext(data: bytes) -> str | None:
    """Расширение картинки ИЛИ видео: jpg|png|webp|mp4|webm|mov|None.

    MP4 и MOV — один контейнер ISO BMFF, различаются brand на позиции 8:
    телефонная «.mov» попадёт к нам как mov, и браузер её не покажет, но
    тип по байтам честнее, чем доверять расширению из формы. WebM и Matroska
    делят заголовок EBML: различить их по заголовку невозможно, поэтому берём
    webm — худшее, что случится, это «браузер не поддерживает» на карточке.
    """
    image = detect_image_ext(data)
    if image:
        return image
    if len(data) >= 12 and data[4:8] == FTYP:
        return "mov" if data[8:12] == QUICKTIME_BRAND else "mp4"
    if data.startswith(EBML):
        return "webm"
    return None


def is_video_ext(ext: str) -> bool:
    return ext in ("mp4", "webm", "mov")


# Прокси картинок отдаёт только эти хосты (и их поддомены). Точный матч
# по домену, а не поиск по хвосту: иначе "evil-flickr.com" проходит как
# flickr. Живёт здесь, потому что нужен и app.py (прокси), и pins.py
# (пины с внешним source_url), а images.py ни от кого не зависит.
ALLOWED_IMG_HOSTS = (
    "staticflickr.com",
    "flickr.com",
    "upload.wikimedia.org",
    "commons.wikimedia.org",
    "thumb.wikimedia.org",
    "images.metmuseum.org",
    "openaccess-cdn.clevelandart.org",
    "themealdb.com",
    "www.themealdb.com",
    "i.ibb.co",  # CDN бесплатного хостинга ImgBB
)


def is_allowed_img_host(host: str) -> bool:
    h = (host or "").lower()
    return any(h == allowed or h.endswith("." + allowed) for allowed in ALLOWED_IMG_HOSTS)
