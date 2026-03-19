# Hyprland Configuration

OpenClaw Manager works as a scratchpad window in Hyprland.

## Window Rules

Add to `~/.config/hypr/hyprland.conf`:

```conf
# OpenClaw Manager scratchpad
windowrulev2 = float, class:^(mission-control)$
windowrulev2 = size 75% 85%, class:^(mission-control)$
windowrulev2 = center, class:^(mission-control)$
windowrulev2 = workspace special:mc silent, class:^(mission-control)$

# Toggle with a keybind
bind = $mainMod, M, togglespecialworkspace, mc
```

## Auto-start

Add to Hyprland config:

```conf
exec-once = mission-control
```

## Environment Variables

The Tauri app automatically sets:
- `GDK_BACKEND=wayland` when `WAYLAND_DISPLAY` is detected
- `WEBKIT_DISABLE_COMPOSITING_MODE=1` for WebKitGTK compatibility

## Desktop Entry

Install the desktop entry:

```bash
cp src-tauri/assets/mission-control.desktop ~/.local/share/applications/
```
