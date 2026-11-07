"""The MCP server: Ohm Sweet Ohm's tools for Claude and other MCP clients.

A stub for now, with no tools: build step 7 (docs/mvp.md) adds the tools from
docs/mcp.md. It is mounted at /mcp already, so the access layer and packaging are
proven from the start.
"""

from mcp.server.mcpserver import MCPServer

INSTRUCTIONS = """\
Ohm Sweet Ohm is the user's electronics workbench: a library of off-the-shelf modules
with their pins, and wiring designs built from them. No tools are available yet.
"""


def build_server() -> MCPServer:
    return MCPServer(name="Ohm Sweet Ohm", instructions=INSTRUCTIONS)
