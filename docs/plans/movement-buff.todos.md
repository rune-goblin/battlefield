# Movement buff revision

- Burst of speed grants one hex of movement automatically for the recipient’s next
  activation. A self-cast grants it during the current activation. Ordinary terrain
  costs apply. The bonus adds to the activation’s movement pool, leaves Speed unchanged,
  expires at activation end, and never stacks or replenishes through another cast.
- Sure footing remains the two-action terrain benefit. Translocate remains a three-action
  placement up to four hexes from the recipient, independent of either unit’s Speed.
- Translocate target icons use 75% opacity. Keep the existing faint hex wash so the
  terrain remains visible. Other targeting icons retain their existing opacity.
- Verification: 522 tests pass (one existing skip), type checks report zero errors,
  and the Vite build passes. An existing TextureLab warning remains.
  Verified the revised spell text and translucent Translocate destination icons in
  an isolated browser battle and captured a screenshot. Closed the test tab afterward.
