#!/usr/bin/env python3
"""Deterministic alpha cleanup for the 64-frame spell VFX atlases. Needs Pillow.

Crushes the faint matte residue (checkerboard remnants, pale halos) left by the
image-gen pipeline, drops neighbor-frame slivers clipped at frame edges, and
rewrites validation.json. Overwrites the PNGs in place; git holds the originals.
"""
import json
import math
import os
import sys

from PIL import Image

DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'art', 'spell-vfx-spritesheets-64f')
SHEETS = ['blast', 'heal', 'control', 'buff-attacks', 'buff-defenses', 'buff-movement']
FRAME = 128
GRID = 8
# Alpha below LO is matte residue, not art; LO..HI tapers with smoothstep so real
# glow edges keep a soft falloff instead of a hard cut.
LO, HI = 16, 56
# A component living entirely inside this strip at the left/right frame edge is a
# clipped fragment of the neighboring frame, not part of this frame's effect.
EDGE_STRIP = 10

CRUSH = bytes(
    0 if a < LO else (round(a * ((lambda t: t * t * (3 - 2 * t))((a - LO) / (HI - LO)))) if a < HI else a)
    for a in range(256)
)


def drop_edge_slivers(alpha: list[int]) -> None:
    seen = [False] * (FRAME * FRAME)
    for start in range(FRAME * FRAME):
        if seen[start] or alpha[start] == 0:
            continue
        stack = [start]
        seen[start] = True
        component: list[int] = []
        min_x, max_x = FRAME, -1
        while stack:
            i = stack.pop()
            component.append(i)
            x, y = i % FRAME, i // FRAME
            min_x, max_x = min(min_x, x), max(max_x, x)
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < FRAME and 0 <= ny < FRAME:
                    j = ny * FRAME + nx
                    if not seen[j] and alpha[j] > 0:
                        seen[j] = True
                        stack.append(j)
        if max_x < EDGE_STRIP or min_x >= FRAME - EDGE_STRIP:
            for i in component:
                alpha[i] = 0


def clean_sheet(name: str) -> dict:
    path = os.path.join(DIR, f'{name}.png')
    image = Image.open(path).convert('RGBA')
    alpha = image.getchannel('A').point(CRUSH)

    stats = {
        'maxAdjacentCentroidDisplacement': 0.0,
        'maxBorderAlpha': 0,
        'minFrameFootprint': [FRAME, FRAME],
        'maxFrameFootprint': [0, 0],
    }
    previous_centroid = None
    for index in range(GRID * GRID):
        row, col = divmod(index, GRID)
        box = (col * FRAME, row * FRAME, (col + 1) * FRAME, (row + 1) * FRAME)
        frame = list(alpha.crop(box).getdata())
        drop_edge_slivers(frame)
        patch = Image.new('L', (FRAME, FRAME))
        patch.putdata(frame)
        alpha.paste(patch, box)

        total = sum(frame)
        xs = [i % FRAME for i, a in enumerate(frame) if a > 0]
        ys = [i // FRAME for i, a in enumerate(frame) if a > 0]
        if xs:
            width, height = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
            stats['minFrameFootprint'] = [min(stats['minFrameFootprint'][0], width), min(stats['minFrameFootprint'][1], height)]
            stats['maxFrameFootprint'] = [max(stats['maxFrameFootprint'][0], width), max(stats['maxFrameFootprint'][1], height)]
        border = [frame[i] for i in range(FRAME)] + [frame[-1 - i] for i in range(FRAME)] \
            + [frame[y * FRAME] for y in range(FRAME)] + [frame[y * FRAME + FRAME - 1] for y in range(FRAME)]
        stats['maxBorderAlpha'] = max(stats['maxBorderAlpha'], max(border))
        if total:
            cx = sum((i % FRAME) * a for i, a in enumerate(frame)) / total
            cy = sum((i // FRAME) * a for i, a in enumerate(frame)) / total
            if previous_centroid:
                displacement = math.hypot(cx - previous_centroid[0], cy - previous_centroid[1])
                stats['maxAdjacentCentroidDisplacement'] = round(max(stats['maxAdjacentCentroidDisplacement'], displacement), 3)
            previous_centroid = (cx, cy)

    image.putalpha(alpha)
    image.save(path, optimize=True)
    return stats


def main() -> None:
    validation = {}
    for name in SHEETS:
        validation[name] = clean_sheet(name)
        print(name, validation[name])
    with open(os.path.join(DIR, 'validation.json'), 'w') as handle:
        json.dump(validation, handle, indent=2)
        handle.write('\n')


if __name__ == '__main__':
    sys.exit(main())
