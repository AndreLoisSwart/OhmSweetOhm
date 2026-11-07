from fastapi import APIRouter, FastAPI
from fastapi.routing import APIRoute
from mcp.server.transport_security import TransportSecuritySettings

from app.core import health
from app.core.access import AccessMiddleware
from app.core.config import settings
from app.core.errors import register_error_handlers
from app.core.frontend import mount_frontend
from app.modules.attachments import router as attachments
from app.modules.designs import router as designs
from app.modules.mcp import token
from app.modules.mcp.server import build_server
from app.modules.parts import router as parts
from app.modules.tags import router as tags


def operation_id(route: APIRoute) -> str:
    # The function name, so generated hooks read like useGetHealth.
    return route.name


def create_app() -> FastAPI:
    # MCP at /mcp. Stateless JSON responses: nothing to keep between requests, and
    # plain responses pass through any proxy. Its own Host check is off because it would
    # reject the HA box's LAN address; the token (core/access.py) does that job.
    mcp_server = build_server()
    mcp_app = mcp_server.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )

    app = FastAPI(
        title="Ohm Sweet Ohm",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        generate_unique_id_function=operation_id,
        lifespan=lambda _app: mcp_server.session_manager.run(),
    )

    api = APIRouter(prefix="/api")
    for module in (health, parts, designs, tags, attachments):
        api.include_router(module.router)

    app.include_router(api)
    app.router.routes.extend(mcp_app.routes)
    register_error_handlers(app)
    app.add_middleware(
        AccessMiddleware, trusted_clients=settings.trusted_clients, token_is_valid=token.is_valid
    )
    # Last, so its catch-all route doesn't shadow the API.
    mount_frontend(app, settings.frontend_dist)
    return app
