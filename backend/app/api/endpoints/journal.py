"""
Journal API endpoints - channels, sections, entries
"""
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
import asyncio
import ipaddress
import socket
import uuid
import urllib.parse
from app.core.supabase import supabase
from typing import List, Optional
import re
import httpx
from app.services.journal import journal_service
from app.core.auth import get_current_user_id
from app.core.rate_limit import limiter
from app.core.redis import get_redis
from starlette.requests import Request
from app.schemas.journal import (
    ChannelCreate,
    ChannelUpdate,
    EntryCreate,
    EntryUpdate,
    SectionCreate,
    SectionUpdate,
)

router = APIRouter()


# ============================================
# SECTIONS
# ============================================

@router.get("/sections")
async def get_sections(user_id: str = Depends(get_current_user_id)) -> List[dict]:
    return await journal_service.get_sections(user_id)


@router.post("/sections")
async def create_section(
    data: SectionCreate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    return await journal_service.create_section(data, user_id)


@router.patch("/sections/{section_id}")
async def update_section(
    section_id: str,
    data: SectionUpdate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    result = await journal_service.update_section(section_id, data, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="Sekce nenalezena")
    return result


@router.delete("/sections/{section_id}")
async def delete_section(
    section_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    success = await journal_service.delete_section(section_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Sekce nenalezena")
    return {"success": True}


# ============================================
# CHANNELS
# ============================================

@router.get("/channels")
async def get_channels(user_id: str = Depends(get_current_user_id)) -> List[dict]:
    return await journal_service.get_channels(user_id)


@router.post("/channels")
async def create_channel(
    data: ChannelCreate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    return await journal_service.create_custom_channel(data, user_id)


@router.patch("/channels/{channel_id}")
async def update_channel(
    channel_id: str,
    data: ChannelUpdate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    result = await journal_service.update_channel(channel_id, data, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="Kanál nenalezen")
    return result


@router.delete("/channels/{channel_id}")
async def delete_channel(
    channel_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    success = await journal_service.delete_custom_channel(channel_id, user_id)
    if not success:
        raise HTTPException(status_code=400, detail="Nelze smazat tento kanál")
    return {"success": True}


# ============================================
# ENTRIES
# ============================================

@router.get("/entries")
async def get_entries(
    channel_id: Optional[str] = Query(None),
    ticker: Optional[str] = Query(None),
    cursor: Optional[str] = Query(None, description="ISO timestamp — entries older than this"),
    limit: int = Query(50, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
) -> List[dict]:
    if not channel_id and not ticker:
        raise HTTPException(status_code=400, detail="Požadován channel_id nebo ticker")
    if channel_id and not await journal_service.verify_channel_ownership(channel_id, user_id):
        raise HTTPException(status_code=404, detail="Kanál nenalezen")
    return await journal_service.get_entries(
        channel_id=channel_id,
        ticker=ticker,
        cursor=cursor,
        limit=limit,
        user_id=user_id,
    )


@router.post("/entries")
async def create_entry(
    data: EntryCreate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    if not await journal_service.verify_channel_ownership(data.channel_id, user_id):
        raise HTTPException(status_code=404, detail="Kanál nenalezen")
    redis = get_redis()
    return await journal_service.create_entry(data, redis=redis)


@router.patch("/entries/{entry_id}")
async def update_entry(
    entry_id: str,
    data: EntryUpdate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    if not await journal_service.verify_entry_ownership(entry_id, user_id):
        raise HTTPException(status_code=404, detail="Záznam nenalezen")
    result = await journal_service.update_entry(entry_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Záznam nenalezen")
    return result


@router.delete("/entries/{entry_id}")
async def delete_entry(
    entry_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    if not await journal_service.verify_entry_ownership(entry_id, user_id):
        raise HTTPException(status_code=404, detail="Záznam nenalezen")
    await journal_service.delete_entry(entry_id)
    return {"success": True}


# ============================================
# IMAGE UPLOAD
# ============================================

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}

@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
) -> dict:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Nepodporovaný formát obrázku")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Obrázek je příliš velký (max 10 MB)")
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    path = f"{user_id}/{uuid.uuid4()}.{ext}"
    supabase.storage.from_("journal").upload(path, data, {"content-type": file.content_type})
    public_url = supabase.storage.from_("journal").get_public_url(path)
    return {"url": public_url}


# ============================================
# URL PREVIEW (OG tags)
# ============================================

def _extract_og(html: str, property: str) -> str:
    m = re.search(
        rf'<meta[^>]+(?:property|name)=["\']og:{property}["\'][^>]+content=["\']([^"\']*)["\']',
        html, re.IGNORECASE
    ) or re.search(
        rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']og:{property}["\']',
        html, re.IGNORECASE
    )
    return m.group(1).strip() if m else ""

def _extract_title(html: str) -> str:
    m = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
    return m.group(1).strip() if m else ""

TWITTER_RE = re.compile(r'https?://(?:www\.)?(?:twitter\.com|x\.com)/')

_MAX_PREVIEW_BYTES = 1_000_000
_MAX_PREVIEW_REDIRECTS = 3
_NAT64_NETWORK = ipaddress.ip_network('64:ff9b::/96')


def _embedded_ipv4(ip):
    """IPv4 address hidden inside an IPv6 one (mapped, 6to4, NAT64), or None."""
    if ip.version != 6:
        return None
    if ip.ipv4_mapped:
        return ip.ipv4_mapped
    if ip.sixtofour:
        return ip.sixtofour
    if ip in _NAT64_NETWORK:
        return ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
    return None


def _is_public_ip(ip) -> bool:
    embedded = _embedded_ipv4(ip)
    if embedded is not None and not embedded.is_global:
        return False
    return ip.is_global and not ip.is_multicast


async def _resolve_public_ips(hostname: str) -> list:
    """Resolve hostname once; return its addresses only if every one is public."""
    try:
        infos = await asyncio.to_thread(
            socket.getaddrinfo, hostname, None, type=socket.SOCK_STREAM
        )
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="Neplatná URL adresa")
    ips = []
    for *_, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0].split('%')[0])
        if not _is_public_ip(ip):
            raise HTTPException(status_code=400, detail="Přístup k interním adresám není povolen")
        if ip not in ips:
            ips.append(ip)
    if not ips:
        raise HTTPException(status_code=400, detail="Neplatná URL adresa")
    return ips


def _parse_http_url(url: str) -> urllib.parse.ParseResult:
    """Validate scheme and hostname of a user-supplied URL."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        raise HTTPException(status_code=400, detail="Pouze HTTP/HTTPS URL jsou povoleny")
    if not parsed.hostname:
        raise HTTPException(status_code=400, detail="Neplatná URL adresa")
    return parsed


async def _fetch_preview_html(url: str) -> str:
    """Fetch a page for URL preview, connecting only to validated public IPs.

    The hostname is resolved once and the request goes to that exact address
    (Host header and SNI keep the original name), so a second DNS answer cannot
    redirect the connection. Every redirect target goes through the same path.
    """
    headers = {"User-Agent": "Mozilla/5.0 DeepStock/1.0"}
    async with httpx.AsyncClient(follow_redirects=False, timeout=8) as client:
        for _ in range(_MAX_PREVIEW_REDIRECTS + 1):
            parsed = _parse_http_url(url)
            hostname = parsed.hostname
            ips = await _resolve_public_ips(hostname)
            host_header = f"[{hostname}]" if ":" in hostname else hostname
            if parsed.port:
                host_header += f":{parsed.port}"

            response_location = None
            last_error = None
            for ip in ips:
                ip_host = f"[{ip}]" if ip.version == 6 else str(ip)
                netloc = f"{ip_host}:{parsed.port}" if parsed.port else ip_host
                target = parsed._replace(netloc=netloc).geturl()
                try:
                    async with client.stream(
                        "GET",
                        target,
                        headers={**headers, "Host": host_header},
                        extensions={"sni_hostname": hostname},
                    ) as resp:
                        if resp.is_redirect:
                            response_location = resp.headers.get("location", "")
                            break
                        if resp.status_code != 200:
                            raise HTTPException(status_code=422, detail="Nepodařilo se načíst stránku")
                        chunks, size = [], 0
                        async for chunk in resp.aiter_bytes():
                            chunks.append(chunk)
                            size += len(chunk)
                            if size >= _MAX_PREVIEW_BYTES:
                                break
                        body = b"".join(chunks)[:_MAX_PREVIEW_BYTES]
                        return body.decode(resp.encoding or "utf-8", errors="replace")
                except httpx.RequestError as e:
                    last_error = e
                    continue
            else:
                if last_error is not None:
                    raise HTTPException(status_code=422, detail="Nepodařilo se načíst stránku")

            if not response_location:
                raise HTTPException(status_code=422, detail="Nepodařilo se načíst stránku")
            url = urllib.parse.urljoin(url, response_location)

    raise HTTPException(status_code=422, detail="Nepodařilo se načíst stránku")


@router.get("/url-preview")
@limiter.limit("30/minute")
async def fetch_url_preview(
    request: Request,
    url: str = Query(...),
    user_id: str = Depends(get_current_user_id),
) -> dict:
    # Validate scheme/host here; public-IP resolution happens per request in _fetch_preview_html
    _parse_http_url(url)

    # Twitter/X — use oEmbed API
    if TWITTER_RE.match(url):
        try:
            encoded_url = urllib.parse.quote(url, safe='')
            async with httpx.AsyncClient(follow_redirects=True, timeout=8) as client:
                resp = await client.get(
                    f"https://publish.twitter.com/oembed?url={encoded_url}&omit_script=true"
                )
            if resp.status_code == 200:
                data = resp.json()
                # Strip HTML tags from the embedded html to get plain text
                raw_html = data.get("html", "")
                tweet_text = re.sub(r'<[^>]+>', '', raw_html).strip()
                # Decode common HTML entities
                tweet_text = (tweet_text
                    .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                    .replace("&quot;", '"').replace("&#39;", "'").replace("&mdash;", "—")
                    .replace("&ndash;", "–").replace("&nbsp;", " ")
                )
                return {
                    "title": data.get("author_name", ""),
                    "description": tweet_text,
                    "image": "",
                }
        except httpx.RequestError:
            pass
        raise HTTPException(status_code=422, detail="Nepodařilo se načíst tweet")

    # Generic OG fetch
    html = await _fetch_preview_html(url)

    title = _extract_og(html, "title") or _extract_title(html)
    description = _extract_og(html, "description")
    image = _extract_og(html, "image")

    return {"title": title, "description": description, "image": image}
