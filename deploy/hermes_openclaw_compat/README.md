# Hermes OpenClaw Compatibility

This deploy bundle bridges ClawControl's existing OpenClaw contract onto Hermes Agent.

Pieces:
- `hermes_openclaw_compat.py`: HTTP and WebSocket compatibility service
- `hermes-api-server.service`: user service for Hermes' OpenAI-compatible API server
- `hermes-openclaw-compat.service`: user service for the compatibility layer

Expected VM layout:
- Hermes repo at `~/.hermes/hermes-agent`
- Hermes CLI at `~/.local/bin/hermes`
- Compatibility script at `~/.local/share/clawcontrol-hermes/hermes_openclaw_compat.py`
- Env files:
  - `~/.config/clawcontrol-hermes.env`
  - `~/.config/clawcontrol-hermes-compat.env`
