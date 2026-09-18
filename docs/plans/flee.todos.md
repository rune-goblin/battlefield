# Flee through the deployment boundary

- Offer Flee on outer cells in the troop’s deployment ranks, including side boundaries and
  the ambush rank. Off-board drags within 0.6 cell pitches project to the nearest outer edge;
  placement mode keeps its existing on-board drag behavior.
- One confirmation covers the legal movement route and one further action to flee. Normal
  terrain, occupancy, and contact rules govern the approach. A unit already at the boundary
  may flee from contact. Root and Pin prevent the exit until cleared. No free strike occurs
  during the exit, so every resolved flee removes the troop as requested.
- Reuse Will modifiers and Rally DC at the exit. Both success degrees send the troop to camp
  without changing wounds or morale. Both failure degrees route it and mark it as left.
  Already routed troops stay routed. Failed escapes abandon attached engines; successful
  troops bring their attached engines to camp.
- Camp is distinct from an active battlefield unit. Camp troops cannot hold ground, receive
  tactical effects, or reactivate today. They can recover and redeploy on a later day after
  a contested dusk. Reports and campaign outcomes retain them as survivors. A whole force
  escaping to camp concedes the field by withdrawal.
- Verification: 541 tests passed, one skipped. Twelve flee tests cover both morale outcomes,
  boundary eligibility, action costs, camp recovery, next-day deployment, events, and undo.
  Browser checks confirmed the off-board drag, combined cost, confirmation, morale result,
  token removal, and complete undo. Type checks and the production build passed with the
  existing TextureLab warning. The Foundry build completed with existing PopupLayer imports
  missing from the PIXI shim (TextMetrics and TEXT_GRADIENT); Foundry runtime remains unverified.
