# Compact ink terrain fills

The same 128 fill sprites use 96×96 cells. Artwork pixels, grayscale and pure-white Multiply backgrounds are unchanged except for the four mountain peaks, which were scaled down by 0.88 to 0.93 to fit; every other sprite is a plain crop of the 128×128 edition.

Seven sheets use 96×96 cells in a 4×4 grid: each sheet is 384×384 pixels. The ocean sheet uses 160×160 cells to fit the longer swells, and measures 640×640 pixels.

Use the frame coordinates, cell sizes and mark bounds in sheets/fill-library.json. The sheets are lossless WebP. Keep the sprites' current pixel scale when drawing them; distribute their centers independently of the old 384-pixel terrain grid. Tighter packing alone does not change the map renderer's placement density.
