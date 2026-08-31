# Registered 64-frame spell VFX

Six production atlases for PixiJS. Every atlas is exactly 1024×1024 RGBA and contains an 8×8 row-major grid of sixty-four 128×128 frames.

The sixteen generated key poses were registered around the fixed frame center, normalized to a maximum 112×112 footprint, and converted to sixty-four frames through premultiplied-alpha temporal interpolation. This removes frame-to-frame recentering and makes appearance changes gradual.

Load the matching JSON with `Assets.load`. The named animation contains all sixty-four frames in playback order. At 12 fps, each non-looping effect lasts 5.33 seconds. See `pixi-usage.ts`.

`validation.json` records alpha-border and adjacent-frame centroid checks for every effect.
