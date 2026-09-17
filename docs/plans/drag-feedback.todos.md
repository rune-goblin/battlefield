# Drag refusal feedback

Date: 2026-09-18.

- Show the rule reason alongside every rejected movement or melee drag. Give that message priority over the last valid move preview.
- Keep the message after release. Dismiss it with its close button, Escape, a new board interaction or an activation change.
- Keep existing action rules: a charge covers one Speed. The planner can prepend ordinary movement and reserve the chosen attack cost, then execute the sequence in one confirmation and one undo step.
- Verify the reported position: e2 to d6 costs two actions; Fight against the Troll Marauders then offers Strike for the final action. Undo the verification move to restore the battle.
- Offer Attack and Charge as separate icons over the target whenever both routes fit the budget. Neither icon executes an action; the popup requires Confirm attack or Confirm charge.
- Prefer the cheapest route for each action, then preserve the charge bonus and minimize distance. Ordinary movement ends at first contact, and the charge leg engages only its target.
- Keep notifications in an app-local presentation service with stable IDs, message replacement and explicit dismissal. Drag refusals, continuation errors and storage failures share one host; persistent board guidance stays next to the controls it explains.
