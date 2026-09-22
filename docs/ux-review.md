# UX review

The main usability problems were disappearing spell trees, repeated rules text, and competing overlays. The revised flow keeps known capabilities visible, explains temporary restrictions on hover or keyboard focus, and presents one decision at a time.

## Flow review

| Stage | Finding | Change |
| --- | --- | --- |
| Setup navigation | Every step repeated its instructional subtitle. Narrow layouts hid the labels. | Only the current step shows its subtitle. Every step keeps an accessible name and a tooltip. |
| Terrain editing | Three rules paragraphs competed with the painting controls. | One instruction remains visible. Terrain rules and shortcuts sit in a disclosure. |
| Army creation and deployment | The attacker should see the defender's formation before deploying. | Fresh troops start in reserve. The defender deploys first; completing that formation opens attacker deployment. Saved deployments resume in place. |
| Pre-battle review | Army readiness and deployment problems explain whether the battle can start. | Retain the readiness summary and explicit problems. |
| Unit selection | A name and hidden stats gave little sense of the army's capabilities. | Keep a compact sheet visible: movement, current AC, health, morale, attack bonuses, ranges, saves, and Perception. Keep tactics and rules in a disclosure. |
| Action selection | The spell ring removed known trees without legal targets. | Keep the trees in their usual positions. Desaturate unavailable trees and explain the restriction. Cast opens the spell book even when every known tree is temporarily unavailable. |
| Activity selection | Dialogs displayed inaccessible tiers and full descriptions for every option. | Omit tiers beyond level or tradition. Keep affordable and temporarily unaffordable tiers visible. Use compact choices, hover/focus explanations, and one selected-effect description. |
| Target selection | Target lists competed with board markers and created nested scrolling. Some lists cut off after 100 entries. | Use the board by default. Offer a collapsible list with three entries per page and access to every candidate. Show the chosen target before confirmation. |
| Confirmation | Keyboard Enter could reach the global confirmation handler while a control had focus. | Let native controls handle Enter. Keep action cost, cancellation, target reset, and explicit confirmation. |
| Small-screen battle layout | Army cards and map controls could cover the action dialog. | Raise open action menus above those overlays. Keep blocking dialogs above action menus. |
| Battle ending | The report covered the final attack's effects and results. | Wait for the board to finish, pause for two seconds, then show the outcome illustration over a dark scrim. Fade the report in over the illustration after the announcement. |
| Aftermath and continuation | Recovery penalties, surrender, withdrawal, and survivor eligibility affect consequential choices. | Retain these explanations at their decision points. |

## Visibility rules

Orders and action dialogs show actions remaining as separate single-action diamonds. Green diamonds become gray as actions are spent; Haste adds a fourth slot. Activity costs retain their combined cost glyphs. Browser checks covered cavalry, archers, casters, spending a movement action, and the compact sheet at 1280 × 720.

- A unit's known action stays visible when range, action budget, or use this activation blocks it.
- A disabled action explains its restriction and accepts no activation.
- Spell tiers beyond the unit's level or tradition stay out of the activity picker.
- A sole legal spell tier or siege attack mode selects automatically. The player still chooses the target and confirms the action.
- Full activity descriptions appear for the selected option; other options expose their descriptions on hover or keyboard focus.
- Target lists remain optional and support keyboard selection.

## Siege targeting

Entering an engine's hex now claims it immediately. The unit's Orders and map badge expose its siege menu during that activation. Ownership changes preserve loading progress and the engine's shot limit. Older saves with a stale owner or abandoned flag expose the same commands and correct targets; the next siege action records the ownership. An empty hex still uses the existing round-end capture rules for adjacent troops.

Round-end capture previously marked an emplacement as fired after the new round had reset its shot. Capture now changes ownership and preserves the engine's loaded state. Both loaded and unloaded engines can change hands. Crew changes also preserve the load. The round resets the shot limit; an unloaded engine still needs loading before it can fire. The status text reports the load and any shot already spent this round.

Clicking a troop or hex selects a unique siege target. When several attack areas overlap that hex, the board shows those complete areas for an explicit choice.

Each Load action now fills one loading pip. Progress persists across turns and captures, so a crew can work toward a reload that takes more actions than one turn provides. Standalone engines and crew tokens show the pips on the map, then show “Ready to fire” when loading completes. An engine that has fired this round keeps that restriction visible. The menu distinguishes insufficient actions from missing targets.

A crew standing on its engine can load and fire while an enemy is adjacent. Contact still blocks hauling. Weapon minimum ranges, valid targets, action costs, and the round's shot limit govern firing. This lets a fixed Kickback Spring defend its occupied hex without requiring its crew to abandon the engine first.

Browser verification covered a Heavy Ballista at zero, one, and two loading actions, including its map pips, completed-load label, and remaining action budget. Tests cover one-, two-, three-, and six-action loads, partial-load capture, and older save counters. The suite passed with 763 tests and one skip; type checks passed with the existing TextureLab warning.

## Verification

The ending announcement follows the players' seats: Victory or Defeat for one player side, each viewer's result when players oppose each other, and the winning side's name for a shared hot-seat game. Draws and dusk have separate labels. Undo cancels the sequence. Opening a finished save goes straight to the report.

The victory and defeat illustrations come from `public/outcome`. The image remains behind the report; the report fades in over 800 ms. The announcement waits for its image to load and falls back to text if the image fails. Reduced motion keeps the reading interval and removes the fades. Draws and dusk retain a neutral dark backdrop. Both illustrations ship in the Foundry build. Browser checks covered victory, defeat, image loading, report opacity, and reduced motion; the 14 ending tests, type checks, and Foundry build passed.

Ending verification passed with 794 tests and one skip. Type checks passed with the existing TextureLab warning. An isolated browser fixture exercised the real board and battle view with queued result popups. Both normal and reduced-motion modes finished the popups, paused for two seconds, played Victory, and opened the report after the animation. Both runs completed without browser errors.

Controller and rendering tests cover an out-of-range Blast, a fully spent spell book, apprentice tier limits, insufficient actions for an unlocked tier, automatic selection of a sole legal option, and siege target confirmation. Engine tests verify that capture leaves an engine ready to attack in the next round. The complete suite passed with 743 tests and one skip. Type checking passed with the existing TextureLab warning.

Browser inspection covered the disabled spell ring, Movement selection, list selection, and confirmation readiness. The inspected spell dialog fit without internal scrolling at desktop size and at 1280 × 720. The smaller viewport also confirmed the corrected overlay order. No spell was committed during this browser inspection.

The popup retains a viewport-height limit and scrolling as a fallback for small screens, large text, and longer recovery choices. Full touch-device and Foundry-session checks remain outside this review.
