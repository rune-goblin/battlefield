Disorder may be a bit too easy to grant. Inflicting a wound on someone with a bow automatically gives them disorder. I wonder if we should require disorder checks or disorder saves instead of automatically inflicting, particularly as a result of melee or wounds from shooter range.

**Resolved 2026-08-30:** a wound from a shot, a Blast or a free strike now asks the target's
Fortitude (d20 + Fortitude, less its own disorder, vs the attacker's level DC) before it
disorders anyone; only a failure costs the usual 1. Losing a melee exchange stays automatic —
its wounds were never the morale event, the exchange itself was, so there was nothing to gate.
Fear-aura contact, a critically failed reach/push/rally/escape, and half-the-army-gone all stay
automatic too: none of those are wound-driven, and the ask here was specifically about damage.
If a non-wound source ever wants a resistance roll of its own, use Will, not Fortitude — Will is
already what every other morale roll in this system reads off (Rally, reach, push), and keeping
Fortitude to wounds alone is what gives it (section 2's "no rule reads it yet" stat) a distinct
job instead of duplicating Will.

Judgment call folded in along the way: a card with no sheet had no fallback Fortitude at all
(`UnitStats` didn't carry the field) since nothing read it before now. Gave both Infantry and
Cavalry a flat `moderate` fallback — there's no published spread to justify differentiating the
two roles on it yet, unlike Will or Reflex, which do have one (section 2).

**Resolved 2026-08-30:** section 13's "the kingdom's checks" said "the kingdom rolls a Warfare
check" / "a Defense check," lifted from Kingmaker's AP, where Warfare and Defense are kingdom-level
skills. Reignmaker has no such skills (`KingdomSkill` in `pf2e-reignmaker/src/types/events.ts` is
just PC skills); every kingdom action there is a PC rolling one of a handful of listed skills
against the action's DC, the same shape as `recruit-unit` or `outfit-army`. First pass reworded it
to an illustrative skill list (Athletics/Intimidation/Warfare Lore for the winner,
Medicine/Religion/Diplomacy for the loser) keeping the old outcome table (heal + Fame /
survive-at-3 + Unrest). Mark called that dead weight — the old crit/success/fail/critfail numbers
were Kingmaker's, not a designed Reignmaker action, and didn't add anything. Cut to a TODO
placeholder instead: this is a kingdom action to design later, out of the engine's scope
(`BattleState` ends at wounds/disorder/destroyed/captured, same as `docs/adapter-contract.md`
already has it), noting only that it resolves on a PC's own skill check, not a kingdom-rolled
Warfare/Defense skill.