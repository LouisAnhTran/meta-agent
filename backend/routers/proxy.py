from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["proxy"])


@router.get("/api/proxy-article")
async def proxy_article(url: str):
    parsed = urlparse(url)
    if not parsed.scheme.startswith("http"):
        raise HTTPException(400, detail="Invalid article URL")

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()

    return HTMLResponse(content=r.text)
