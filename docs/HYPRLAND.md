# Hyprland Configuration

ClawControl works as a scratchpad window in Hyprland.

## Window Rules

Add to `~/.config/hypr/hyprland.conf`:

```conf
# ClawControl scratchpad
windowrulev2 = float, class:^(clawcontrol)$
windowrulev2 = size 75% 85%, class:^(clawcontrol)$
windowrulev2 = center, class:^(clawcontrol)$
windowrulev2 = workspace special:mc silent, class:^(clawcontrol)$

# Toggle with a keybind
bind = $mainMod, M, togglespecialworkspace, mc
```

## Auto-start

Add to Hyprland config:

```conf
exec-once = clawcontrol
```

## Environment Variables

The Tauri app automatically sets:
- `GDK_BACKEND=wayland` when `WAYLAND_DISPLAY` is detected
- `WEBKIT_DISABLE_COMPOSITING_MODE=1` for WebKitGTK compatibility

## Desktop Entry

Install the desktop entry:

```bash
cp src-tauri/assets/clawcontrol.desktop ~/.local/share/applications/
```
