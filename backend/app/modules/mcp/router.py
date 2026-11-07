from fastapi import APIRouter

from app.modules.mcp import token
from app.modules.mcp.schemas import McpToken

# Under /api, so only reachable through Ingress (see core/access.py).
router = APIRouter(prefix="/mcp", tags=["mcp"])


@router.get("/token")
def get_mcp_token() -> McpToken:
    return McpToken(token=token.get_token())


@router.post("/token")
def regenerate_mcp_token() -> McpToken:
    """Replaces the token; clients using the old one stop working."""
    return McpToken(token=token.regenerate())
