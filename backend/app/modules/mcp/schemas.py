from pydantic import BaseModel


class McpToken(BaseModel):
    token: str
