# Remote Viewer systemd units

These user services back the embedded Remote Viewer:

- `clawcontrol-vnc.service` runs TigerVNC on the OpenClaw VM at `127.0.0.1:5901`.
- `openclaw-vnc-tunnel.service` runs on the ClawControl desktop and forwards local `127.0.0.1:5901` to the VM VNC server.
- `openclaw-agentsecrets-tunnel.service` runs on the ClawControl desktop and forwards local `127.0.0.1:4815` to Agent Secrets on OpenClaw-VM.
- `openclaw-sunshine-tunnel.service` is separate and only forwards Sunshine ports. Keeping VNC separate prevents Sunshine port conflicts from breaking the embedded viewer.

Agent Secrets can also be exposed on the VM Tailscale IP instead of a desktop
tunnel. Keep it private: bind the Docker published port to the Tailscale/LAN
address, set `AGENTSECRETS_URL` to that same private URL in ClawControl, and
do not publish the broker on public HTTP.

Install on the OpenClaw VM:

```bash
mkdir -p ~/.config/systemd/user
cp clawcontrol-vnc.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now clawcontrol-vnc.service
```

Install on the ClawControl desktop:

```bash
mkdir -p ~/.config/systemd/user
cp openclaw-vnc-tunnel.service ~/.config/systemd/user/
cp openclaw-agentsecrets-tunnel.service ~/.config/systemd/user/
cp openclaw-sunshine-tunnel.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now openclaw-vnc-tunnel.service
systemctl --user enable --now openclaw-agentsecrets-tunnel.service
```

Fast repair on the ClawControl desktop:

```bash
systemctl --user restart openclaw-vnc-tunnel.service
systemctl --user restart openclaw-agentsecrets-tunnel.service
```
