# Adapters

Battlefield is playable on its own. Integrations attach at two seams in `src/engine`, and nothing in the engine imports a DOM or a VTT (`tsconfig.engine.json` compiles it with `lib: ["ES2022"]` and no ambient types).

## Input: `UnitCard`

```ts
{ name, level, role, pace?, fear?, tactics?, wounds?, shaken?, overrides?: Partial<UnitStats> }
```

`deriveStats(card)` fills Strike, Volley, reach, Defence, Will and Perception from the PF2e level tables for the role. An adapter that has real numbers passes them in `overrides`; a fully overridden card is a troop sheet.

| Source | Mapping |
|---|---|
| Pathfinder 2e troop actor | `strike = Battle DC − 10`, `volley = Salvo DC − 10`, reach from the Salvo template distance (≤60 close, ≤120 long, else extreme), `defence = AC`, `will`, `perception`, `pace = Speed ≥ 30 or fly`, `fear` from a frightful presence or fear aura, `wounds` from HP thresholds (¾, ½, ¼), `shaken` from a demoralized counter. |
| Foundry VTT | Same as above through the actor document; post each `LogEntry.check` as a chat card. |
| Reignmaker | An `Army` record's linked actor gives the card; `ledBy` gives the side; the defender's hex gives `terrain`; the hex fortification tier gives `wallsTier`; a `SiegeEngine` with `trainArmyId` becomes a `SiegeEngineCard` in that army's `Deployment.engines` (Trooper's siege vehicles map by name onto `ENGINES`). |

## Output: `BattleState`

After `phase === 'ended'`, each `Unit` carries `wounds`, `shaken`, `status` (`active`, `destroyed`, `left`) and `side`; `winner` and `endedBy` name the result; `walls.remaining` is what stands. An adapter writes back:

- wounds → hit points (`max`, `⌊¾⌋`, `⌊½⌋`, `⌊¼⌋`, `0`);
- shaken → demoralized, keeping the higher value;
- `destroyed` → disband; each `EngineState` with `status: 'captured'` changes owner to the capturing side, `abandoned` ones are lost;
- the loser's surviving units fall back one hex.

## Randomness

Every roll goes through `Rng.d20()`. Pass `seededRng` for replays and tests, `randomRng` for play, or a wrapper around a VTT's dice roller.
