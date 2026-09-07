# Compact ink terrain fills

Bake source for `public/art/terrain/ink/fill.webp` via `npm run bake:ink`. Eight sheets, 4×4
cells each, cropped from the 128×128 edition of the fill library. Seven use 96×96 cells and
measure 384×384; the ocean sheet uses 160×160 cells for the longer swells and measures 640×640.
Grayscale pencil on pure white, the same pixel scale as the hero sheets in `../ink-sprites/`,
except the four mountain peaks, which were 99–104 px wide and were scaled by 0.88 to 0.93 to
fit their cell. `fill-library.json` records each mark's bounds within its cell.
