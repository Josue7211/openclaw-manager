# Remote Viewer systemd units

These user services back the embedded Remote Viewer:

- `clawcontrol-vnc.service` runs TigerVNC on the OpenClaw VM at `127.0.0.1:5901`.
- `openclaw-sunshine-tunnel.service` runs on the ClawControl desktop and forwards VNC plus Sunshine ports over SSH.

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
cp openclaw-sunshine-tunnel.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now openclaw-sunshine-tunnel.service
```
