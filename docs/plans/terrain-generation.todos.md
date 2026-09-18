# Terrain generation — judgment calls (2026-09-19)

Measured over 300 seeds before the change: a hills board was 87% open ground with 7% of its
hexes raised; mountains 74% open with 7% raised; forest stopped at 33% because every patch
kept a ring of open ground around it.

## Decided

- High ground comes from a scored layout (spine, knolls, flank, massif, pass, dunes). The seed
  picks the layout, and the top-scoring share of the middle ranks rises. Hills raise 26–40% of
  the board, mountains 32–46%, desert 16–28%, forest 0–14%, plains 0–7%.
- Height stays off ranks 1–2 and 10–11, as before.
- Hills crown a summit at height 2 only where every neighbour is raised, so hills carry no
  cliff. Mountains crown 25–40% of their high ground and do make cliffs.
- When cliffs and water together cut the zones apart, every height 2 drops to 1. A river board
  skips this: its crossings stay advisory, as section 10 says.
- Forest, hills, mountains and swamp patches may touch and merge. Plains and desert keep the
  open ring around each patch.
- 70% of woods on a relief board grow on flat ground; 60% of rough patches grow on high ground.
  Swamp and ponds lie at height 0, because a climb into swamp costs 4 and an activation holds 3.
- Every seed draws a new board under this generator. Saved boards keep their squares.

## Open for play

- Forest at 46% average may slow infantry too much; `forestPatches` and `patchSize` in
  `DENSITY` are the dials.
- Level-1 ground blocks sight from the flat, so hills boards now shorten most shots.
- The layout is drawn from the seed. A layout picker on the setup screen would let the GM ask
  for "a pass" directly.
