# Spell VFX sprite sheets

Six PixiJS-ready 4×4 animation atlases. Each atlas is 512×512 pixels and contains sixteen 128×128 RGBA frames in row-major order.

## Files

- `blast`: fireball ignition, flight, impact, explosion, embers
- `heal`: golden pool, rising green bubbles, healing spiral, fade
- `control`: arcane ring formation, lock, pulse, unwind
- `buff-attacks`: energy-edge birth, slash sweep, peak crossing arcs, sparks
- `buff-defenses`: hex ward assembly, shield fill, impact, fragments
- `buff-movement`: wind birth, acceleration, wing-like peak, trailing fade

Each PNG has a matching PixiJS spritesheet JSON file. The JSON includes a named `animations` entry and centered frame anchors. `manifest.json` defines a single `spell-vfx` asset bundle. See `pixi-usage.ts` for `AnimatedSprite` and `ParticleContainer` examples.

## Recommended use

Use the atlas JSON instead of clipping the PNG manually. PixiJS loads one source image and exposes each frame as a lightweight `Texture` view. Use `AnimatedSprite` for a complete cast effect. Use `ParticleContainer` when many particles need these textures; update each particle's `texture` from its normalized age.

Suggested playback rates:

- Blast: 24 fps, non-looping
- Heal and control: 18–20 fps, non-looping
- Buffs: 20–24 fps; loop frames 6–10 only if a sustained aura is required
