# Blast alpha correction

Mode: built-in ImageGen edit, followed by deterministic matte extraction.

```text
Use case: background-extraction
Asset type: production sprite-sheet texture for PixiJS
Input image: the attached 1024×1024 blast sprite sheet is the edit target.
Primary request: Correct only the alpha channel. Remove every black or pale matte, checkerboard remnant, rectangular tile remnant, clipped neighboring-frame fragment, and opaque halo. Preserve the existing fireball animation, exact 1024×1024 canvas, exact 8×8 grid, exact frame positions, frame order, scale, and all sixty-four 128×128 frames.
Transparency: output genuine straight-alpha RGBA. Empty space must have alpha 0. Bright fire cores may be opaque. Orange flame, smoke, sparks, and glow must taper smoothly through partial alpha to zero. Neutral smoke must remain visible without white cutout borders. Prevent dark or light fringes on white and black surfaces.
Constraints: no background, checkerboard, borders, guides, gutters, labels, text, watermark, or scene shadow.
```
