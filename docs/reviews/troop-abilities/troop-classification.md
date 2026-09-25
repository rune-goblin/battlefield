# Troop catalogue classification

Design review, 2026-09-24. Classify the existing library now; classify new or mechanically changed abilities during import. Store accepted assignments on the imported card and revalidate automatic matches when mechanics change. A label-only rename keeps its assignment.

This first pass covers **193 selected troops**, **7 source alternatives**, and all **1384 reviewed source features**. It uses the [16-ability catalogue](catalogue.md). ReignMaker is supplementary evidence; these classifications use the complete saved creature inventory.

**These are proposed selections, not enabled runtime effects.** The list favors up to three defining templates per troop and keeps further candidates visible. Priorities are editorial defaults, not a balance score. A missing assignment is an explicit baseline or decision, never an inferred generic bonus.

**Duplicate source features do not grant duplicate uses.** The detail tables preserve several deliveries of one template so a reviewer can select the clearest expression. Before runtime import, choose or explicitly combine those deliveries, bind local attack references, resolve prerequisites, and validate timing and parameters. Classification does not assert that every row is ready to execute.

Source action costs, descriptions, prerequisites, and reaction economy remain in the [classification data](../../../data/troop-abilities/troop-classifications.json). Earlier inventory proposals are historical evidence; the present conversion notes describe the smaller abstraction. Embedded spell lists remain a separate spell-catalogue task.

## Coverage

| Classification | Selected troops |
|---|---:|
| baseline-only | 12 |
| no-assignment-pending-decision | 62 |
| proposed-abilities | 119 |

148 selected troops retain at least one source, catalogue, prerequisite, or reaction decision. These decisions can coexist with useful proposed abilities. All 59 explicit source reactions stay separate; only reactions that fit the seven proposed patterns receive a pattern.

Some catalogue abilities can come from training rather than these particular actors. Siege Crew has no proposed recipient in this saved creature snapshot; its ReignMaker training mappings remain available for future imports. An unassigned template does not require an invented creature match.

## Selected library

| Troop | Proposed abilities | Further candidates | Future reaction patterns | Decisions |
|---|---|---|---|---:|
| [Angelic Chorus](#angelic-chorus) | Combat Bonus | — | — | 2 |
| [Angelic Host](#angelic-host) | Combat Bonus | — | — | 1 |
| [Angry Mercenary Squad](#angry-mercenary-squad) | — | — | — | 0 |
| [Angry Townsfolk](#angry-townsfolk) | Terrain Passage, Combat Bonus | — | — | 0 |
| [Animated Army](#animated-army) | — | — | — | 1 |
| [Apprentice Magician Clique](#apprentice-magician-clique) | Suppression | — | — | 0 |
| [Arboreal Copse](#arboreal-copse) | Guard | — | Retaliate | 1 |
| [Archer Regiment](#archer-regiment) | Guard | — | — | 0 |
| [Archon Bastion](#archon-bastion) | Combat Bonus, Guard | — | — | 2 |
| [Arrester Squadron](#arrester-squadron) | Immobilize | — | — | 2 |
| [Aurochs Herd](#aurochs-herd) | Cavalry Charge, Guard | — | — | 1 |
| [Avalanche Legion](#avalanche-legion) | Cavalry Charge | — | — | 2 |
| [Bandit Gang](#bandit-gang) | Fear, Terrain Passage, Combat Bonus | — | — | 1 |
| [Bandit Irregulars](#bandit-irregulars) | Fear, Terrain Passage, Combat Bonus | — | Retaliate | 1 |
| [Beiran Frosthunt](#beiran-frosthunt) | — | — | — | 0 |
| [Berserkers](#berserkers) | Cavalry Charge, Fear | — | Pursue, Retaliate, Battle Recovery | 2 |
| [Besieged Logging Crew](#besieged-logging-crew) | — | — | — | 0 |
| [Bill-Band](#bill-band) | Resist Fear and Rout / Hold Ground | — | — | 2 |
| [Black Powder Crew](#black-powder-crew) | — | — | — | 3 |
| [Blustering Gale](#blustering-gale) | Push / Pull, Weaken Defence | — | — | 1 |
| [Bog Strider Scouts](#bog-strider-scouts) | Immobilize, Cavalry Charge | — | — | 2 |
| [Boggard Dreadknot](#boggard-dreadknot) | Fear, Terrain Passage | — | — | 1 |
| [Boggard Scouting Party](#boggard-scouting-party) | Fear, Terrain Passage | — | — | 1 |
| [Brastlewark Sapper Squad](#brastlewark-sapper-squad) | — | — | — | 4 |
| [Brimstone Corps](#brimstone-corps) | Cavalry Charge, Resist Fear and Rout / Hold Ground, Guard | — | — | 1 |
| [Bureaucrat Mob](#bureaucrat-mob) | — | — | — | 2 |
| [Centaur Scouts](#centaur-scouts) | Combat Bonus, Resist Fear and Rout / Hold Ground | — | Block | 1 |
| [Charau-ka Shrieker Crew](#charau-ka-shrieker-crew) | Cavalry Charge | — | — | 0 |
| [City Guard Squadron](#city-guard-squadron) | Terrain Passage, Combat Bonus | — | — | 0 |
| [Clanish Warband](#clanish-warband) | Cavalry Charge | — | Pursue | 1 |
| [Clockwork Infantry](#clockwork-infantry) | Guard | — | Retaliate | 1 |
| [Clockwork Runner Pack](#clockwork-runner-pack) | Cavalry Charge | — | — | 1 |
| [Clockwork Shambler Horde](#clockwork-shambler-horde) | — | — | — | 1 |
| [Conscript Squad](#conscript-squad) | — | — | — | 3 |
| [Corn Leshy Throng](#corn-leshy-throng) | — | — | — | 2 |
| [Cultist Troop](#cultist-troop) | — | — | — | 1 |
| [Dancing Night Parade](#dancing-night-parade) | — | — | Retaliate | 2 |
| [Deinonychus Pack](#deinonychus-pack) | Delayed Damage, Combat Bonus | — | — | 1 |
| [Deluded Mob](#deluded-mob) | — | — | — | 2 |
| [Demonic Rabble](#demonic-rabble) | Fear | — | — | 1 |
| [Devastation Cavalry Brigade](#devastation-cavalry-brigade) | Cavalry Charge, Fear, Terrain Passage | — | — | 0 |
| [Dezullon Thicket](#dezullon-thicket) | Regeneration, Immobilize, Combat Bonus | — | — | 3 |
| [Dire Wolves](#dire-wolves) | Combat Bonus | — | — | 4 |
| [Divine Warden Army](#divine-warden-army) | — | — | — | 2 |
| [Dottari Excruciator Division](#dottari-excruciator-division) | Immobilize | — | Retaliate | 1 |
| [Drake Flight](#drake-flight) | — | — | — | 2 |
| [Dread Zombie Leshy Horde](#dread-zombie-leshy-horde) | — | — | — | 1 |
| [Dromaar Company](#dromaar-company) | Cavalry Charge, Weaken Defence | — | — | 0 |
| [Druid Circle](#druid-circle) | Push / Pull | — | — | 0 |
| [Dwarf Battalion](#dwarf-battalion) | Fear, Guard, Resist Fear and Rout / Hold Ground | — | Retaliate, Block | 1 |
| [Dwarf Longshot Squad](#dwarf-longshot-squad) | Immobilize | — | — | 0 |
| [Dwarf Longshot Squad (Guns)](#dwarf-longshot-squad-guns) | — | — | — | 1 |
| [Einherji Host](#einherji-host) | Combat Bonus, Guard, Resist Fear and Rout / Hold Ground | — | — | 2 |
| [Elven Waverider Troop](#elven-waverider-troop) | Cavalry Charge | — | — | 0 |
| [Engineering Corps](#engineering-corps) | — | — | — | 1 |
| [Fangwood Sentinel Corps](#fangwood-sentinel-corps) | — | — | — | 1 |
| [Fast Shambler Troop](#fast-shambler-troop) | — | — | — | 1 |
| [Fey Host](#fey-host) | Fear, Suppression, Heal / Clear Condition | Weaken Defence, Guard | Retaliate | 8 |
| [First-Class Cavalry](#first-class-cavalry) | Cavalry Charge, Resist Fear and Rout / Hold Ground, Guard | — | — | 0 |
| [First-Class Infantry](#first-class-infantry) | Cavalry Charge, Resist Fear and Rout / Hold Ground, Guard | — | — | 0 |
| [First-Class Vordines](#first-class-vordines) | Cavalry Charge, Resist Fear and Rout / Hold Ground, Guard | — | — | 0 |
| [Fleshwarp Amalgam](#fleshwarp-amalgam) | Delayed Damage, Terrain Passage | — | — | 1 |
| [Frog Riders](#frog-riders) | Cavalry Charge, Fear, Combat Bonus | Opening Move, Terrain Passage | — | 1 |
| [Frost Giant Warriors](#frost-giant-warriors) | Terrain Passage | — | Retaliate | 2 |
| [Gale Frenzy](#gale-frenzy) | — | — | — | 4 |
| [Gargoyle Wing](#gargoyle-wing) | — | — | — | 2 |
| [Ghostly Mob](#ghostly-mob) | Fear | — | — | 0 |
| [Giant Ant Army](#giant-ant-army) | Immobilize | — | — | 4 |
| [Giant Mammoth Riders](#giant-mammoth-riders) | — | — | — | 4 |
| [Gnome Cannon Corps](#gnome-cannon-corps) | Push / Pull | — | — | 2 |
| [Goblin Bombardiers](#goblin-bombardiers) | Delayed Damage | — | — | 3 |
| [Goblin Get Gang](#goblin-get-gang) | — | — | — | 2 |
| [Goblin Rabble](#goblin-rabble) | Weaken Defence | — | — | 2 |
| [Goblin Wolf Riders](#goblin-wolf-riders) | Cavalry Charge, Combat Bonus | — | — | 1 |
| [Gold Defender Garrison](#gold-defender-garrison) | — | — | — | 4 |
| [Golden Erinys Novitiate Circle](#golden-erinys-novitiate-circle) | Weaken Defence, Combat Bonus | — | Retaliate | 0 |
| [Gorumite Infantry](#gorumite-infantry) | — | Delayed Damage | — | 1 |
| [Hadi Mob](#hadi-mob) | — | — | — | 1 |
| [Halfling Lucky Draw](#halfling-lucky-draw) | — | — | — | 2 |
| [Hana's Hundreds](#hanas-hundreds) | Cavalry Charge | — | — | 0 |
| [Harvest Regiment](#harvest-regiment) | Guard | — | — | 1 |
| [Heavy Cavalry](#heavy-cavalry) | Cavalry Charge, Weaken Defence | — | — | 0 |
| [Hell Hound Pack](#hell-hound-pack) | — | — | — | 2 |
| [Hellbound Honor Guard](#hellbound-honor-guard) | Fear | Heal / Clear Condition | Retaliate | 2 |
| [Hellknight Cavalry Brigade](#hellknight-cavalry-brigade) | Cavalry Charge, Terrain Passage | — | — | 0 |
| [Hellknight Dragoon Squad](#hellknight-dragoon-squad) | Fear, Resist Fear and Rout / Hold Ground | — | — | 2 |
| [Hellknight Hunter Squad](#hellknight-hunter-squad) | Heal / Clear Condition, Guard | — | Retaliate | 1 |
| [Hellknight Retrieval Unit](#hellknight-retrieval-unit) | Weaken Defence, Immobilize | — | — | 2 |
| [Hellknight Sea Brigade](#hellknight-sea-brigade) | — | — | — | 1 |
| [Hobgoblin Battalion](#hobgoblin-battalion) | Guard | — | Retaliate | 0 |
| [Hobgoblin Veteran Regiment](#hobgoblin-veteran-regiment) | Cavalry Charge, Guard | — | — | 1 |
| [House Thrune Elite Infantry](#house-thrune-elite-infantry) | Cavalry Charge, Resist Fear and Rout / Hold Ground | — | — | 0 |
| [Hryngar Breccia Squad](#hryngar-breccia-squad) | Guard | — | Retaliate, Block | 2 |
| [Infernal Tide](#infernal-tide) | — | — | — | 5 |
| [Iriatykian Outrider Band](#iriatykian-outrider-band) | Cavalry Charge, Combat Bonus | — | — | 2 |
| [Kobold Trap Squad](#kobold-trap-squad) | — | — | — | 2 |
| [Kobold Warriors](#kobold-warriors) | — | — | Hold Nerve | 2 |
| [Last Guard](#last-guard) | Fear, Cavalry Charge | — | — | 1 |
| [Leshy Mob](#leshy-mob) | Terrain Passage | Damage Absorption | — | 2 |
| [Leukodaemon Plague](#leukodaemon-plague) | — | — | — | 4 |
| [Lich Legion](#lich-legion) | Damage Absorption, Fear | — | — | 3 |
| [Line Infantry](#line-infantry) | Resist Fear and Rout / Hold Ground, Guard | — | — | 0 |
| [Lizardfolk Defenders](#lizardfolk-defenders) | Combat Bonus, Terrain Passage | — | Retaliate, Block | 0 |
| [Logging Crew](#logging-crew) | — | — | — | 0 |
| [Mammoth Riders](#mammoth-riders) | — | — | — | 2 |
| [Marcos's Marauders](#marcoss-marauders) | — | — | — | 0 |
| [Mercenary Band](#mercenary-band) | — | — | — | 1 |
| [Mercenary Marauders](#mercenary-marauders) | Cavalry Charge, Suppression, Opening Move | — | — | 0 |
| [Mercenary Raiders](#mercenary-raiders) | Fear, Weaken Defence | — | Retaliate | 1 |
| [Mercenary Squad](#mercenary-squad) | — | — | — | 0 |
| [Mitflit Vermin Cavalry](#mitflit-vermin-cavalry) | Cavalry Charge | — | — | 1 |
| [Monk Cadre](#monk-cadre) | — | — | — | 1 |
| [Naval Crew](#naval-crew) | — | — | — | 2 |
| [Necromancer Troop](#necromancer-troop) | — | — | — | 0 |
| [Nightmarchers](#nightmarchers) | Fear | — | — | 1 |
| [Ofalth Stampede](#ofalth-stampede) | Regeneration | — | — | 4 |
| [Omox Slime Pool](#omox-slime-pool) | Immobilize | — | — | 3 |
| [Oprak Firestorm Battalion](#oprak-firestorm-battalion) | Delayed Damage, Guard | — | — | 1 |
| [Orc Raiding Party](#orc-raiding-party) | Cavalry Charge | — | — | 1 |
| [Orc Skullcrushers](#orc-skullcrushers) | Combat Bonus | — | — | 1 |
| [Ort Mob](#ort-mob) | — | — | — | 1 |
| [Pageant Troupe](#pageant-troupe) | — | — | — | 3 |
| [Peasant Militia](#peasant-militia) | — | — | — | 1 |
| [Pelegox Cube](#pelegox-cube) | — | — | — | 1 |
| [Phalanx Formation](#phalanx-formation) | Guard | — | — | 0 |
| [Pixie Swarm](#pixie-swarm) | — | — | — | 2 |
| [Planar Terra-cotta Squadron](#planar-terra-cotta-squadron) | Guard | — | Retaliate, Block | 1 |
| [Protean Tumult](#protean-tumult) | Regeneration, Cavalry Charge | — | — | 1 |
| [Pure Legion Regiment](#pure-legion-regiment) | — | — | — | 3 |
| [Pure Legion Squad](#pure-legion-squad) | Cavalry Charge, Resist Fear and Rout / Hold Ground, Guard | — | — | 1 |
| [Qadiran Camel Corps](#qadiran-camel-corps) | Terrain Passage | — | — | 2 |
| [Ragtag Archers](#ragtag-archers) | Suppression | — | — | 1 |
| [Raised Cavalry](#raised-cavalry) | Cavalry Charge | — | — | 3 |
| [Rancorous Druids](#rancorous-druids) | — | — | — | 1 |
| [Rancorous Priesthood](#rancorous-priesthood) | — | — | — | 0 |
| [Ratfolk Shank Squad](#ratfolk-shank-squad) | Weaken Defence | — | — | 0 |
| [Redcap Brigade](#redcap-brigade) | Regeneration, Cavalry Charge, Delayed Damage | — | — | 3 |
| [Sacristan Scourge](#sacristan-scourge) | Regeneration, Weaken Defence, Delayed Damage | — | — | 3 |
| [Saltborn Stalkers](#saltborn-stalkers) | — | — | — | 3 |
| [Sapper Squad](#sapper-squad) | — | — | — | 4 |
| [Scamp Avalanche](#scamp-avalanche) | Regeneration | — | — | 1 |
| [Scamp Flood](#scamp-flood) | Regeneration | — | — | 1 |
| [Scamp Inferno](#scamp-inferno) | Regeneration | Delayed Damage | — | 1 |
| [Scamp Shrapnel](#scamp-shrapnel) | Regeneration | — | — | 2 |
| [Scamp Tangle](#scamp-tangle) | Regeneration, Delayed Damage | — | — | 1 |
| [Scamp Whirlwind](#scamp-whirlwind) | Regeneration | Push / Pull | — | 1 |
| [Sedacthy Warband](#sedacthy-warband) | Delayed Damage, Fear | — | — | 0 |
| [Shackles Pirate Crew](#shackles-pirate-crew) | — | — | — | 1 |
| [Shadow Host](#shadow-host) | — | — | — | 5 |
| [Shambler Troop](#shambler-troop) | — | — | — | 2 |
| [Sinswarm](#sinswarm) | — | — | Retaliate | 2 |
| [Skeleton Infantry](#skeleton-infantry) | Cavalry Charge, Weaken Defence, Guard | — | — | 0 |
| [Skeleton Mob](#skeleton-mob) | — | — | — | 1 |
| [Skirmishers](#skirmishers) | Terrain Passage | — | — | 3 |
| [Sootsoldiers](#sootsoldiers) | Immobilize | — | — | 2 |
| [Sootsoldiers (The Radiant Host)](#sootsoldiers-the-radiant-host) | Immobilize | — | — | 2 |
| [Soul Swarm](#soul-swarm) | Fear | — | — | 0 |
| [Special Forces Unit](#special-forces-unit) | — | — | — | 0 |
| [Speiroikos](#speiroikos) | Guard | — | — | 2 |
| [Stumpfield War Chanter Choir](#stumpfield-war-chanter-choir) | — | — | — | 2 |
| [Stumpfield War Saboteurs](#stumpfield-war-saboteurs) | — | — | — | 3 |
| [Sun Warrior Brigade](#sun-warrior-brigade) | — | — | — | 1 |
| [Swashbucklers](#swashbucklers) | Combat Bonus, Weaken Defence | — | — | 1 |
| [Swiftrun Clergy](#swiftrun-clergy) | — | — | — | 0 |
| [Sylirican Phalanx](#sylirican-phalanx) | — | — | — | 2 |
| [Terra-Cotta Garrison](#terra-cotta-garrison) | Guard | — | Retaliate, Block | 0 |
| [Thrune Champion Army](#thrune-champion-army) | — | — | — | 1 |
| [Town Militia](#town-militia) | Terrain Passage, Resist Fear and Rout / Hold Ground, Combat Bonus | — | — | 0 |
| [Troll Marauders](#troll-marauders) | Regeneration, Fear, Combat Bonus | — | — | 4 |
| [Twigjack Bramble](#twigjack-bramble) | Cavalry Charge | — | — | 1 |
| [Twilight Talon Infiltrator Team](#twilight-talon-infiltrator-team) | — | — | — | 3 |
| [Ulat-Kini Kidnappers](#ulat-kini-kidnappers) | — | — | — | 1 |
| [Umok Beastspeaker Circle](#umok-beastspeaker-circle) | — | — | — | 0 |
| [Valkyrie Tempest](#valkyrie-tempest) | — | — | — | 2 |
| [Vanth Guardian Flock](#vanth-guardian-flock) | Fear | — | — | 2 |
| [Velociraptor Pack](#velociraptor-pack) | Cavalry Charge, Fear | — | — | 0 |
| [Veteran War Priests](#veteran-war-priests) | — | — | — | 2 |
| [Vicious Levaloch Squad](#vicious-levaloch-squad) | Immobilize, Combat Bonus, Terrain Passage | — | — | 0 |
| [Viking Guard](#viking-guard) | Guard, Resist Fear and Rout / Hold Ground | — | — | 2 |
| [Vordine Legion](#vordine-legion) | Weaken Defence | — | Retaliate | 1 |
| [Watchmage Squadron](#watchmage-squadron) | — | — | — | 0 |
| [Wight Battalion](#wight-battalion) | — | Damage Absorption | — | 5 |
| [Winter Wolves](#winter-wolves) | Combat Bonus | — | — | 4 |
| [Wolf Pack](#wolf-pack) | Weaken Defence, Combat Bonus | — | — | 0 |
| [Woodland Scouts](#woodland-scouts) | Terrain Passage | — | — | 3 |
| [Wrath Riot](#wrath-riot) | Fear | — | — | 3 |
| [Wyvern Flight](#wyvern-flight) | Delayed Damage, Combat Bonus | — | Retaliate | 4 |
| [Xulgath Army](#xulgath-army) | Delayed Damage | — | — | 1 |
| [Xulgath Dinosaur Cavalry](#xulgath-dinosaur-cavalry) | Cavalry Charge | — | — | 1 |
| [Xulgath Ravening](#xulgath-ravening) | — | — | — | 3 |
| [Zecui Horde](#zecui-horde) | Immobilize | — | — | 2 |
| [Zombie Leshy Horde](#zombie-leshy-horde) | — | — | — | 1 |
| [Zombie Shamblers](#zombie-shamblers) | — | — | — | 2 |

## Import policy

1. Ship reviewed built-in examples with the library so existing troops have a visible, consistent starting classification.
2. On import, read an explicit portable assignment first. Otherwise recognize supported mechanical patterns from the current ability content; source names and IDs only narrow candidates.
3. Save the selected template, parameters, local attack attachment, flavor label, source evidence, and explicit omissions. Persist manual overrides separately from automatic classifications.
4. Reuse an accepted classification when the mechanical signature and template version still agree. A mechanical edit triggers revalidation; a creature or ability rename does not remove it.
5. Show unknown mechanics as a review choice: select a template, intentionally omit the detail, or defer it. Battle resolution consumes validated assignments and never interprets source prose.

The [classification policy](../../../data/troop-abilities/classification-policy.json) operates on human audit families in the saved review. It is a reproducible editorial tool, not the production importer or a prose classifier. Its family labels do not yet exist on newly imported actors.

## Source alternatives

| Source alternative | Proposed abilities | Further candidates |
|---|---|---|
| Dwarf Battalion | Fear, Resist Fear and Rout / Hold Ground | — |
| Heavy Cavalry | Cavalry Charge, Weaken Defence | — |
| Line Infantry | Resist Fear and Rout / Hold Ground, Guard | — |
| Rancorous Priesthood | — | — |
| Skeleton Infantry | Cavalry Charge, Weaken Defence, Guard | — |
| Skeleton Mob | — | — |
| Wolf Pack | Weaken Defence, Combat Bonus | — |

## Per-troop decisions

### Angelic Chorus

[Original inventory](inventory.md#angelic-chorus). Level 12. Proposed: **Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Harmonizing Aura (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve the ally/enemy distinction for sonic potency and auditory/sonic protection. Proposed scale: +1 to allies and -1 to enemies on relevant checks/defences; apply only while in range. |
| Admonishing Hymn (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Volley deafens on a critical hit. Add an auditory-reception condition through the target’s next activation; prevent auditory support and auditory attacks from treating it as a hearing target. This needs an auditory effect predicate. |
| Harmonized Spellcasting (passive) | Combat Bonus; candidate | Combat Bonus: +1 on a sonic spell attack check. Preserve the sonic spell predicate; omit original spell DC or damage scaling. |

Intentional omissions: +1 Status to All Saves vs. Magic.

### Angelic Host

[Original inventory](inventory.md#angelic-host). Level 20. Proposed: **Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Aura of Righteousness (passive) | Combat Bonus; candidate | Adjacent allies gain Combat Bonus: +1 Defence against unholy enemies. Omit the source save bonus and larger radius; retain the unholy predicate. |
| Troop Spellcasting (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Angelic Host’s Troop Spellcasting strengthens healing rather than widening areas. Proposed conversion: on a successful healing Cast, restore 1 extra Health within the recipient ceiling, once per activation. Keep this same-name variant distinct. |

Intentional omissions: Constant Spells.

### Angry Mercenary Squad

[Original inventory](inventory.md#angry-mercenary-squad). Level 4. Proposed: **—**.

Its ordinary profile or intentionally omitted details supply the first-pass classification; no extra ability is proposed.

### Angry Townsfolk

[Original inventory](inventory.md#angry-townsfolk). Level 5. Proposed: **Terrain Passage, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Seek Quarry (passive) | Combat Bonus; candidate | Combat Bonus: +1 melee against one quarry marked before battle. This deliberately replaces tracking Perception with a battlefield hunting specialty. |
| Urban Chasers (passive) | Terrain Passage; candidate | Terrain Passage: urban ground. Preserve walls and blocked edges. |

### Animated Army

[Original inventory](inventory.md#animated-army). Level 8. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Construct Armor (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Prevent 1 physical Health loss per round while armour is intact. A critical hit or crossing half source HP breaks the armour permanently for this battle and applies the source lower AC. Add armour state; keep the break trigger before future reductions. |

### Apprentice Magician Clique

[Original inventory](inventory.md#apprentice-magician-clique). Level 5. Proposed: **Suppression**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Clique Spellcasting (passive) | Suppression; candidate | On a critical result from the source spell attack, apply Suppression. Deliberately broaden casting impairment to the shared game penalty; this does not affect ordinary weapon attacks. |

### Arboreal Copse

[Original inventory](inventory.md#arboreal-copse). Level 9. Proposed: **Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Reactive Attack (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Raise Shields (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |
| Shoving Shield Wall (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to Move through eligible enemies; a failed Fortitude save damages and carries the target along on shields. Requires carried-target paths and final legal placement; no separate follow-up attack. |

### Archer Regiment

[Original inventory](inventory.md#archer-regiment). Level 12. Proposed: **Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Dagger Defense (action) | Guard; candidate | Using this melee attack grants self Guard until next activation, even on a miss. Omit the original +1 AC value and merge with other Guard benefits. |
| Drilled in Formations (action) | Guard; candidate | Choose Guard as the formation specialty. Omit switching among movement, wedge, and loose formations. Merge it with any existing Guard assignment. |

### Archon Bastion

[Original inventory](inventory.md#archon-bastion). Level 16. Proposed: **Combat Bonus, Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Archon's Aegis (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** When an adjacent ally takes enemy damage and that enemy is also adjacent, spend a reaction to prevent 1 Health loss and make a retaliation check against that enemy for at most 1 damage. Resolve protection before injury; preserve Living Shields redirection. |
| Fearless Switch (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to Move and relocate willing adjacent allies into distinct legal adjacent hexes, retaining the source target cap. Treat the relocation as teleportation; keep the initial Move subject to ordinary contact rules. |
| Living Shields (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |
| Smiting Lances (action) | Combat Bonus; candidate | Combat Bonus: +1 on the named attack against the source giant, unholy, or undead predicate respectively. Preserve the actual target trait; omit bonus damage components. |

Intentional omissions: +1 Status to All Saves vs. Magic.

### Arrester Squadron

[Original inventory](inventory.md#arrester-squadron). Level 8. Proposed: **Immobilize**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Coordinated Step (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action to make the two source Steps, abstracted as one safe hex of movement. Leave contact through the safe-movement policy without triggering opportunity attacks. |
| Seize Them! (action) | Immobilize; candidate | Apply Immobilize on a critical hit by the linked melee attack. Collapse source hit/investment gates, paid or free follow-up checks, and restraint grades into this one rider. Omit carrying and use the one-action release. |
| Sweep the Area (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Use a named Seek activity and point out discovered targets to allies. Preserve the source area and target cap; requires hidden-state targeting. |

### Aurochs Herd

[Original inventory](inventory.md#aurochs-herd). Level 7. Proposed: **Cavalry Charge, Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Stampede (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** On crossing a source HP threshold, spend a reaction to Trample away from the threat. Preserve the direction, better source DC, and prone-target rider; use a legal route and cap per-target damage. |
| Circle of Horns (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |
| Puncturing Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |
| Trample (action) | Cavalry Charge; candidate | Use Cavalry Charge against one target. Keep source limited uses; omit shared-space routes, damage to additional units, and separate knockdown/push riders. |

### Avalanche Legion

[Original inventory](inventory.md#avalanche-legion). Level 11. Proposed: **Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Earthbound (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Reduce available actions by 1 while the source ground/mount requirement is absent. Keep this independent of movement speed and expose the prerequisite in activity availability. |
| Earth Glide (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Grant the source burrow rate through earth and rock without leaving a tunnel. Requires an underground movement mode, surface transition, and terrain material; never bypass arbitrary walls by name alone. |
| Trample into the Earth (action) | Cavalry Charge; candidate | Use Cavalry Charge against one target. Keep source limited uses; omit shared-space routes, damage to additional units, and separate knockdown/push riders. |

Intentional omissions: Tremorsense (Imprecise) 60 feet.

### Bandit Gang

[Original inventory](inventory.md#bandit-gang). Level 7. Proposed: **Fear, Terrain Passage, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Lie in Wait (passive) | Combat Bonus; candidate | Combat Bonus: +1 initiative after the source pre-battle preparation. Preparation is an explicit prerequisite; omit skill substitution. |
| Sudden Ambush (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** If initiative used Stealth or Deception, allow Stand and Deliver as a free opening effect. Apply its target cap/immunity and do not spend a reaction. |
| Forest Passage (passive) | Terrain Passage; candidate | Terrain Passage: woods. Omit greater-terrain upgrades and preserve barriers. |
| Stand and Deliver! (action) | Fear; candidate | Grant the paid Fear activity. Preserve visibility and recipient eligibility; omit source target counts and graded fear. War Shriek loses its additional hold; wordless delivery retains its language exemption. |

### Bandit Irregulars

[Original inventory](inventory.md#bandit-irregulars). Level 7. Proposed: **Fear, Terrain Passage, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Dirty Fighting (passive) | Fear; candidate | Apply Fear on a successful hit by the named melee or ranged attack. Omit graded frightened values; keep any sonic/hearing prerequisite. |
| Forest Passage (passive) | Terrain Passage; candidate | Terrain Passage: woods. Omit greater-terrain upgrades and preserve barriers. |
| Lie in Wait (passive) | Combat Bonus; candidate | Combat Bonus: +1 initiative after the source pre-battle preparation. Preparation is an explicit prerequisite; omit skill substitution. |
| Reactive Attack (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Stand and Deliver! (action) | Fear; candidate | Grant the paid Fear activity. Preserve visibility and recipient eligibility; omit source target counts and graded fear. War Shriek loses its additional hold; wordless delivery retains its language exemption. |
| Sudden Ambush (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** If initiative used Stealth or Deception, allow Stand and Deliver as a free opening effect. Apply its target cap/immunity and do not spend a reaction. |
| Unpredictable Movement (passive) | Combat Bonus; candidate | Combat Bonus: +1 Defence against ranged attacks. Omit the extra save bonus. |

### Beiran Frosthunt

[Original inventory](inventory.md#beiran-frosthunt). Level 3. Proposed: **—**.

Its ordinary profile or intentionally omitted details supply the first-pass classification; no extra ability is proposed.

Intentional omissions: Unseasonable Cold.

### Berserkers

[Original inventory](inventory.md#berserkers). Level 12. Proposed: **Cavalry Charge, Fear**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Closing Volley (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a 3-action combined Volley, double Move, and follow-up Attack with a hit-dependent advantage. This is an explicit exception to one attack per activation; defer until compound attack budgeting exists. |
| Demoralize (action) | Fear; candidate | Grant the paid Fear activity. Preserve visibility and recipient eligibility; omit source target counts and graded fear. War Shriek loses its additional hold; wordless delivery retains its language exemption. |
| Furious Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |
| No Escape (reaction) | Pursue; future-reaction | Future Pursue after a departing engaged enemy. Preserve legal movement modes. |
| Reactive Attack (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Revel in Battle (reaction) | Battle Recovery; future-reaction | Future Battle Recovery after the source critical melee result; use the common Heal allowance. |
| Vengeful Rage (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** At the source 100-HP threshold, spend a reaction if neither fatigued nor raging: gain its attack benefit and -2 Defence for one minute, then fatigue. Preserve the threshold ratio and status prerequisites rather than triggering on every wound. |

### Besieged Logging Crew

[Original inventory](inventory.md#besieged-logging-crew). Level 4. Proposed: **—**.

Its ordinary profile or intentionally omitted details supply the first-pass classification; no extra ability is proposed.

### Bill-Band

[Original inventory](inventory.md#bill-band). Level 5. Proposed: **Resist Fear and Rout / Hold Ground**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| +3 Status vs. Intimidation Checks (passive) | Resist Fear and Rout / Hold Ground; candidate | Resolve in fear-resistance mode. Replace this positive fear/Intimidation-only source bonus with the common +2 and deduplicate prepared statistics. |
| Down to Our Level (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Offer the source paid maneuver against a target’s Fortitude or Reflex defence: shove/reposition moves one legal hex, trip exposes, grapple holds, and disarm weakens weapons. Keep each source prerequisite and eligible choice; Bash It Down also targets structures. |
| Firecracker Salvo (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Firecracker Volley dazzles on a hit through the next activation. Proposed abstraction gives -2 to the victim’s next sight-based attack; add a one-use modifier rather than full suppression. |

Intentional omissions: Keen Eyes; Overwhelming Scrum.

### Black Powder Crew

[Original inventory](inventory.md#black-powder-crew). Level 8. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Pistol Salvo (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Once per battle, use the 2-action Pistol Salvo. Keep the weaker of piercing/bludgeoning defences and enhanced critical damage as profile metadata; cap the initial conversion at the normal 2-Health critical result. |
| Repel Boarders! (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action for a directional shove against eligible adjacent enemies; move one legal hex and optionally follow if at least one target moves. This follow movement avoids reactions as the source states. |
| Rock the Boat (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a separate ship activity. Boarding Grapple draws vessels together and anchors them; Rock the Boat moves and trips all other occupants. Requires vessel identities, movement, occupancy, and ship-only prerequisites. |

Intentional omissions: Sea Legs.

### Blustering Gale

[Original inventory](inventory.md#blustering-gale). Level 11. Proposed: **Push / Pull, Weaken Defence**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Bullying Bluster (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Use the source aura and Will save to impair concentration/casting while affected. Keep immunity and language requirements from the source. This needs a casting-impairment status rather than permanent Morale loss. |
| Windstorm (action) | Push / Pull + Weaken Defence; candidate | Push one legal hex away on a hit and Weaken Defence on a critical hit. This narrows the source choice of displacement direction. |

### Bog Strider Scouts

[Original inventory](inventory.md#bog-strider-scouts). Level 10. Proposed: **Immobilize, Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Hurl Net (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Hurl Net comes from an individual bog strider, while Hurl Nets already defines the troop’s replacement Salvo. Keep the individual attack as evidence and bind the troop-scale mode to Hurl Nets; avoid granting both automatically. |
| Hurl Nets (passive) | Immobilize; candidate | Grant a two-action non-damaging Volley replacement; a successful game attack check applies Immobilize. Replace source movement/action penalties with root and a one-action release. Omit disease exposure. |
| Water Sprint (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |
| Water Stride (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Allow surface movement on water using land movement and optional swimming below it. Preserve mode choice; it is not flight over walls or other terrain. |

Intentional omissions: Darkvision; Deep Breath; Wavesense 120 feet.

### Boggard Dreadknot

[Original inventory](inventory.md#boggard-dreadknot). Level 10. Proposed: **Fear, Terrain Passage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Chorus of Croaks (action) | Fear; candidate | Grant the paid Fear activity. Preserve visibility and recipient eligibility; omit source target counts and graded fear. War Shriek loses its additional hold; wordless delivery retains its language exemption. |
| Swamp Passage (passive) | Terrain Passage; candidate | Terrain Passage: water and swamp. Retain actual imported movement modes; omit associated skill/attack bonuses. This grants no swim or water-walking mode. |
| Tongue Lashing (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to tether nearby targets on failed Reflex saves. They can move inside the tongue’s radius; Escape or severing ends the tether. Do not model this as immobilization. |

Intentional omissions: Mounted Troop.

### Boggard Scouting Party

[Original inventory](inventory.md#boggard-scouting-party). Level 6. Proposed: **Fear, Terrain Passage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Chorus of Croaks (action) | Fear; candidate | Grant the paid Fear activity. Preserve visibility and recipient eligibility; omit source target counts and graded fear. War Shriek loses its additional hold; wordless delivery retains its language exemption. |
| Coordinated Tongue Pull (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action; a failed Reflex save pulls the target one legal hex toward the troop and tethers it. It can still move inside the tether radius. Requires tether/escape state; do not use rooted as an equivalent. |
| Swamp Passage (passive) | Terrain Passage; candidate | Terrain Passage: water and swamp. Retain actual imported movement modes; omit associated skill/attack bonuses. This grants no swim or water-walking mode. |

### Brastlewark Sapper Squad

[Original inventory](inventory.md#brastlewark-sapper-squad). Level 4. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Demolition Expertise (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Against structures only, ignore one step of structural damage reduction as the proposed abstraction of 5 Hardness. Apply through the siege/wall damage path; never add it against troop Defence. |
| Excavation (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** While burrowing, create a temporary passage allies can use. Preserve the Sapper Squad full-speed versus Brastlewark half-speed distinction. Requires tunnel topology and collapse timing. |
| Fire in the Hole! (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Volley deafens on a critical hit. Add an auditory-reception condition through the target’s next activation; prevent auditory support and auditory attacks from treating it as a hearing target. This needs an auditory effect predicate. |
| Undermine (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** While underground, spend 3 actions to damage the surface area above, expose critical-failure targets, and create temporary difficult terrain. Requires burrowing and surface hazards; ordinary Volley has no underground prerequisite. |

### Brimstone Corps

[Original inventory](inventory.md#brimstone-corps). Level 13. Proposed: **Cavalry Charge, Resist Fear and Rout / Hold Ground, Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Hell's Call (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Skip morale checks from crossing source HP thresholds; at the source low-HP threshold, grant +2 to attack checks. Do not exempt unrelated fear, repulse, or morale events. |
| No Retreat (passive) | Resist Fear and Rout / Hold Ground; candidate | Use Hold Ground. Omit compelled-fleeing-to-slowed conversion; this never grants pursuit. |
| Drilled in Formations (action) | Guard; candidate | Choose Guard as the formation specialty. Omit switching among movement, wedge, and loose formations. Merge it with any existing Guard assignment. |
| First-class Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |

### Bureaucrat Mob

[Original inventory](inventory.md#bureaucrat-mob). Level 4. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Aura of Argumentation (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Use the source aura and Will save to impair concentration/casting while affected. Keep immunity and language requirements from the source. This needs a casting-impairment status rather than permanent Morale loss. |
| Orate (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep Orate as a 1-action nearby sonic area against hearing creatures, using Fortitude. It is an emanation-like attack, not a remote burst; requires an auditory target predicate. |

### Centaur Scouts

[Original inventory](inventory.md#centaur-scouts). Level 8. Proposed: **Combat Bonus, Resist Fear and Rout / Hold Ground**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Aggressive Mounts (passive) | Combat Bonus; candidate | Combat Bonus: +1 melee against unmounted troops. Omit individual-size predicates, level scaling, and minor source defensive drawbacks explicitly. |
| Brave (passive) | Resist Fear and Rout / Hold Ground; candidate | Use Resist Fear and Rout. Replace source graded fear recovery, threshold-based save upgrades, and extra bonuses with the common conditional +2. |
| Shield Block (reaction) | Block; future-reaction | Future Block against physical damage while the source shield/protection prerequisite holds. Omit Hardness and shield damage. |
| Trample (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Trample refers to an individual hoof/foot Strike absent from the troop’s actions. Preserve the route, source DC, and member-size limits; bind a troop damage profile explicitly before enabling it. |

Intentional omissions: Darkvision; Foragers.

### Charau-ka Shrieker Crew

[Original inventory](inventory.md#charau-ka-shrieker-crew). Level 8. Proposed: **Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Shrieking Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |

### City Guard Squadron

[Original inventory](inventory.md#city-guard-squadron). Level 5. Proposed: **Terrain Passage, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Seek Quarry (passive) | Combat Bonus; candidate | Combat Bonus: +1 melee against one quarry marked before battle. This deliberately replaces tracking Perception with a battlefield hunting specialty. |
| City Passage (passive) | Terrain Passage; candidate | Terrain Passage: urban ground. Preserve walls and blocked edges. |

### Clanish Warband

[Original inventory](inventory.md#clanish-warband). Level 10. Proposed: **Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Break Through (action) | Cavalry Charge; candidate | Use Cavalry Charge against one target. Keep source limited uses; omit shared-space routes, damage to additional units, and separate knockdown/push riders. |
| Ferocious Fall (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** Immediately before source segment loss, spend a reaction to retaliate against adjacent enemies for at most 1 damage each. Preserve the pre-loss timing and one shared reaction budget. |
| No Escape (reaction) | Pursue; future-reaction | Future Pursue after a departing engaged enemy. Preserve legal movement modes. |

Intentional omissions: Foragers; Toughened Soldiers.

### Clockwork Infantry

[Original inventory](inventory.md#clockwork-infantry). Level 11. Proposed: **Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Wind-Up (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve winding duration, standby, Disable Device DC, and the reaction to exit standby on noticing a creature. Needs an operational-time resource and readiness state; this embedded reaction belongs in the later reaction activity. |
| Reactive Sweep (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Raise Defenses (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |

Embedded reaction text requires separate inspection: Wind-Up. A mention of reactions alone grants nothing.

### Clockwork Runner Pack

[Original inventory](inventory.md#clockwork-runner-pack). Level 5. Proposed: **Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Wind-Up (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve winding duration, standby, Disable Device DC, and the reaction to exit standby on noticing a creature. Needs an operational-time resource and readiness state; this embedded reaction belongs in the later reaction activity. |
| War Pounce (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |

Embedded reaction text requires separate inspection: Wind-Up. A mention of reactions alone grants nothing.

### Clockwork Shambler Horde

[Original inventory](inventory.md#clockwork-shambler-horde). Level 9. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Slow (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Start each activation with 2 actions and disable reactions. Apply independently of movement speed. Preserve the drawback even for the source named Fast Shambler Troop. |

Intentional omissions: Grave Tide.

### Conscript Squad

[Original inventory](inventory.md#conscript-squad). Level 3. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| –2 Circumstance to All Saves vs. Fear (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Apply the source -2 only to fear saves. Keep ordinary damage morale saves separate. |
| Untrained Rabble (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** At activation start, roll Will against DC 10; failure compels confused behavior for that activation. Requires a clear confusion activity-selection policy, friendly-fire preview, and deterministic random choices. |
| Indiscriminate Assault (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Indiscriminate Assault affects adjacent friends and foes. Show all recipients before commitment and resolve each once; do not silently make it enemy-only. |

### Corn Leshy Throng

[Original inventory](inventory.md#corn-leshy-throng). Level 4. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Encircling Maze (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Allow passage through the corn formation, with a Survival gate that increases terrain cost on failure. Needs shared occupancy and hidden/sight rules; cap checks to once per mover per round. |
| Verdant Burst (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On death, restore 1 Health to nearby plant creatures within their recovery ceilings and grow difficult terrain in the source area. Resolve once; preserve the plant-only healing predicate. |

### Cultist Troop

[Original inventory](inventory.md#cultist-troop). Level 5. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Wild Swing (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Wild Swing also damages the Cultist Troop. Proposed compression: its 3-action mode costs 1 self Health; retain the lower-mode self-damage in source data for a fractional-damage balance decision. Keep this separate from other Wild Swing variants. |

### Dancing Night Parade

[Original inventory](inventory.md#dancing-night-parade). Level 19. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Riotous Parade (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** First exposure applies the source Will save and battle-long immunity. While in the aura, affected creatures lose reactions and must pass a flat check for concentration; failed saves also remove one action. Keep the source success/failure distinctions. |
| Attack of Opportunity (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Wasshoi! Wasshoi! (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Wasshoi affects adjacent creatures including allies; a hit moves the victim one legal hex in a chosen direction. Preserve friendly-fire and avoid automatic attacker follow. |

### Deinonychus Pack

[Original inventory](inventory.md#deinonychus-pack). Level 7. Proposed: **Delayed Damage, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Jaws and Claws (action) | Delayed Damage; candidate | Apply Delayed Damage on the source hit or critical-hit result, attached only to the named attack. Preserve its damage tag. Use one pending damage event and omit damage dice and multi-target scaling. |
| Predator's Advantage (passive) | Combat Bonus; candidate | Combat Bonus: +1 melee against a target with pending bleed-tagged Delayed Damage. Preserve the bleed cause; other persistent tags do not qualify. |
| Surround Prey (action) | Delayed Damage; candidate-with-decision | Apply bleed-tagged Delayed Damage only when the source attack investment or surrounding requirement holds. Retain that gate and resolve it against game activities before enabling. **Decision:** Resolve the attack-investment or surrounding requirement against the chosen game activity. |

### Deluded Mob

[Original inventory](inventory.md#deluded-mob). Level 4. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Victim Complex (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** At the source 50/25-HP thresholds, grant +2/+4 Will respectively. Store threshold ratios or source segment state; do not add both bonuses together. |
| Surrounded (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** When flanked, set the named attacks to their source DC 17 and retain their extra damage profile. Proposed compression trades -1 attack for stronger committed damage; preserve it as a drawback/benefit pair. |

Intentional omissions: Irrational.

### Demonic Rabble

[Original inventory](inventory.md#demonic-rabble). Level 13. Proposed: **Fear**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Frightful Presence (passive) | Fear; candidate | Use adjacent hostile Fear. Preserve fear immunity and source eligibility; omit larger radii, graded fear, reaction locks, and action loss. |
| Serenity Vulnerability (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** When this troop fails a qualifying mass control effect, apply 1 extra mental damage once for that event. Preserve the source minimum four-creature reach and exact eligible conditions. |

Intentional omissions: Telepathy 100 feet; +1 Status to All Saves vs. Magic; Demonic Tide.

### Devastation Cavalry Brigade

[Original inventory](inventory.md#devastation-cavalry-brigade). Level 6. Proposed: **Cavalry Charge, Fear, Terrain Passage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Crushing Despair (passive) | Fear; candidate | Use adjacent hostile Fear. Preserve fear immunity and source eligibility; omit larger radii, graded fear, reaction locks, and action loss. |
| Astride a Red Horse (passive) | Terrain Passage; candidate | Terrain Passage: ordinary ground. Omit hazard immunity and liquid-depth exceptions; retain legal movement modes and barriers. |
| Trample (action) | Cavalry Charge; candidate | Use Cavalry Charge against one target. Keep source limited uses; omit shared-space routes, damage to additional units, and separate knockdown/push riders. |

Intentional omissions: Mounted Troop.

### Dezullon Thicket

[Original inventory](inventory.md#dezullon-thicket). Level 15. Proposed: **Regeneration, Immobilize, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Regeneration (passive) | Regeneration; candidate | Use recurring Regeneration. Keep source damage suppressors and environmental requirements; omit source HP rate, dying rules, and segment restoration. |
| Acid Rain (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Acid Volley exposes each hit target to Amnesia Venom. Resolve its separate Fortitude save once; apply the clumsy conversion, and retain later mental impairment as an affliction extension. |
| Amnesia Venom (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Amnesia Venom uses its own Fortitude DC. Compress stages 1–2 to exposed; later stages impair casting and perception. Preserve the six-round duration and record memory loss for campaign adjudication. |
| Constrict (action) | Combat Bonus; candidate | Combat Bonus: +1 melee against a target held by this troop’s Immobilize. Replace the separate paid damage follow-up with pressure on the normal attack; no extra damage activity. |
| Root (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve the refuse/plant disguise and its source setup duration. Break disguise on acting; Refuse Pile retains its AC and stench interaction, while Root uses its terrain-specific Deception value. Needs hidden/disguise state. |
| Thrashing Vines (action) | Immobilize; candidate | Apply Immobilize on a critical hit by the linked melee attack. Collapse source hit/investment gates, paid or free follow-up checks, and restraint grades into this one rider. Omit carrying and use the one-action release. |
| Mass Improved Grab (free) | Immobilize; candidate | Apply Immobilize on a critical hit by the linked melee attack. Collapse source hit/investment gates, paid or free follow-up checks, and restraint grades into this one rider. Omit carrying and use the one-action release. |

Intentional omissions: Regrowth.

### Dire Wolves

[Original inventory](inventory.md#dire-wolves). Level 8. Proposed: **Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Buck (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** Retain the mount/command trigger and Reflex save; failure ejects and exposes the rider. Requires rider identities. Never translate this into an ordinary defensive strike against every adjacent troop. |
| Grab (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** This inherited individual-creature ability refers to named Strikes that the troop action list does not expose. Preserve the prerequisite and propose a named Attack follow-up (grab, trip, rend, or cleave as applicable), but require an explicit troop binding before enabling it. Rend also requires redesign because the game permits one attack per activation. |
| Knockdown (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** This inherited individual-creature ability refers to named Strikes that the troop action list does not expose. Preserve the prerequisite and propose a named Attack follow-up (grab, trip, rend, or cleave as applicable), but require an explicit troop binding before enabling it. Rend also requires redesign because the game permits one attack per activation. |
| Pack Attack (passive) | Combat Bonus; candidate | Combat Bonus: +1 melee while at least two distinct allied units also threaten the target. Preserve the ally-count requirement; members inside this troop do not count as allies. |
| Worry (action) | Combat Bonus; candidate-with-decision | Combat Bonus: +1 melee against a target held by this troop’s Immobilize. Replace the separate paid damage follow-up with pressure on the normal attack; no extra damage activity. **Decision:** Requires an independently granted Immobilize activity. |

### Divine Warden Army

[Original inventory](inventory.md#divine-warden-army). Level 18. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Divine Devastation (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On each source segment loss and destruction, burst against nearby enemies: Will save against spirit damage; failure also weakens physical attacks and casting. This is passive, not a reaction. |
| Orchestra of Faith (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Allow an eligible Iomedae cleric to originate Heal targeting from this troop’s position. Requires caster/deity identity and a spell-origin field; never grant the troop a free Heal action. |

### Dottari Excruciator Division

[Original inventory](inventory.md#dottari-excruciator-division). Level 9. Proposed: **Immobilize**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Long Arm of the Law (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Bash It Down (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Offer the source paid maneuver against a target’s Fortitude or Reflex defence: shove/reposition moves one legal hex, trip exposes, grapple holds, and disarm weakens weapons. Keep each source prerequisite and eligible choice; Bash It Down also targets structures. |
| Stop Where You Are (action) | Immobilize; candidate | Offer Immobilize as a non-damaging Volley replacement. Omit the source damage, graded slow/exposure, and barb damage on escape; keep the existing damage profile as the alternative. |

### Drake Flight

[Original inventory](inventory.md#drake-flight). Level 13. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Drake Breath (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a 2-action breath profile with acid/cold/fire/poison choices. It cannot repeat the last chosen type; retain a last-element field. Do not add a generic cooldown the source does not state. |
| Speed Surge (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Up to three times per day, spend 1 action to Move twice using land or flight. Preserve the daily resource and actual source mode rates. |

### Dread Zombie Leshy Horde

[Original inventory](inventory.md#dread-zombie-leshy-horde). Level 4. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Slow (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Start each activation with 2 actions and disable reactions. Apply independently of movement speed. Preserve the drawback even for the source named Fast Shambler Troop. |

Intentional omissions: Grave Tide.

### Dromaar Company

[Original inventory](inventory.md#dromaar-company). Level 6. Proposed: **Cavalry Charge, Weaken Defence**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Bola Hurl (action) | Weaken Defence; candidate | Weaken Defence on a successful hit by this specific attack. Omit a follow-up Trip check and separate prone/clumsy values. Preserve an alternative attack as a separate local attachment. |
| Charge the Fallen (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |

### Druid Circle

[Original inventory](inventory.md#druid-circle). Level 12. Proposed: **Push / Pull**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Call Down the Storm (action) | Push / Pull; candidate | After a successful hit by this ranged attack, push one legal hex away. No attacker follow movement or extra collision damage. |

### Dwarf Battalion

[Original inventory](inventory.md#dwarf-battalion). Level 6. Proposed: **Fear, Guard, Resist Fear and Rout / Hold Ground**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Dwarven Doughtiness (passive) | Resist Fear and Rout / Hold Ground; candidate | Use Resist Fear and Rout. Replace source graded fear recovery, threshold-based save upgrades, and extra bonuses with the common conditional +2. |
| Dwarven War Song (action) | Fear; candidate | Grant the paid Fear activity. Preserve visibility and recipient eligibility; omit source target counts and graded fear. War Shriek loses its additional hold; wordless delivery retains its language exemption. |
| Raise Shields (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |
| Reactive Attack (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Shield Block (reaction) | Block; future-reaction | Future Block against physical damage while the source shield/protection prerequisite holds. Omit Hardness and shield damage. |
| Shields Up! (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** Shields Up! is typed as a reaction but states no trigger. Proposed trigger is an incoming attack/Reflex effect, granting the source +2 Defence/Reflex before resolution; require a source ruling before enabling it. |

### Dwarf Longshot Squad

[Original inventory](inventory.md#dwarf-longshot-squad). Level 10. Proposed: **Immobilize**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Hampering Fusillade (action) | Immobilize; candidate | Grant a two-action non-damaging Volley replacement; a successful game attack check applies Immobilize. Replace source movement/action penalties with root and a one-action release. Omit disease exposure. |

### Dwarf Longshot Squad (Guns)

[Original inventory](inventory.md#dwarf-longshot-squad-guns). Level 10. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Bullet Smog (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to place smoke within medium range for the encounter; no attack damage. The cloud obscures sight in both directions until strong wind clears it. |

### Einherji Host

[Original inventory](inventory.md#einherji-host). Level 15. Proposed: **Combat Bonus, Guard, Resist Fear and Rout / Hold Ground**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| +4 to Will Vs. Fear (passive) | Resist Fear and Rout / Hold Ground; candidate | Resolve in fear-resistance mode. Replace this positive fear/Intimidation-only source bonus with the common +2 and deduplicate prepared statistics. |
| Jotun Slayer (passive) | Combat Bonus; candidate | Combat Bonus: +1 on the named attack against the source giant, unholy, or undead predicate respectively. Preserve the actual target trait; omit bonus damage components. |
| Pay For Every Inch (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 3 actions to Guard and prepare a movement-triggered damage zone until next activation. Resolve at most once per mover per action. This zone is a paid delayed effect, not a source reaction; requires trigger-zone state. |
| Raise Shields (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |
| Song of Freedom (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action to use the source +29 Will against all mental effects until next activation. Store this as a conditional override, not +29 added to Will. |

### Elven Waverider Troop

[Original inventory](inventory.md#elven-waverider-troop). Level 11. Proposed: **Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Wavecrash (action) | Cavalry Charge; candidate | Use Cavalry Charge against one target. Keep source limited uses; omit shared-space routes, damage to additional units, and separate knockdown/push riders. |

### Engineering Corps

[Original inventory](inventory.md#engineering-corps). Level 6. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Risky Upgrade (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to choose burning weapons, protective plating, or movement boost on one device. Track a DC 5 flat explosion check every mechanic activation even if the mechanic leaves play. Requires upgrade and hazard lifecycle on engines. |

Intentional omissions: Mechanical Repair; Mechanical Specialist.

### Fangwood Sentinel Corps

[Original inventory](inventory.md#fangwood-sentinel-corps). Level 4. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Thus Always to Tyrants (free) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Once per battle, destroying an equal-or-higher-level enemy triggers an allied +1 attack benefit and an enemy Will save against a -1 attack penalty nearby. This is a free effect with one-round expiry, not a reaction or direct morale transfer. |

### Fast Shambler Troop

[Original inventory](inventory.md#fast-shambler-troop). Level 6. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Slow (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Start each activation with 2 actions and disable reactions. Apply independently of movement speed. Preserve the drawback even for the source named Fast Shambler Troop. |

Intentional omissions: Grave Tide.

### Fey Host

[Original inventory](inventory.md#fey-host). Level 16. Proposed: **Fear, Suppression, Heal / Clear Condition**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Battlefield Adaptability (action) | Guard; candidate | Select Guard as the default specialty. Terrain Passage for ordinary ground is an explicit alternative assignment; omit round-by-round stance switching. |
| Demoralize (action) | Fear; candidate | Grant the paid Fear activity. Preserve visibility and recipient eligibility; omit source target counts and graded fear. War Shriek loses its additional hold; wordless delivery retains its language exemption. |
| Dirty Fighting (passive) | Fear; candidate | Apply Fear on a successful hit by the named melee or ranged attack. Omit graded frightened values; keep any sonic/hearing prerequisite. |
| Feint (action) | Weaken Defence; candidate | Grant a paid Weaken Defence activity. Omit skill ranks, the source extra movement, and attacker-only targeting of the bonus; Weaken Defence benefits every attacker until expiry. |
| Focus Gaze (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action to force the Wild Gaze save. A target already slowed by that gaze can become paralyzed on failure. Track the originating gaze, immunity until next activation, and an incapacitation limit. |
| Hunter's Link (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Allied ranged attacks within the source link radius ignore concealment. Requires concealment and a range-limited aura; it never grants sight through blocked terrain. |
| Infuse Arrow (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 3 actions to combine one chosen eligible spell and a Volley. A miss consumes the spell; a hit delivers its touch/area effect, with the source save penalty for area delivery. Requires spell payload selection, resource spending, and compound resolution. |
| Instinctive Cooperation (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Improve saves against allied troop effects to critical success where a save exists. This can prevent friendly area damage; it neither heals nor prevents effects that offer no save. |
| Primal Magic (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Retain the source 1d10 table as a 2-action Will-targeting activity: slow, fear, electricity plus exposure, sickness, or casting impairment. Keep its non-routed prerequisite and seeded randomness; do not reduce it to a generic Blast. |
| Reactive Attack (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Seeking Shots (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Ignore concealment for this troop’s ranged attacks and spell attacks. Keep sight and line-of-effect checks; cover and solid obstacles remain separate. |
| Supernatural Attacks (passive) | Suppression; candidate | Apply Suppression on a critical hit by the source-eligible melee or Volley profile. This broadens the source physical-attack penalty to the existing game condition. |
| Swift Recovery (passive) | Heal / Clear Condition; candidate | Grant once-per-battle activation-start Clear Condition. Omit the source flat check and retain the tactical-condition restriction. |
| Troop Spellcasting (passive) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Troop Spellcasting references pf2e-creature-crispr localization, absent from the PF2e checkout. Preserve the unresolved key and actual spell items; do not infer its rule from a same-name PF2e ability. |
| Wild Gaze (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** At an enemy activation’s end in range, use the source Will save to remove one action (two on critical failure) next activation. Allow the source 1-action toggle. Its fear trait does not make the mechanical effect frightened. |

Intentional omissions: Constant Spells; Greensight; Planar Acclimation.

### First-Class Cavalry

[Original inventory](inventory.md#first-class-cavalry). Level 13. Proposed: **Cavalry Charge, Resist Fear and Rout / Hold Ground, Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| No Retreat (passive) | Resist Fear and Rout / Hold Ground; candidate | Use Hold Ground. Omit compelled-fleeing-to-slowed conversion; this never grants pursuit. |
| Drilled in Formations (action) | Guard; candidate | Choose Guard as the formation specialty. Omit switching among movement, wedge, and loose formations. Merge it with any existing Guard assignment. |
| First-class Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |

### First-Class Infantry

[Original inventory](inventory.md#first-class-infantry). Level 13. Proposed: **Cavalry Charge, Resist Fear and Rout / Hold Ground, Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| No Retreat (passive) | Resist Fear and Rout / Hold Ground; candidate | Use Hold Ground. Omit compelled-fleeing-to-slowed conversion; this never grants pursuit. |
| Drilled in Formations (action) | Guard; candidate | Choose Guard as the formation specialty. Omit switching among movement, wedge, and loose formations. Merge it with any existing Guard assignment. |
| First-class Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |

### First-Class Vordines

[Original inventory](inventory.md#first-class-vordines). Level 13. Proposed: **Cavalry Charge, Resist Fear and Rout / Hold Ground, Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| No Retreat (passive) | Resist Fear and Rout / Hold Ground; candidate | Use Hold Ground. Omit compelled-fleeing-to-slowed conversion; this never grants pursuit. |
| Drilled in Formations (action) | Guard; candidate | Choose Guard as the formation specialty. Omit switching among movement, wedge, and loose formations. Merge it with any existing Guard assignment. |
| First-class Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |

### Fleshwarp Amalgam

[Original inventory](inventory.md#fleshwarp-amalgam). Level 8. Proposed: **Delayed Damage, Terrain Passage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Brutal Retaliation (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** Before/when the source segment-loss event resolves, spend a reaction to retaliate against adjacent enemies for at most 1 damage each; a hit also pushes one legal hex. Preserve its damage-threshold trigger. |
| Acid Spray (action) | Delayed Damage; candidate | Apply Delayed Damage on the source hit or critical-hit result, attached only to the named attack. Preserve its damage tag. Use one pending damage event and omit damage dice and multi-target scaling. |
| Many-Limbed Stride (passive) | Terrain Passage; candidate | Terrain Passage: ordinary ground. Omit hazard immunity and liquid-depth exceptions; retain legal movement modes and barriers. |

### Frog Riders

[Original inventory](inventory.md#frog-riders). Level 10. Proposed: **Cavalry Charge, Fear, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Aggressive Mounts (passive) | Combat Bonus; candidate | Combat Bonus: +1 melee against unmounted troops. Omit individual-size predicates, level scaling, and minor source defensive drawbacks explicitly. |
| Amphibious (passive) | Terrain Passage; candidate | Terrain Passage: water and swamp. Retain actual imported movement modes; omit associated skill/attack bonuses. This grants no swim or water-walking mode. |
| Cavalry Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |
| Chorus of Croaks (action) | Fear; candidate | Use adjacent hostile Fear, with the source activation cost if present. Omit separate fear-save penalties and the additional Demoralize grant. |
| Demoralize (action) | Fear; candidate | Grant the paid Fear activity. Preserve visibility and recipient eligibility; omit source target counts and graded fear. War Shriek loses its additional hold; wordless delivery retains its language exemption. |
| Rise from the Swamp (passive) | Opening Move; candidate | Opening Move when deployed in water or swamp. Omit adjacent-enemy deployment and first-round damage bonuses; end the opening Move outside contact. |
| Swamp Passage (passive) | Terrain Passage; candidate | Terrain Passage: water and swamp. Retain actual imported movement modes; omit associated skill/attack bonuses. This grants no swim or water-walking mode. |
| Tongue Lashing (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to tether nearby targets on failed Reflex saves. They can move inside the tongue’s radius; Escape or severing ends the tether. Do not model this as immobilization. |

Intentional omissions: Darkvision; Mounted Troop.

### Frost Giant Warriors

[Original inventory](inventory.md#frost-giant-warriors). Level 14. Proposed: **Terrain Passage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Chill Breath (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Use a separate short-range breath with 1d4-round recharge. On a hit, hold the target and add one pending cold damage. Escape ends the hold and further cold ticks; repeating damage requires a condition lifecycle extension. |
| Ice Stride (passive) | Terrain Passage; candidate | Terrain Passage: rough ground, limited to snow and ice. Omit slip checks; retain the source terrain restriction. |
| Reactive Attack (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Wide Swing (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** This inherited individual-creature ability refers to named Strikes that the troop action list does not expose. Preserve the prerequisite and propose a named Attack follow-up (grab, trip, rend, or cleave as applicable), but require an explicit troop binding before enabling it. Rend also requires redesign because the game permits one attack per activation. |

### Gale Frenzy

[Original inventory](inventory.md#gale-frenzy). Level 9. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Stench (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On entry/start in range, use the source Fortitude save for sickness; critical failure also reduces actions or speed as the variant states. Keep one-minute immunity and the Ravening recovery penalty. Do not replace this with fear. |
| Distracting Whispers (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a ranged mental attack with its own Will DC and 1d4-round recharge. A hit impairs casting/concentration; critical hits strengthen that impairment. |
| Ravenous Winds (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions for a Fortitude-gated pull into an adjacent legal hex. Preserve source target cap and fall effects only after altitude support exists. |
| Talonstorm (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On the source hit/failure condition, record exposure to the named disease and resolve its Fortitude save. Preserve onset and daily/hourly stages; no immediate Health or Morale penalty unless the source disease or an accelerator supplies one. |

Intentional omissions: Putrid Plague.

### Gargoyle Wing

[Original inventory](inventory.md#gargoyle-wing). Level 9. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Death From Above (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** While flying above a creature that moves adjacent below, spend a reaction to make a talon attack capped at 1 damage. Requires a height relationship; flight alone does not prove the trigger. |
| Catch and Release (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Offer a 2-action grapple followed by flight and a drop. Restrict targets by member size; this needs carried targets and fall damage. Treating an entire troop as one Small creature would overstate the source. |

### Ghostly Mob

[Original inventory](inventory.md#ghostly-mob). Level 8. Proposed: **Fear**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Frightful Chorus (action) | Fear; candidate | Grant the paid Fear activity. Preserve visibility and recipient eligibility; omit source target counts and graded fear. War Shriek loses its additional hold; wordless delivery retains its language exemption. |

Intentional omissions: Site Bound; Rejuvenation.

### Giant Ant Army

[Original inventory](inventory.md#giant-ant-army). Level 7. Proposed: **Immobilize**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Giant Ant Venom (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** The linked attack/hazard exposes the target; roll the source Fortitude save. First conversion: one pending poison damage plus the named weakness/exposure effect. Retain per-round stages and maximum duration for a later affliction lifecycle. |
| Grasping Mandibles (action) | Immobilize; candidate | Apply Immobilize on a critical hit by the linked melee attack. Collapse source hit/investment gates, paid or free follow-up checks, and restraint grades into this one rider. Omit carrying and use the one-action release. |
| Haul Away (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Move while bringing held targets along. Preserve restrained-only versus grapple-check prerequisites and segment target caps. Requires carried-target occupancy and legal destination placement. |
| Mandible Frenzy (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Mandible Frenzy enables the paid Grasping Mandibles follow-up. Its source action text references the rider only on 1- and 2-action damage rows while the follow-up requirement is broader; retain this discrepancy for binding review. |
| Overwhelm (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions against a grabbed Large-or-larger target to restrain it. A target starting its activation restrained takes capped damage and the Giant Ant Venom exposure. Requires restraint, Escape, and member-size policy. |

### Giant Mammoth Riders

[Original inventory](inventory.md#giant-mammoth-riders). Level 15. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| +2 Status to All Saves vs. Cold (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Retain the exact source bonus and its trait predicate; apply it only to the named effect or check. Avoid adding a modifier that prepared actor statistics already include. |
| +2 Status to All Saves vs. Cold (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Retain the exact source bonus and its trait predicate; apply it only to the named effect or check. Avoid adding a modifier that prepared actor statistics already include. |
| Grabbing Trunk (passive) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** This inherited individual-creature ability refers to named Strikes that the troop action list does not expose. Preserve the prerequisite and propose a named Attack follow-up (grab, trip, rend, or cleave as applicable), but require an explicit troop binding before enabling it. Rend also requires redesign because the game permits one attack per activation. |
| Trample (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Trample refers to an individual hoof/foot Strike absent from the troop’s actions. Preserve the route, source DC, and member-size limits; bind a troop damage profile explicitly before enabling it. |

Intentional omissions: Cold Adaptation; Dual Tusks; Mounted Troop.

### Gnome Cannon Corps

[Original inventory](inventory.md#gnome-cannon-corps). Level 7. Proposed: **Push / Pull**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Arcane Explosion (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Use a 3-action force Volley: a hit dazzles through the target’s next activation and leaves an illusion terrain marker for the encounter. A Will save allows movement through the marker at normal cost. Requires sight and terrain effects. |
| Cannon Vent (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Cannon Vent damages all nearby creatures, including allies. Preserve this targeting difference even though the base melee damage needs no extra rider. |
| Direct Hit (action) | Push / Pull; candidate | After a successful hit by this ranged attack, push one legal hex away. No attacker follow movement or extra collision damage. |

### Goblin Bombardiers

[Original inventory](inventory.md#goblin-bombardiers). Level 7. Proposed: **Delayed Damage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Alchemical Grenades (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Attach an acid/cold/fire choice and one pending damage to Bomb Barrage. Keep a finite grenade resource (six uses per day in the source); drawing and throwing stays within the one-attack limit. |
| Burning Weaponry (passive) | Delayed Damage; candidate | Apply Delayed Damage on the source hit or critical-hit result, attached only to the named attack. Preserve its damage tag. Use one pending damage event and omit damage dice and multi-target scaling. |
| Explosive Defeat (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On destruction, resolve one adjacent explosion against every creature, including allies, at the source Battle DC. Cap damage to 1 per target as the proposed scale; execute once and stop recursive death explosions from looping. |
| Quick Grenadier (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Use a 1-action draw-and-throw grenade activity that spends one grenade and consumes the activation’s attack. Bind grenade payloads explicitly; inherited ratfolk wording does not authorize unlimited extra shots. |

Intentional omissions: Cheek Pouches; Darkvision; Quick Stow; Swarming.

### Goblin Get Gang

[Original inventory](inventory.md#goblin-get-gang). Level 5. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Goblins Chant and Goblins Sing! (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** A concentrate action in the aura requires the source Will save; failure wastes that action, critical success grants battle-long immunity. Requires a concentrate tag and spell-action gate. |
| Goblins Bound and Goblins Swing! (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** When adjacent to a conscious enemy, require Attack before Move this activation. Allow movement normally if no conscious enemy is adjacent. Preserve this as activity legality, not a movement speed penalty. |

### Goblin Rabble

[Original inventory](inventory.md#goblin-rabble). Level 4. Proposed: **Weaken Defence**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Dogpile (action) | Weaken Defence; candidate | Weaken Defence on a critical hit by the named attack. Ordinary hits gain no rider. |
| Hobble Pursuit (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to reduce nearby targets’ movement through a Reflex save; failure also removes one action next activation. Since source duration is unstated, propose expiry after the victim’s next activation. |
| Rush and Steal (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to Move twice and pick up/steal eligible objects along the route, limited by segments. Requires inventory/object identities; do not replace theft with arbitrary Morale damage. |

### Goblin Wolf Riders

[Original inventory](inventory.md#goblin-wolf-riders). Level 6. Proposed: **Cavalry Charge, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Cavalry Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |
| Knockdown (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** This inherited individual-creature ability refers to named Strikes that the troop action list does not expose. Preserve the prerequisite and propose a named Attack follow-up (grab, trip, rend, or cleave as applicable), but require an explicit troop binding before enabling it. Rend also requires redesign because the game permits one attack per activation. |
| Pack Attack (passive) | Combat Bonus; candidate | Combat Bonus: +1 melee while at least two distinct allied units also threaten the target. Preserve the ally-count requirement; members inside this troop do not count as allies. |

Intentional omissions: Mounted Troop.

### Gold Defender Garrison

[Original inventory](inventory.md#gold-defender-garrison). Level 13. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Death Throes (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** At each source HP threshold, create short-lived poison fumes and a molten-metal terrain hazard. Preserve exposure to Gold Defender Poison separately from fire damage; add at most one hazard trigger per target per activation. |
| Golem Antimagic (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Retain the source cold vulnerability, fire healing, and acid slowing with magic immunity. Requires typed damage and distinct healing tags; fire damage is not automatically fire healing for other troops. |
| Gold Defender Poison (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** The linked attack/hazard exposes the target; roll the source Fortitude save. First conversion: one pending poison damage plus the named weakness/exposure effect. Retain per-round stages and maximum duration for a later affliction lifecycle. |
| Light Reflection (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Offer a light-dependent fire cone with distinct dim/bright DCs and 1d4-round recharge. A hit leaves pending fire damage; require visible light state before enabling this profile. |

### Golden Erinys Novitiate Circle

[Original inventory](inventory.md#golden-erinys-novitiate-circle). Level 5. Proposed: **Weaken Defence, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Opportunistic Halt (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Unholy Quickness (passive) | Combat Bonus; candidate | Combat Bonus: +1 Defence against ranged attacks. Omit the extra save bonus. |
| Pain Points (action) | Weaken Defence; candidate | Weaken Defence on a successful hit by this specific attack. Omit a follow-up Trip check and separate prone/clumsy values. Preserve an alternative attack as a separate local attachment. |

### Gorumite Infantry

[Original inventory](inventory.md#gorumite-infantry). Level 14. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Raise Swords! (action) | Delayed Damage; candidate-with-decision | Apply bleed-tagged Delayed Damage only when the source attack investment or surrounding requirement holds. Retain that gate and resolve it against game activities before enabling. **Decision:** Resolve the attack-investment or surrounding requirement against the chosen game activity. |

### Hadi Mob

[Original inventory](inventory.md#hadi-mob). Level 15. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Gnaw and Chew (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On the source hit/failure condition, record exposure to the named disease and resolve its Fortitude save. Preserve onset and daily/hourly stages; no immediate Health or Morale penalty unless the source disease or an accelerator supplies one. |

Intentional omissions: Ratspeak; Hadi Pestilence.

### Halfling Lucky Draw

[Original inventory](inventory.md#halfling-lucky-draw). Level 8. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Bad Deal (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to curse a target within short range: on a failed Will save, its next roll uses the worse of two d20s. Add a one-use misfortune effect; do not make it persistent suppression. |
| Troop Harrowing (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** When casting a single-target spell, attempt the source Occultism/Will check: success improves that spell’s chance; critical failure frightens the caster. Requires skill and spell-target metadata; it is part of Cast, not a new reaction. |

### Hana's Hundreds

[Original inventory](inventory.md#hanas-hundreds). Level 15. Proposed: **Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Run Them Over! (action) | Cavalry Charge; candidate | Use Cavalry Charge against one target. Keep source limited uses; omit shared-space routes, damage to additional units, and separate knockdown/push riders. |

### Harvest Regiment

[Original inventory](inventory.md#harvest-regiment). Level 8. Proposed: **Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Juice Shower (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On incoming critical hit or critical failed damage save, splash nearby creatures with movement reduction and sight impairment. Each victim can spend 1 action to clear it; preserve friendly-fire and passive-trigger timing. |
| Raise Shells (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |

### Heavy Cavalry

[Original inventory](inventory.md#heavy-cavalry). Level 7. Proposed: **Cavalry Charge, Weaken Defence**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Thunder of Hooves (action) | Cavalry Charge + Weaken Defence; candidate | Use Cavalry Charge with Weaken Defence on a critical melee hit. Omit the separate Move-and-Trip/Demoralize choice. |
| Trample (action) | Cavalry Charge; candidate | Use Cavalry Charge against one target. Keep source limited uses; omit shared-space routes, damage to additional units, and separate knockdown/push riders. |

Intentional omissions: Mounted Troop.

### Hell Hound Pack

[Original inventory](inventory.md#hell-hound-pack). Level 8. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Hellish Revenge (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** On an incoming critical Strike or spell attack, spend a reaction to recharge and use Hellfire Breath. Keep this out of normal Attack riders and enforce the reaction budget. |
| Hellfire Breath (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Offer a 1-action two-cone fire breath with 1d4-round recharge. Fire damage or a fire effect immediately recharges it. Requires typed incoming effects and disjoint area selection. |

### Hellbound Honor Guard

[Original inventory](inventory.md#hellbound-honor-guard). Level 12. Proposed: **Fear**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Final Reward (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On destruction, trigger adjacent fire/spirit damage and a wider Will-gated fear burst. Preserve separate ranges and saves; resolve once per death. |
| Frightful Presence (passive) | Fear; candidate | Use adjacent hostile Fear. Preserve fear immunity and source eligibility; omit larger radii, graded fear, reaction locks, and action loss. |
| Opportunistic Strikes (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Vigor of the Damned (action) | Heal / Clear Condition; candidate-with-decision | Grant paid Heal only at the source low-Health threshold. Its recovery ceiling remains the lower source threshold, not the general battle-start ceiling; resolve that threshold before enabling. **Decision:** Resolve the low-Health threshold and recovery ceiling on the four-Health track. |

### Hellknight Cavalry Brigade

[Original inventory](inventory.md#hellknight-cavalry-brigade). Level 8. Proposed: **Cavalry Charge, Terrain Passage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Lance Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |
| Trailblazing Stride (passive) | Terrain Passage; candidate | Terrain Passage: ordinary ground. Omit hazard immunity and liquid-depth exceptions; retain legal movement modes and barriers. |

Intentional omissions: Mounted Troop.

### Hellknight Dragoon Squad

[Original inventory](inventory.md#hellknight-dragoon-squad). Level 9. Proposed: **Fear, Resist Fear and Rout / Hold Ground**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| +2 Circumstance Bonus to Saves vs Fear Effects (passive) | Resist Fear and Rout / Hold Ground; candidate | Resolve in fear-resistance mode. Replace this positive fear/Intimidation-only source bonus with the common +2 and deduplicate prepared statistics. |
| Bind Them in Chains (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** When an adjacent enemy gains fear or crosses the stated troop threshold, spend a reaction for a Reflex save: success exposes, failure also holds, critical failure restrains. Needs a hold record with its own escape DC and expiry. |
| Break the Weak Link (passive) | Fear; candidate-with-decision | Use adjacent hostile Fear while the source remaining-strength requirement holds. This replaces the emotion-save penalty and narrows it to fear. **Decision:** Resolve the source remaining-strength threshold on the four-Health track. |
| Fear the Chain (action) | Fear; candidate | Grant the paid Fear activity. Preserve visibility and recipient eligibility; omit source target counts and graded fear. War Shriek loses its additional hold; wordless delivery retains its language exemption. |

### Hellknight Hunter Squad

[Original inventory](inventory.md#hellknight-hunter-squad). Level 15. Proposed: **Heal / Clear Condition, Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| +1 Circumstance Bonus vs Emotion Effects (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Retain the exact source bonus and its trait predicate; apply it only to the named effect or check. Avoid adding a modifier that prepared actor statistics already include. |
| Pin It Down (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Disciplined Barricade (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |
| Medic! (action) | Heal / Clear Condition; candidate | Grant the catalogue paid Heal activity to an adjacent eligible ally. Preserve recipient prerequisites; use the common healing ceiling and recipient limit. |

Intentional omissions: Hunters of Monsters.

### Hellknight Retrieval Unit

[Original inventory](inventory.md#hellknight-retrieval-unit). Level 6. Proposed: **Weaken Defence, Immobilize**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Bola Barrage (action) | Weaken Defence; candidate | Weaken Defence on a critical hit by the named attack. Ordinary hits gain no rider. |
| Coordinated Subdual (action) | Immobilize; candidate | Apply Immobilize on a critical hit by the linked melee attack. Collapse source hit/investment gates, paid or free follow-up checks, and restraint grades into this one rider. Omit carrying and use the one-action release. |
| Identify Targets (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Use a named Seek activity and point out discovered targets to allies. Preserve the source area and target cap; requires hidden-state targeting. |
| You're Coming with Us (free) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Move while bringing held targets along. Preserve restrained-only versus grapple-check prerequisites and segment target caps. Requires carried-target occupancy and legal destination placement. |

### Hellknight Sea Brigade

[Original inventory](inventory.md#hellknight-sea-brigade). Level 9. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Boarding Grapple (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a separate ship activity. Boarding Grapple draws vessels together and anchors them; Rock the Boat moves and trips all other occupants. Requires vessel identities, movement, occupancy, and ship-only prerequisites. |

Intentional omissions: Sea Legs.

### Hobgoblin Battalion

[Original inventory](inventory.md#hobgoblin-battalion). Level 6. Proposed: **Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Reactive Strike (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Perfect Formation (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |

### Hobgoblin Veteran Regiment

[Original inventory](inventory.md#hobgoblin-veteran-regiment). Level 9. Proposed: **Cavalry Charge, Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Hobgoblin Phalanx (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |
| Watchful (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Ignore flanking exposure from enemies at or below the source level limit. Deny Advantage also covers hidden/surprise sources; Watchful only covers flanking. Do not remove exposure from other causes. |
| Overrun (action) | Cavalry Charge; candidate | Use Cavalry Charge against one target. Keep source limited uses; omit shared-space routes, damage to additional units, and separate knockdown/push riders. |

### House Thrune Elite Infantry

[Original inventory](inventory.md#house-thrune-elite-infantry). Level 16. Proposed: **Cavalry Charge, Resist Fear and Rout / Hold Ground**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Give No Ground (passive) | Resist Fear and Rout / Hold Ground; candidate | Use Hold Ground. Omit compelled-fleeing-to-slowed conversion; this never grants pursuit. |
| Hell's Will (passive) | Resist Fear and Rout / Hold Ground; candidate | Use Resist Fear and Rout. Replace source graded fear recovery, threshold-based save upgrades, and extra bonuses with the common conditional +2. |
| Cloven Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |

### Hryngar Breccia Squad

[Original inventory](inventory.md#hryngar-breccia-squad). Level 9. Proposed: **Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Attack of Opportunity (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Light Blindness (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On sudden bright-light exposure apply source blindness/dazzling and its recovery timing. Requires light level and sight states; retain this as a drawback rather than a generic Defence reduction. |
| Shield Block (reaction) | Block; future-reaction | Future Block against physical damage while the source shield/protection prerequisite holds. Omit Hardness and shield damage. |
| Raise Shields (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |
| Push Back (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Offer the source paid maneuver against a target’s Fortitude or Reflex defence: shove/reposition moves one legal hex, trip exposes, grapple holds, and disarm weakens weapons. Keep each source prerequisite and eligible choice; Bash It Down also targets structures. |

Intentional omissions: +2 Status to All Saves vs. Magic.

### Infernal Tide

[Original inventory](inventory.md#infernal-tide). Level 13. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Heavy Aura (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On entering the aura, use the source Will save to reduce movement while inside; success grants battle-long immunity. This encumbrance effect does not reduce action count. |
| Stygian Guardian (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** When a nearby creature/object is targeted, spend a reaction to supply standard cover, or greater cover if this troop already provides lesser cover. Resolve before the attack and prevent cover bonus stacking. |
| Drown (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Use a separate 2-action Fortitude-targeting activity against non-water-breathers: sickened on a success, action restriction on failure, incapacitation on critical failure. Requires an escape/recovery action and incapacitation limits for whole troops. |
| Sarglagon Venom (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** The linked attack/hazard exposes the target; roll the source Fortitude save. First conversion: one pending poison damage plus the named weakness/exposure effect. Retain per-round stages and maximum duration for a later affliction lifecycle. |
| Tentacle Onslaught (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Tentacle Onslaught exposes a hit target to Sarglagon Venom; its separate Fortitude save controls poison damage and clumsy stages. Bind the venom to this attack only. |

Intentional omissions: Telepathy 100 feet; At-Will Spells; Constant Spells; +1 Status to All Saves vs. Magic.

### Iriatykian Outrider Band

[Original inventory](inventory.md#iriatykian-outrider-band). Level 7. Proposed: **Cavalry Charge, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| +2 Status Bonus to all saves vs. darkness and shadow (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Retain the exact source bonus and its trait predicate; apply it only to the named effect or check. Avoid adding a modifier that prepared actor statistics already include. |
| Elusive Target (passive) | Combat Bonus; candidate | Combat Bonus: +1 Defence against unmounted targets. Omit the additional save bonus. |
| Mounted Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |
| Shatter Shadows (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Once per day and only inside magical darkness, spend 2 actions to counteract eligible darkness. Successful dispels cause the separate spirit burst; preserve the velstrac/deity degree penalty. Requires effect identities and counteract checks. |

Intentional omissions: Mounted Troop.

### Kobold Trap Squad

[Original inventory](inventory.md#kobold-trap-squad). Level 4. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Group Scamper (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Offer a 1-action Move with the source extra speed and +2 Defence against movement reactions; if it ends adjacent to an enemy it becomes exposed. Preserve the risk and once-per-round limit. |
| Hasty Traps (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to arm nearby traps through the troop’s next activation. The next eligible mover makes a Reflex save; failure adds pending bleed and reduces movement while bleeding. Track charges from remaining segments and one trigger per creature per turn. |

### Kobold Warriors

[Original inventory](inventory.md#kobold-warriors). Level 3. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Accustomed to Panic (reaction) | Hold Nerve; future-reaction | Future Hold Nerve while not routed. Omit the next-check bonus. |
| Group Scamper (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Offer a 1-action Move with the source extra speed and +2 Defence against movement reactions; if it ends adjacent to an enemy it becomes exposed. Preserve the risk and once-per-round limit. |
| Hasty Traps (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to arm nearby traps through the troop’s next activation. The next eligible mover makes a Reflex save; failure adds pending bleed and reduces movement while bleeding. Track charges from remaining segments and one trigger per creature per turn. |

Intentional omissions: Darkvision.

### Last Guard

[Original inventory](inventory.md#last-guard). Level 20. Proposed: **Fear, Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Void Healing (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve void immunity, vitality vulnerability, and the rule that only explicitly undead-healing void effects heal it. Ordinary void damage never heals. Requires damage/healing tags and eligible recipients. |
| Frightful Battle Cry (action) | Fear; candidate | Apply Fear on a successful hit by the named melee or ranged attack. Omit graded frightened values; keep any sonic/hearing prerequisite. |
| Spectral Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |

Intentional omissions: Battlefield Bound; Lifesense 60 feet; Rejuvenation.

### Leshy Mob

[Original inventory](inventory.md#leshy-mob). Level 11. Proposed: **Terrain Passage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Verdant Burst (passive) | Damage Absorption; candidate-with-decision | Damage Absorption on the source troop-loss threshold. Omit terrain growth and repeated segment regrowth; keep each threshold single-use. **Decision:** Choose a shared Health-threshold trigger and prevent buffer damage from triggering it. This delivery extends the current Damage Absorption trigger menu. |
| Change Shape (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action to become a plant terrain patch; return in a legal hex within that patch. Needs disguise and troop footprint state. Preserve the source difficult terrain. |
| One with the Foliage (passive) | Terrain Passage; candidate | Terrain Passage: woods. Omit greater-terrain upgrades and preserve barriers. |

### Leukodaemon Plague

[Original inventory](inventory.md#leukodaemon-plague). Level 14. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Infectious Aura (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Apply -2 to disease saves in range; when a creature contracts or progresses disease, expose adjacent creatures at the same DC. Requires affliction propagation with one-event deduplication. |
| Infected Jaws and Claws (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On the source hit/failure condition, record exposure to the named disease and resolve its Fortitude save. Preserve onset and daily/hourly stages; no immediate Health or Morale penalty unless the source disease or an accelerator supplies one. |
| Pestilent Wheeze (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Pestilent Wheeze applies sickness on a hit. Proposed sickness is -2 to the next physical check/attack, with a 1-action recovery option; keep graded values in source metadata. |
| Quicken Pestilence (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action on a diseased target in Infectious Aura; force its next disease-stage Fortitude save immediately. This is the explicit exception to day-scale disease onset; preserve existing stage and source DC. |

Intentional omissions: Plaguesense; Daemonic Pestilence.

### Lich Legion

[Original inventory](inventory.md#lich-legion). Level 18. Proposed: **Damage Absorption, Fear**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Frightful Presence (passive) | Fear; candidate | Use adjacent hostile Fear. Preserve fear immunity and source eligibility; omit larger radii, graded fear, reaction locks, and action loss. |
| Troop Counterspell (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** When an enemy casts a spell this legion has prepared, spend a reaction and that matching spell resource to counteract with the source +2. Requires spell identity, slots, and counteract rules; generic Cast trees alone cannot preserve its restriction. |
| Void Healing (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve void immunity, vitality vulnerability, and the rule that only explicitly undead-healing void effects heal it. Ordinary void damage never heals. Requires damage/healing tags and eligible recipients. |
| Siphoning Grip (action) | Damage Absorption; candidate | On use of this melee attack, including a miss, grant Damage Absorption to self. Use the catalogue buffer and expiry; omit source HP and action scaling. |
| Steady Troop Spellcasting (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Retain wider instantaneous spell areas as a Cast modifier. In the later reaction system, a disruption attempt allows the source DC 12 flat save to preserve the spell. Do not attach either benefit to ordinary Attack. |

Intentional omissions: Mass Rejuvenation.

Embedded reaction text requires separate inspection: Steady Troop Spellcasting. A mention of reactions alone grants nothing.

### Line Infantry

[Original inventory](inventory.md#line-infantry). Level 6. Proposed: **Resist Fear and Rout / Hold Ground, Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Drilled in Formations (action) | Guard; candidate | Choose Guard as the formation specialty. Omit switching among movement, wedge, and loose formations. Merge it with any existing Guard assignment. |
| No Retreat (passive) | Resist Fear and Rout / Hold Ground; candidate | Use Hold Ground. Omit compelled-fleeing-to-slowed conversion; this never grants pursuit. |

### Lizardfolk Defenders

[Original inventory](inventory.md#lizardfolk-defenders). Level 5. Proposed: **Combat Bonus, Terrain Passage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Amphibious (passive) | Terrain Passage; candidate | Terrain Passage: water and swamp. Retain actual imported movement modes; omit associated skill/attack bonuses. This grants no swim or water-walking mode. |
| Reactive Attack (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Shield Block (reaction) | Block; future-reaction | Future Block against physical damage while the source shield/protection prerequisite holds. Omit Hardness and shield damage. |
| Terrain Advantage (passive) | Combat Bonus; candidate | Combat Bonus: +1 melee while the source target/terrain prerequisite holds. Retain ancestry, difficult-ground, and swimming eligibility rather than granting a flat bonus. |

Intentional omissions: Deep Breath; Foragers.

### Logging Crew

[Original inventory](inventory.md#logging-crew). Level 4. Proposed: **—**.

Its ordinary profile or intentionally omitted details supply the first-pass classification; no extra ability is proposed.

### Mammoth Riders

[Original inventory](inventory.md#mammoth-riders). Level 12. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Grabbing Trunk (passive) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** This inherited individual-creature ability refers to named Strikes that the troop action list does not expose. Preserve the prerequisite and propose a named Attack follow-up (grab, trip, rend, or cleave as applicable), but require an explicit troop binding before enabling it. Rend also requires redesign because the game permits one attack per activation. |
| Trample (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Trample refers to an individual hoof/foot Strike absent from the troop’s actions. Preserve the route, source DC, and member-size limits; bind a troop damage profile explicitly before enabling it. |

Intentional omissions: Mounted Troop.

### Marcos's Marauders

[Original inventory](inventory.md#marcoss-marauders). Level 11. Proposed: **—**.

Its ordinary profile or intentionally omitted details supply the first-pass classification; no extra ability is proposed.

### Mercenary Band

[Original inventory](inventory.md#mercenary-band). Level 9. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Spoils of War (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** After Let ’em Have It hits, spend 1 action to attempt theft from hit targets. Requires inventory identities and transfer outcomes; keep it distinct from Disarm. |

### Mercenary Marauders

[Original inventory](inventory.md#mercenary-marauders). Level 11. Proposed: **Cavalry Charge, Suppression, Opening Move**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Ambush (passive) | Opening Move; candidate | Opening Move only when acting before all enemies. This deliberately replaces the first-attack bonus and Stealth initiative, and does not add to the existing Ambush deployment benefit. |
| Covering Fire (action) | Suppression; candidate | Grant a two-action non-damaging Volley replacement. On a successful game attack check, apply Suppression; omit graded speed penalties. |
| Howling Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |

Intentional omissions: Low-Light Vision.

### Mercenary Raiders

[Original inventory](inventory.md#mercenary-raiders). Level 12. Proposed: **Fear, Weaken Defence**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Dirty Fighting (passive) | Fear; candidate | Apply Fear on a successful hit by the named melee or ranged attack. Omit graded frightened values; keep any sonic/hearing prerequisite. |
| Feint (action) | Weaken Defence; candidate | Grant a paid Weaken Defence activity. Omit skill ranks, the source extra movement, and attacker-only targeting of the bonus; Weaken Defence benefits every attacker until expiry. |
| Reactive Attack (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Spoils of War (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** After Let ’em Have It hits, spend 1 action to attempt theft from hit targets. Requires inventory identities and transfer outcomes; keep it distinct from Disarm. |

### Mercenary Squad

[Original inventory](inventory.md#mercenary-squad). Level 2. Proposed: **—**.

Its ordinary profile or intentionally omitted details supply the first-pass classification; no extra ability is proposed.

### Mitflit Vermin Cavalry

[Original inventory](inventory.md#mitflit-vermin-cavalry). Level 4. Proposed: **Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Leaping Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |
| Vengeful Wrath (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** When not frightened, Crawling Stabs gains +2 against a creature that previously damaged or tormented this troop. Record enemy identity and clear it at battle end. |

Intentional omissions: Mounted Troop.

### Monk Cadre

[Original inventory](inventory.md#monk-cadre). Level 14. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Coordinated Maneuvers (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Coordinated Maneuvers lists Reposition twice, but the DC explanation names Trip. Proposed options are Disarm, Grapple, Reposition, and Trip; confirm that correction before enabling the profile. |

### Naval Crew

[Original inventory](inventory.md#naval-crew). Level 8. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Repel Boarders! (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action for a directional shove against eligible adjacent enemies; move one legal hex and optionally follow if at least one target moves. This follow movement avoids reactions as the source states. |
| Rock the Boat (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a separate ship activity. Boarding Grapple draws vessels together and anchors them; Rock the Boat moves and trips all other occupants. Requires vessel identities, movement, occupancy, and ship-only prerequisites. |

Intentional omissions: Sea Legs.

### Necromancer Troop

[Original inventory](inventory.md#necromancer-troop). Level 19. Proposed: **—**.

Its ordinary profile or intentionally omitted details supply the first-pass classification; no extra ability is proposed.

### Nightmarchers

[Original inventory](inventory.md#nightmarchers). Level 14. Proposed: **Fear**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Frightful Presence (passive) | Fear; candidate | Use adjacent hostile Fear. Preserve fear immunity and source eligibility; omit larger radii, graded fear, reaction locks, and action loss. |
| Blazing Admonition (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a 2-action short-range fire breath with 1d4-round recharge. Preserve the non-hostile blind/kin exemptions as targeting predicates; do not infer them from allegiance alone. |

Intentional omissions: Kinsense; Constant Spells.

### Ofalth Stampede

[Original inventory](inventory.md#ofalth-stampede). Level 15. Proposed: **Regeneration**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Refuse Pile (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve the refuse/plant disguise and its source setup duration. Break disguise on acting; Refuse Pile retains its AC and stench interaction, while Root uses its terrain-specific Deception value. Needs hidden/disguise state. |
| Filth Wallow (passive) | Regeneration; candidate | Use recurring Regeneration. Keep source damage suppressors and environmental requirements; omit source HP rate, dying rules, and segment restoration. |
| Stench (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On entry/start in range, use the source Fortitude save for sickness; critical failure also reduces actions or speed as the variant states. Keep one-minute immunity and the Ravening recovery penalty. Do not replace this with fear. |
| Offal Rain (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On the source hit/failure condition, record exposure to the named disease and resolve its Fortitude save. Preserve onset and daily/hourly stages; no immediate Health or Morale penalty unless the source disease or an accelerator supplies one. |
| Putrid Pummeling (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On the source hit/failure condition, record exposure to the named disease and resolve its Fortitude save. Preserve onset and daily/hourly stages; no immediate Health or Morale penalty unless the source disease or an accelerator supplies one. |

Intentional omissions: Wretched Weeps.

### Omox Slime Pool

[Original inventory](inventory.md#omox-slime-pool). Level 17. Proposed: **Immobilize**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Clean Vulnerability (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** When a cleaning effect hits this troop, or a victim spends an action cleaning its slime, deal 1 mental damage once per round. Requires a clean-slime action and source tracking. |
| Absorb Weapon (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** After an enemy weapon hit, spend a reaction and check against its Reflex defence: weaken its weapon attacks until it spends 1 action to recover. A critical result also prevents weapon attacks until recovery; requires equipment rules. |
| Slime Barrage (action) | Immobilize; candidate | Offer Immobilize as a non-damaging Volley replacement. Omit the source damage, graded slow/exposure, and barb damage on escape; keep the existing damage profile as the alternative. |
| Smothering Grasp (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action against a held target for a Fortitude save; failure blinds and threatens suffocation while the hold persists. Requires Escape, sight impairment, and bounded incapacitation; release clears the dependency. |
| Waves of Sludge (action) | Immobilize; candidate | Apply Immobilize on a critical hit by the linked melee attack. Collapse source hit/investment gates, paid or free follow-up checks, and restraint grades into this one rider. Omit carrying and use the one-action release. |

Intentional omissions: +1 Status to All Saves vs. Magic.

### Oprak Firestorm Battalion

[Original inventory](inventory.md#oprak-firestorm-battalion). Level 7. Proposed: **Delayed Damage, Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Blaze of Glory (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** At the source low-HP threshold, offer a 3-action self-detonation that can destroy this troop, damages nearby units including allies, and burns failed-save targets. Disable its bomb Volley until resupply. Requires self-damage and resource handling. |
| Close Ranks (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |
| Rain of Fire (action) | Delayed Damage; candidate | Apply fire-tagged Delayed Damage to the hit target. Omit adjacent splash recipients explicitly; keep any friendly-fire drawback as a separate review obligation. |

### Orc Raiding Party

[Original inventory](inventory.md#orc-raiding-party). Level 5. Proposed: **Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Ferocious Fall (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** Immediately before source segment loss, spend a reaction to retaliate against adjacent enemies for at most 1 damage each. Preserve the pre-loss timing and one shared reaction budget. |
| Break Through (action) | Cavalry Charge; candidate | Use Cavalry Charge against one target. Keep source limited uses; omit shared-space routes, damage to additional units, and separate knockdown/push riders. |

### Orc Skullcrushers

[Original inventory](inventory.md#orc-skullcrushers). Level 7. Proposed: **Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Chant of Dominance (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action to empower this activation’s damage with one pending spirit damage. Require the follow-up attack this activation; do not apply damage now and again through Wrath. |
| Sacred Salvo (action) | Combat Bonus; candidate | Combat Bonus: +1 on the named attack against the source giant, unholy, or undead predicate respectively. Preserve the actual target trait; omit bonus damage components. |

### Ort Mob

[Original inventory](inventory.md#ort-mob). Level 5. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Subservience (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** A visible non-ort devil in range can spend 1 action to command Hustle, Kill, Rally, or Work. Store commander and command; end on loss of sight or replacement. Requires allegiance/control and explicit commander identities. |

Intentional omissions: Faceless Horde.

### Pageant Troupe

[Original inventory](inventory.md#pageant-troupe). Level 14. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Attack of Opportunity (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** Pageant Troupe has crossed descriptions: Attack of Opportunity points to Shield Block; Shield Block points to Troop Defenses. Performers also says it has no shields. Retain both entries and require a source correction before granting either reaction. |
| Shield Block (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** Pageant Troupe has crossed descriptions: Attack of Opportunity points to Shield Block; Shield Block points to Troop Defenses. Performers also says it has no shields. Retain both entries and require a source correction before granting either reaction. |
| Strike as One (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Pageant Troupe’s 2-action Strike as One lists 8d8, exceeding its 3-action 4d8 expression. Preserve the numbers and use a basic attack pending source review; do not infer action scaling from this anomalous row. |

Intentional omissions: Performers.

### Peasant Militia

[Original inventory](inventory.md#peasant-militia). Level 5. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Pitch Bale (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Pitch Bale requires a successful pitchfork Strike, which the troop replaces with Pitchfork Flurry. Proposed binding is a 1-action follow-up after Flurry hits, with a Reflex gate for reposition/knockdown; make this binding explicit. |

### Pelegox Cube

[Original inventory](inventory.md#pelegox-cube). Level 11. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Entrancing Shapes (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a Will-targeting mental cone; a hit fascinates and impairs casting for the source duration. Add a concentration status and damage interruption policy for fascination. |

Intentional omissions: Telepathy 30 feet; Metalsense.

### Phalanx Formation

[Original inventory](inventory.md#phalanx-formation). Level 6. Proposed: **Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Shields Up! (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |

### Pixie Swarm

[Original inventory](inventory.md#pixie-swarm). Level 9. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Sprinkle Pixie Dust (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action to prepare the next arrow as charm, memory loss, sleep, or nonlethal mental damage instead of normal weapon damage. Use the source Will save with critical-hit degree reduction. Requires payload replacement and incapacitation rules; never add these effects on top of ordinary Volley damage. |
| Troop Spellcasting (passive) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Troop Spellcasting references pf2e-creature-crispr localization, absent from the PF2e checkout. Preserve the unresolved key and actual spell items; do not infer its rule from a same-name PF2e ability. |

Intentional omissions: +1 Status to All Saves vs. Magic.

### Planar Terra-cotta Squadron

[Original inventory](inventory.md#planar-terra-cotta-squadron). Level 15. Proposed: **Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Planar Step (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a separate teleport action with the source range, cost, prerequisites, and recharge. Bramble Jump requires undergrowth at both ends; Planar Step recharges in 1d4 rounds. Teleport avoids traversal and opportunity triggers. |
| Attack of Opportunity (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Shield Block (reaction) | Block; future-reaction | Future Block against physical damage while the source shield/protection prerequisite holds. Omit Hardness and shield damage. |
| Raise Shields (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |

### Protean Tumult

[Original inventory](inventory.md#protean-tumult). Level 12. Proposed: **Regeneration, Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Fast Healing 8 (passive) | Regeneration; candidate | Use recurring Regeneration. Keep source damage suppressors and environmental requirements; omit source HP rate, dying rules, and segment restoration. |
| Protean Anatomy 12 (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** After acid/electricity/sonic damage, resist the same type until replaced by another qualifying type; recover blindness/deafness at next activation end. Needs typed damage, effect state, and the source polymorph exception. |
| Stupefying Swipe (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |

Intentional omissions: Entropy Sense; +1 Status to All Saves vs. Magic; Chaos Flux.

### Pure Legion Regiment

[Original inventory](inventory.md#pure-legion-regiment). Level 10. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Nonbelievers (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Improve saves against divine effects by one degree and disallow willing receipt of helpful divine effects. Apply both sides of the trait; do not grant unconditional spell immunity. |
| Denounce Divinity (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Once per day, spend 2 actions to impair divine spellcasting among worshippers of the chosen deity. Preserve the deity filter and degree-specific fear; requires religion predicates and casting impairment. |
| Rebuking Strike (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On a critical Rebuking Strike against a target under this troop’s Denounce Divinity, prevent reductions of its fear/casting impairment through its next activation. Track source identity and the conditional expiry. |

### Pure Legion Squad

[Original inventory](inventory.md#pure-legion-squad). Level 13. Proposed: **Cavalry Charge, Resist Fear and Rout / Hold Ground, Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Cloak of Purity (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Retain +2 saves against divine/holy/unholy effects and the -2 rout-check drawback under a divine-caster commander. Requires commander and effect-trait predicates. |
| No Retreat (passive) | Resist Fear and Rout / Hold Ground; candidate | Use Hold Ground. Omit compelled-fleeing-to-slowed conversion; this never grants pursuit. |
| Drilled in Formations (action) | Guard; candidate | Choose Guard as the formation specialty. Omit switching among movement, wedge, and loose formations. Merge it with any existing Guard assignment. |
| First-class Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |

### Qadiran Camel Corps

[Original inventory](inventory.md#qadiran-camel-corps). Level 6. Proposed: **Terrain Passage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Dust Storm (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** In desert terrain, spend 1 action to Step and create reciprocal concealment against distant creatures through the next activation. Preserve the terrain and distance conditions. |
| Reflective Arrows (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** In bright light, give Reflective Arrows +1 to its attack check as the inverse of the source save penalty. No benefit applies in dim light or darkness. |
| Trailblazing Stride (passive) | Terrain Passage; candidate | Terrain Passage: ordinary ground. Omit hazard immunity and liquid-depth exceptions; retain legal movement modes and barriers. |

Intentional omissions: Desert-Adapted Troop; Mounted Troop.

### Ragtag Archers

[Original inventory](inventory.md#ragtag-archers). Level 6. Proposed: **Suppression**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Covering Fire (action) | Suppression; candidate | Grant a two-action non-damaging Volley replacement. On a successful game attack check, apply Suppression; omit graded speed penalties. |
| Sentry's Aim (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Offer the 2-action aimed ranged attack with +1, ignoring concealment and lesser/standard cover and reducing greater cover to standard. It consumes the normal attack; it never ignores walls or missing sight. |

Intentional omissions: Increased Ammunition.

### Raised Cavalry

[Original inventory](inventory.md#raised-cavalry). Level 19. Proposed: **Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Mounted (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Reduce available actions by 1 while the source ground/mount requirement is absent. Keep this independent of movement speed and expose the prerequisite in activity availability. |
| Shuffle Forces (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Resist physical damage while enough source segments remain, reduce the benefit at three segments, and remove it at two. Requires threshold state; do not leave a permanent armour bonus after losses. |
| Void Healing (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve void immunity, vitality vulnerability, and the rule that only explicitly undead-healing void effects heal it. Ordinary void damage never heals. Requires damage/healing tags and eligible recipients. |
| Trampling Charge (action) | Cavalry Charge; candidate | Use Cavalry Charge against one target. Keep source limited uses; omit shared-space routes, damage to additional units, and separate knockdown/push riders. |

### Rancorous Druids

[Original inventory](inventory.md#rancorous-druids). Level 11. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Collective Swarm (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Retain the named Swarm Form activity and rank. Add a temporary movement/defence form; define troop occupancy and reversion before it becomes playable. |

### Rancorous Priesthood

[Original inventory](inventory.md#rancorous-priesthood). Level 11. Proposed: **—**.

Its ordinary profile or intentionally omitted details supply the first-pass classification; no extra ability is proposed.

### Ratfolk Shank Squad

[Original inventory](inventory.md#ratfolk-shank-squad). Level 7. Proposed: **Weaken Defence**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Dirty Tricks (action) | Weaken Defence; candidate | Grant a paid Weaken Defence activity. Omit skill ranks, the source extra movement, and attacker-only targeting of the bonus; Weaken Defence benefits every attacker until expiry. |

### Redcap Brigade

[Original inventory](inventory.md#redcap-brigade). Level 10. Proposed: **Regeneration, Cavalry Charge, Delayed Damage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Fast Healing (passive) | Regeneration; candidate | Use recurring Regeneration. Keep source damage suppressors and environmental requirements; omit source HP rate, dying rules, and segment restoration. |
| Divine Revulsion (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** When a visible religious symbol is brandished or its wearer casts divine magic, roll the source Will save for fear and grant battle-long immunity afterward. Preserve this enemy-action trigger; do not test every frame. |
| Blood Soak (free) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** When either side first loses a segment or copious blood triggers the source, enable Blood Soak for the encounter. Proposed abstraction: +2 to its named attacks, once per action roll; preserve the blood eligibility and trigger without spending a reaction. |
| Bowl Over and Stomp (action) | Cavalry Charge + Delayed Damage; candidate | Use Cavalry Charge with bleed-tagged Delayed Damage on a hit. Omit attacks against every crossed creature, knockdown, and prone-only graze effects. |
| Deadly Swipes (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** After Bloody Reaping destroys an enemy, spend a reaction for one basic Attack against a different adjacent enemy, capped at 1 damage. Prohibit reaction chains and repeat attacks on the defeated target. |

### Sacristan Scourge

[Original inventory](inventory.md#sacristan-scourge). Level 15. Proposed: **Regeneration, Weaken Defence, Delayed Damage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Regeneration 10 (Deactivated by Holy or Silver) (passive) | Regeneration; candidate | Use recurring Regeneration. Keep source damage suppressors and environmental requirements; omit source HP rate, dying rules, and segment restoration. |
| Staggering Servitude (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** At the end of an enemy activation in range, a failed Will save sets one action lost on its next activation. Record the source and expiry; multiple identical stuns refresh rather than remove unlimited actions. |
| Focus Gaze (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action to force the Staggering Servitude save; failure stuns, and an already-stunned target also suffers casting impairment. Preserve temporary immunity until the scourge next activates. |
| Shadow Scream (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Once per battle, spend 3 actions to start the darkness/mental aura; sustain for 1 action each activation. Keep degree-specific deafness/confusion and critical damage, plus immunity. Requires darkness and sustained-zone state. |
| Storm of Agony (action) | Delayed Damage + Weaken Defence; candidate | Apply bleed-tagged Delayed Damage on a hit and Weaken Defence on a critical hit. Both share this melee attack; omit original damage dice. |

Intentional omissions: Painsight.

### Saltborn Stalkers

[Original inventory](inventory.md#saltborn-stalkers). Level 13. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Lightlure (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action for a Will-gated lure. On failure, compel movement toward the source during the next activation while avoiding obvious hazards; a critical failure also dazzles. Apply battle/day immunity and incapacitation safeguards. |
| Saline Crust (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** While in water, damage non-aquatic/non-amphibious creatures that end their activation nearby through the source Reflex save. Add terrain depth and creature-type predicates; cap at 1 damage per activation. |
| Salty Clutch (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Salty Clutch says restrained on a critical success in an otherwise target-save paragraph. Preserve that wording as a source error. Proposed correction is restraint on critical failure, plus carrying targets toward/in water; do not enable until corrected. |

### Sapper Squad

[Original inventory](inventory.md#sapper-squad). Level 4. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Demolition Expertise (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Against structures only, ignore one step of structural damage reduction as the proposed abstraction of 5 Hardness. Apply through the siege/wall damage path; never add it against troop Defence. |
| Excavation (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** While burrowing, create a temporary passage allies can use. Preserve the Sapper Squad full-speed versus Brastlewark half-speed distinction. Requires tunnel topology and collapse timing. |
| Fire in the Hole! [Salvo] (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Volley deafens on a critical hit. Add an auditory-reception condition through the target’s next activation; prevent auditory support and auditory attacks from treating it as a hearing target. This needs an auditory effect predicate. |
| Undermine (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** While underground, spend 3 actions to damage the surface area above, expose critical-failure targets, and create temporary difficult terrain. Requires burrowing and surface hazards; ordinary Volley has no underground prerequisite. |

### Scamp Avalanche

[Original inventory](inventory.md#scamp-avalanche). Level 6. Proposed: **Regeneration**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Fast Healing (While Underground) (passive) | Regeneration; candidate | Use recurring Regeneration. Keep source damage suppressors and environmental requirements; omit source HP rate, dying rules, and segment restoration. |
| Scree Breath (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a separate 2-action short-range breath profile with its source damage tag. After use, roll the source 1d4-round recharge; do not import it as an unlimited ordinary Volley. |

### Scamp Flood

[Original inventory](inventory.md#scamp-flood). Level 6. Proposed: **Regeneration**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Fast Healing (While Underwater) (passive) | Regeneration; candidate | Use recurring Regeneration. Keep source damage suppressors and environmental requirements; omit source HP rate, dying rules, and segment restoration. |
| Acid Breath (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a separate 2-action short-range breath profile with its source damage tag. After use, roll the source 1d4-round recharge; do not import it as an unlimited ordinary Volley. |

### Scamp Inferno

[Original inventory](inventory.md#scamp-inferno). Level 6. Proposed: **Regeneration**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Fast Healing (While Touching Fire) (passive) | Regeneration; candidate | Use recurring Regeneration. Keep source damage suppressors and environmental requirements; omit source HP rate, dying rules, and segment restoration. |
| Flame Breath (action) | Delayed Damage; candidate-with-decision | Attach fire-tagged Delayed Damage to a successful breath hit. The source breath cost, limited availability, and cooldown need a local profile; this is not an unlimited Volley. **Decision:** Bind a limited breath profile and its recharge before enabling the rider. |

Intentional omissions: Smoke Vision.

### Scamp Shrapnel

[Original inventory](inventory.md#scamp-shrapnel). Level 6. Proposed: **Regeneration**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Fast Healing (While Touching Metal) (passive) | Regeneration; candidate | Use recurring Regeneration. Keep source damage suppressors and environmental requirements; omit source HP rate, dying rules, and segment restoration. |
| Metallic Claws (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** The damage expression uses bleed without the persistent marker; confirm PF2e bleed semantics/source automation before enabling a delayed-damage rider. Proposed conversion is one pending bleed damage where the source intends persistent bleed; retain the source hit gate and breath recharge. |
| Shrapnel Breath (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** The damage expression uses bleed without the persistent marker; confirm PF2e bleed semantics/source automation before enabling a delayed-damage rider. Proposed conversion is one pending bleed damage where the source intends persistent bleed; retain the source hit gate and breath recharge. |

### Scamp Tangle

[Original inventory](inventory.md#scamp-tangle). Level 6. Proposed: **Regeneration, Delayed Damage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Fast Healing (While Touching Plants or Trees) (passive) | Regeneration; candidate | Use recurring Regeneration. Keep source damage suppressors and environmental requirements; omit source HP rate, dying rules, and segment restoration. |
| Pollen Breath (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a separate 2-action short-range breath profile with its source damage tag. After use, roll the source 1d4-round recharge; do not import it as an unlimited ordinary Volley. |
| Thorny Claws (action) | Delayed Damage; candidate | Apply Delayed Damage on the source hit or critical-hit result, attached only to the named attack. Preserve its damage tag. Use one pending damage event and omit damage dice and multi-target scaling. |

### Scamp Whirlwind

[Original inventory](inventory.md#scamp-whirlwind). Level 6. Proposed: **Regeneration**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Fast Healing (In Open Air) (passive) | Regeneration; candidate | Use recurring Regeneration. Keep source damage suppressors and environmental requirements; omit source HP rate, dying rules, and segment restoration. |
| Sirocco Breath (action) | Push / Pull; candidate-with-decision | A successful breath hit pushes one legal hex. Retain the breath profile and recharge; do not grant an unlimited ranged rider. **Decision:** Bind the limited breath profile and recharge before enabling. |

Intentional omissions: Fog Vision.

### Sedacthy Warband

[Original inventory](inventory.md#sedacthy-warband). Level 10. Proposed: **Delayed Damage, Fear**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Frenzied Feast (action) | Delayed Damage; candidate | Apply Delayed Damage on the source hit or critical-hit result, attached only to the named attack. Preserve its damage tag. Use one pending damage event and omit damage dice and multi-target scaling. |
| War Shriek (action) | Fear; candidate | Grant the paid Fear activity. Preserve visibility and recipient eligibility; omit source target counts and graded fear. War Shriek loses its additional hold; wordless delivery retains its language exemption. |

Intentional omissions: Sea Speech; Wavesense (Imprecise) 30 feet.

### Shackles Pirate Crew

[Original inventory](inventory.md#shackles-pirate-crew). Level 5. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Disarming Twist (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** After Scurvy Strike damages the target, spend 1 action for a Disarm check against its Reflex defence; weaken weapon attacks until recovery, and critical failure carries no self-penalty. Needs weapon-state support. |

### Shadow Host

[Original inventory](inventory.md#shadow-host). Level 9. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Light Vulnerability (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Attacks from creatures or objects in magical light count as magical against Shadow Host. Needs illumination and magical-damage predicates; ordinary daylight does not satisfy the source. |
| Shadow Spawn (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** When Steal Shadow reaches its source threshold, record a shadow spawn with its owner and expiry condition. Adding a battlefield unit requires summoning limits, deployment rules, and campaign ownership; do not create free reinforcements by default. |
| Slink in Shadows (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve the source hiding condition: Shadow Host uses shadows; scouts retain hidden/undetected state until a hostile action. Requires concealment and target awareness. |
| Steal Shadow (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** After Shadow Hand hits a living target, spend 1 action to apply enfeebled-like physical attack impairment. Record graded stacks up to four and the spawn threshold separately; do not turn every hit into automatic healing. |
| Void Healing (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve void immunity, vitality vulnerability, and the rule that only explicitly undead-healing void effects heal it. Ordinary void damage never heals. Requires damage/healing tags and eligible recipients. |

### Shambler Troop

[Original inventory](inventory.md#shambler-troop). Level 4. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Slow (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Start each activation with 2 actions and disable reactions. Apply independently of movement speed. Preserve the drawback even for the source named Fast Shambler Troop. |
| Void Healing (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve void immunity, vitality vulnerability, and the rule that only explicitly undead-healing void effects heal it. Ordinary void damage never heals. Requires damage/healing tags and eligible recipients. |

Intentional omissions: Grave Tide.

### Sinswarm

[Original inventory](inventory.md#sinswarm). Level 9. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Reactive Attack (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Sinful Assault (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** At 2/3 actions, Sinful Assault invokes the source Will save for Sinful Bite: sickness and a critical-result sin effect. Keep the seven-sin rotation across targets. This needs condition/source tracking, not seven independent free wounds. |
| Sinful Bite (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** At 2/3 actions, Sinful Assault invokes the source Will save for Sinful Bite: sickness and a critical-result sin effect. Keep the seven-sin rotation across targets. This needs condition/source tracking, not seven independent free wounds. |

Intentional omissions: Sin Scent.

### Skeleton Infantry

[Original inventory](inventory.md#skeleton-infantry). Level 11. Proposed: **Cavalry Charge, Weaken Defence, Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Form a Phalanx (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |
| Phalanx Charge (action) | Cavalry Charge + Weaken Defence; candidate | Use Cavalry Charge while the required phalanx/Guard stance is active; Weaken Defence on a successful hit. Omit source segment geometry and keep the common attack budget. |

### Skeleton Mob

[Original inventory](inventory.md#skeleton-mob). Level 6. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Void Healing (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve void immunity, vitality vulnerability, and the rule that only explicitly undead-healing void effects heal it. Ordinary void damage never heals. Requires damage/healing tags and eligible recipients. |

### Skirmishers

[Original inventory](inventory.md#skirmishers). Level 8. Proposed: **Terrain Passage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Among the Trees (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** In forest, spend 1 action to Take Cover and attempt Hide. Preserve hidden state until a hostile action; connect the hidden Volley precision rider only after concealment exists. |
| Forest Passage (passive) | Terrain Passage; candidate | Terrain Passage: woods. Omit greater-terrain upgrades and preserve barriers. |
| Longbow Barrage [Salvo] (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Longbow Barrage gets a proposed +2 attack benefit when fired from hidden/undetected state, representing its precision rider. End hidden state on the hostile action; current cover alone does not satisfy the source. |
| Stealthy Formation (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve the source hiding condition: Shadow Host uses shadows; scouts retain hidden/undetected state until a hostile action. Requires concealment and target awareness. |

### Sootsoldiers

[Original inventory](inventory.md#sootsoldiers). Level 10. Proposed: **Immobilize**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Ashen Smoke (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On crossing a source HP threshold or destruction, leave smoke at the troop’s hex for the encounter; smoke obscures both directions until wind clears it. This is a passive trigger, not a reaction. |
| Incinerating Grasp (action) | Immobilize; candidate | Apply Immobilize on a critical hit by the linked melee attack. Collapse source hit/investment gates, paid or free follow-up checks, and restraint grades into this one rider. Omit carrying and use the one-action release. |
| Seething Flash (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Offer the source 1-action double Move and fire burst; a critical hit exposes. This unusually efficient action needs a separate profile and a balance check, with all creatures as possible recipients. |

Intentional omissions: Smoke Vision.

### Sootsoldiers (The Radiant Host)

[Original inventory](inventory.md#sootsoldiers-the-radiant-host). Level 10. Proposed: **Immobilize**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Ashen Smoke (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On crossing a source HP threshold or destruction, nearby creatures make Reflex saves; failure dazzles and negates invisibility for the encounter. Keep this Radiant Host variant separate from ordinary smoke. |
| Incinerating Grasp (action) | Immobilize; candidate | Apply Immobilize on a critical hit by the linked melee attack. Collapse source hit/investment gates, paid or free follow-up checks, and restraint grades into this one rider. Omit carrying and use the one-action release. |
| Seething Flash (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Offer the source 1-action double Move and fire burst; a critical hit exposes. This unusually efficient action needs a separate profile and a balance check, with all creatures as possible recipients. |

Intentional omissions: Smoke Vision.

### Soul Swarm

[Original inventory](inventory.md#soul-swarm). Level 13. Proposed: **Fear**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Frightful Presence (passive) | Fear; candidate | Use adjacent hostile Fear. Preserve fear immunity and source eligibility; omit larger radii, graded fear, reaction locks, and action loss. |

Intentional omissions: Constant Spells.

### Special Forces Unit

[Original inventory](inventory.md#special-forces-unit). Level 16. Proposed: **—**.

Its ordinary profile or intentionally omitted details supply the first-pass classification; no extra ability is proposed.

### Speiroikos

[Original inventory](inventory.md#speiroikos). Level 3. Proposed: **Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Diverted Fury (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** An adjacent/short-range enemy can spend 1 action and pass Deception against the source DC to redirect the troop’s next activation into self-damage. Requires a compelled-activity state and an explicit source of the command. |
| Dragonhide (action) | Guard; candidate | Use Guard through Guard. Omit the source area/splash weakness reduction and use the common expiry. |
| Kestros Volley (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** The damage expression uses bleed without the persistent marker; confirm PF2e bleed semantics/source automation before enabling a delayed-damage rider. Proposed conversion is one pending bleed damage where the source intends persistent bleed; retain the source hit gate and breath recharge. |

### Stumpfield War Chanter Choir

[Original inventory](inventory.md#stumpfield-war-chanter-choir). Level 7. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| In Our Wake, Hell Will Break! (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Give allies in the aura +1 to mental saves. Keep this a continuous range-limited bonus and do not double count other circumstance bonuses. |
| Hark! The Goblins Chanters Sing! (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to impair concentration on failed Will saves among eligible targets in short range; grant battle-long immunity after the attempt. Preserve the source segment target cap. |

### Stumpfield War Saboteurs

[Original inventory](inventory.md#stumpfield-war-saboteurs). Level 6. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Duck, Duck, Loose! (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** On a Strike or Reflex-targeting effect, spend a reaction to gain cover against it through the next activation, but lose 1 action next activation. Apply the cover before resolving the incoming effect. |
| Rush and Steal (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to Move twice and pick up/steal eligible objects along the route, limited by segments. Requires inventory/object identities; do not replace theft with arbitrary Morale damage. |
| Slapstick Traps (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** After a successful Hide, spend 2 actions to Sneak twice and leave trip/damage traps along the route. First activation of a trap resolves damage and critical knockdown, then leaves difficult terrain. Requires hidden movement and route hazards. |

### Sun Warrior Brigade

[Original inventory](inventory.md#sun-warrior-brigade). Level 12. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Walkena's Radiance (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Walkena’s Radiance uses a Fortitude-targeting fire cone. A hit dazzles; a critical hit blinds through the next activation. Preserve distinct sight effects and the reduced cone at two segments. |

### Swashbucklers

[Original inventory](inventory.md#swashbucklers). Level 9. Proposed: **Combat Bonus, Weaken Defence**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Advancing Flourish (action) | Weaken Defence; candidate | Grant a paid Weaken Defence activity. Omit skill ranks, the source extra movement, and attacker-only targeting of the bonus; Weaken Defence benefits every attacker until expiry. |
| Deny Advantage (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Ignore flanking exposure from enemies at or below the source level limit. Deny Advantage also covers hidden/surprise sources; Watchful only covers flanking. Do not remove exposure from other causes. |
| Sneak Attack (passive) | Combat Bonus; candidate | Combat Bonus: +1 melee against an Exposed target. This deliberately collapses prone/off-guard causes into the game condition; avoid duplicate flanking bonuses. |

### Swiftrun Clergy

[Original inventory](inventory.md#swiftrun-clergy). Level 6. Proposed: **—**.

Its ordinary profile or intentionally omitted details supply the first-pass classification; no extra ability is proposed.

### Sylirican Phalanx

[Original inventory](inventory.md#sylirican-phalanx). Level 11. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| In the Shade (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** When eligible ranged/area damage targets the phalanx, spend a reaction to prevent 1 extra Health loss or suppress its area weakness for that event. Requires typed resistance/weakness and a clear pre-damage interception point. |
| Slow to Turn (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** When flanked, increase the Defence penalty to -3 as the source states. Distinguish flanking from other exposure causes. |

### Terra-Cotta Garrison

[Original inventory](inventory.md#terra-cotta-garrison). Level 13. Proposed: **Guard**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Attack of Opportunity (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Shield Block (reaction) | Block; future-reaction | Future Block against physical damage while the source shield/protection prerequisite holds. Omit Hardness and shield damage. |
| Raise Shields (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |

### Thrune Champion Army

[Original inventory](inventory.md#thrune-champion-army). Level 11. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Wrath of Asmodeus (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action before Massacre. If it hits, invoke the source Will save for fear; critical failure also impairs casting and adds one pending fire damage. Consume the preparation on that next action. |

### Town Militia

[Original inventory](inventory.md#town-militia). Level 7. Proposed: **Terrain Passage, Resist Fear and Rout / Hold Ground, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| City Passage (passive) | Terrain Passage; candidate | Terrain Passage: urban ground. Preserve walls and blocked edges. |
| Hold the Line (passive) | Resist Fear and Rout / Hold Ground; candidate | Use Resist Fear and Rout. Replace source graded fear recovery, threshold-based save upgrades, and extra bonuses with the common conditional +2. |
| Seek Quarry (passive) | Combat Bonus; candidate | Combat Bonus: +1 melee against one quarry marked before battle. This deliberately replaces tracking Perception with a battlefield hunting specialty. |

Intentional omissions: Toughened Soldiers.

### Troll Marauders

[Original inventory](inventory.md#troll-marauders). Level 8. Proposed: **Regeneration, Fear, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Brutal Assault (passive) | Fear; candidate | After the attached melee attack deals damage, resolve the separate Will gate for Fear. Use the normal game ability DC and omit source fear grades. |
| Chase Prey (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** This inherited individual-creature ability refers to named Strikes that the troop action list does not expose. Preserve the prerequisite and propose a named Attack follow-up (grab, trip, rend, or cleave as applicable), but require an explicit troop binding before enabling it. Rend also requires redesign because the game permits one attack per activation. |
| Demoralize (action) | Fear; candidate | Grant the paid Fear activity. Preserve visibility and recipient eligibility; omit source target counts and graded fear. War Shriek loses its additional hold; wordless delivery retains its language exemption. |
| Easily Misled (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Apply -4 to Perception defence against Deception only. This makes feints and ambushes easier without weakening ordinary Defence. |
| Frightening Foe (passive) | Combat Bonus; candidate | Combat Bonus: +1 on the unit’s granted Fear activity. This requires the fear activity; it creates no new attack or fear delivery. |
| Furious Flailing (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** When electricity/fire damage lands, spend a reaction for a claw attack against a random eligible adjacent creature, including allies. If burning, also attempt the source flat recovery check. Source Strike binding requires review. |
| Regeneration 25 (Deactivated by Electricity or Fire) (passive) | Regeneration; candidate | Use recurring Regeneration. Keep source damage suppressors and environmental requirements; omit source HP rate, dying rules, and segment restoration. |
| Rend (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** This inherited individual-creature ability refers to named Strikes that the troop action list does not expose. Preserve the prerequisite and propose a named Attack follow-up (grab, trip, rend, or cleave as applicable), but require an explicit troop binding before enabling it. Rend also requires redesign because the game permits one attack per activation. |

Intentional omissions: Darkvision.

### Twigjack Bramble

[Original inventory](inventory.md#twigjack-bramble). Level 6. Proposed: **Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Clear Cut (action) | Cavalry Charge; candidate | Use Cavalry Charge against one target. Keep source limited uses; omit shared-space routes, damage to additional units, and separate knockdown/push riders. |
| Mass Bramble Jump (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a separate teleport action with the source range, cost, prerequisites, and recharge. Bramble Jump requires undergrowth at both ends; Planar Step recharges in 1d4 rounds. Teleport avoids traversal and opportunity triggers. |

### Twilight Talon Infiltrator Team

[Original inventory](inventory.md#twilight-talon-infiltrator-team). Level 8. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Now!! (passive) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Now!! has a trigger but is typed passive. Proposed behavior is a one-time automatic ambush Attack when disguise breaks, with extra critical precision. Preserve its source type; settle timing and attack-budget treatment rather than silently spending a reaction. |
| Undercover (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** After the source two-hour setup, represent a same-or-lower-level humanoid troop/noncombatant disguise until broken. Requires concealed identity and appropriate resources; retain the original creature identity for imports. |
| Faces in the Crowd (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** While the infiltrators appear to be noncombatants, allow shared-space passage. Remove it when the disguise breaks; preserve Undercover prerequisites. |

### Ulat-Kini Kidnappers

[Original inventory](inventory.md#ulat-kini-kidnappers). Level 9. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Spoils of War (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Spoils of War refers to Let ’em Have It, but Ulat-Kini Kidnappers has Claw and Trident. Proposed binding is the renamed melee attack, with paid theft on hit; record the correction before enabling it. |

### Umok Beastspeaker Circle

[Original inventory](inventory.md#umok-beastspeaker-circle). Level 7. Proposed: **—**.

Its ordinary profile or intentionally omitted details supply the first-pass classification; no extra ability is proposed.

Intentional omissions: Animal Empathy.

### Valkyrie Tempest

[Original inventory](inventory.md#valkyrie-tempest). Level 17. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Bolster the Wounded (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** At the end of its activation while injured, spend a reaction to recover 1 Health within its current segment ceiling. Add a ceiling record before enabling this; ordinary healing must not regrow lost segments. |
| Tempest of Battle (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Once per day, spend 2 actions for the large enemy-only electricity emanation. Keep it as a limited signature activity; do not discard it or turn it into an unlimited ranged Volley. |

Intentional omissions: Constant Spells.

### Vanth Guardian Flock

[Original inventory](inventory.md#vanth-guardian-flock). Level 13. Proposed: **Fear**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Frightful Presence (passive) | Fear; candidate | Use adjacent hostile Fear. Preserve fear immunity and source eligibility; omit larger radii, graded fear, reaction locks, and action loss. |
| Reactive Relocation (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** After an incoming attack hit resolves, spend a reaction to teleport to a legal hex within converted source range. Damage lands before relocation; blocked landing choices cannot undo the hit. |
| Guardians' Curse (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Up to three times per day, spend 2 actions to apply Will-gated casting impairment in contact. Preserve degree-dependent duration and the dying-trigger escalation in the affliction record; permanent effects require campaign handling. |

### Velociraptor Pack

[Original inventory](inventory.md#velociraptor-pack). Level 5. Proposed: **Cavalry Charge, Fear**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Puff Up (passive) | Fear; candidate | Grant the paid Fear activity. Preserve visibility and recipient eligibility; omit source target counts and graded fear. War Shriek loses its additional hold; wordless delivery retains its language exemption. |
| Raptor Leap (action) | Cavalry Charge; candidate | Use Cavalry Charge with a legal existing movement mode and the normal Charge budget. Preserve limited uses and source prerequisites. Omit extra movement, leaping/altitude exceptions, deafening, draining, casting impairment, and free follow-up actions. |

### Veteran War Priests

[Original inventory](inventory.md#veteran-war-priests). Level 17. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Fervent Casting (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** Fervent Casting is typed as a reaction but states no trigger. Proposed behavior is a once-per-day self-only Cast discount of 1 action, minimum 1; source review must settle when its reaction can be spent. |
| Troop Spellcasting (passive) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Troop Spellcasting references pf2e-creature-crispr localization, absent from the PF2e checkout. Preserve the unresolved key and actual spell items; do not infer its rule from a same-name PF2e ability. |

Intentional omissions: Consecrated.

### Vicious Levaloch Squad

[Original inventory](inventory.md#vicious-levaloch-squad). Level 18. Proposed: **Immobilize, Combat Bonus, Terrain Passage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Hellstrider (passive) | Terrain Passage; candidate | Terrain Passage: ordinary ground. Omit hazard immunity and liquid-depth exceptions; retain legal movement modes and barriers. |
| Barbed Net Barrage (action) | Immobilize; candidate | Offer Immobilize as a non-damaging Volley replacement. Omit the source damage, graded slow/exposure, and barb damage on escape; keep the existing damage profile as the alternative. |
| Merciless Tridents (action) | Combat Bonus; candidate | Combat Bonus: +1 melee against a target with Immobilize or Suppression. Deliberately use these two game conditions in place of the source physical-weakness/restraint list. |
| Vicious Cruelty (passive) | Combat Bonus; candidate | Combat Bonus: +1 melee against a target with Immobilize or Suppression. Deliberately use these two game conditions in place of the source physical-weakness/restraint list. |

Intentional omissions: +1 Status to All Saves vs. Magic.

### Viking Guard

[Original inventory](inventory.md#viking-guard). Level 11. Proposed: **Guard, Resist Fear and Rout / Hold Ground**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| +2 Status to All Saves vs. Fear (passive) | Resist Fear and Rout / Hold Ground; candidate | Resolve in fear-resistance mode. Replace this positive fear/Intimidation-only source bonus with the common +2 and deduplicate prepared statistics. |
| Sacrifice (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** When the designated adjacent ward loses Health, spend a reaction to split damage with the guard. Proposed rounding: the guard takes the odd point. Apply the split before injury and avoid recursive redirection. |
| Guard Charge (action) | Guard; candidate | Use Guard through the normal Guard activity. Share with one adjacent eligible ally only where the source supports it. Preserve shield/designated-ward requirements; omit extra save bonuses, cover grades, and separate retaliation. |
| Shield Wall (passive) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** Shield Wall is typed passive but describes double movement and lets the charge follow as a reaction. Proposed activity costs 2 actions, gives the guard movement defence, and spends the ally’s reaction to follow. Source review must settle the missing cost. |

### Vordine Legion

[Original inventory](inventory.md#vordine-legion). Level 10. Proposed: **Weaken Defence**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Reactive Attack (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Burning March (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to Move and leave a fire hazard on crossed hexes for the encounter. Grounded units entering or starting in it save against 1 damage, at most once per activation. |
| Impaling Barrage (action) | Weaken Defence; candidate | Weaken Defence on a successful hit by this specific attack. Omit a follow-up Trip check and separate prone/clumsy values. Preserve an alternative attack as a separate local attachment. |

Intentional omissions: +1 Status to All Saves vs. Magic.

### Watchmage Squadron

[Original inventory](inventory.md#watchmage-squadron). Level 10. Proposed: **—**.

Its ordinary profile or intentionally omitted details supply the first-pass classification; no extra ability is proposed.

Intentional omissions: Invisibility Scan.

### Wight Battalion

[Original inventory](inventory.md#wight-battalion). Level 9. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Final Grudge (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** Immediately before source segment loss, spend a reaction to retaliate against adjacent enemies for at most 1 damage each. Preserve the pre-loss timing and one shared reaction budget. |
| Fueled by Spite (passive) | Damage Absorption; candidate-with-decision | Damage Absorption when the linked curse actually removes Health. It grants no healing and never triggers merely on applying the curse. **Decision:** The curse and its Health-removal event are outside the first catalogue. Bind that event before enabling; never substitute a generic melee-hit trigger. |
| Void Healing (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve void immunity, vitality vulnerability, and the rule that only explicitly undead-healing void effects heal it. Ordinary void damage never heals. Requires damage/healing tags and eligible recipients. |
| Corrupting Spite (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** After Hateful Daggers hits, use the source Fortitude save. A failed save applies drained-like impairment; later stages disrupt alliance recognition. Keep death-to-wight creation and the four-stage schedule as a separate affliction/outcome extension. |
| Hateful Daggers (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Hateful Daggers exposes hit targets to Corrupting Spite. Resolve that curse once through its own Fortitude save; link Fueled by Spite only to actual later HP loss. |

### Winter Wolves

[Original inventory](inventory.md#winter-wolves). Level 10. Proposed: **Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Avenging Bite (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** When a nearby enemy attacks an ally, spend a reaction for a cold retaliation check capped at 1 damage. The source trigger is an attack, not necessarily a hit. |
| Buck (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** Retain the mount/command trigger and Reflex save; failure ejects and exposes the rider. Requires rider identities. Never translate this into an ordinary defensive strike against every adjacent troop. |
| Knockdown (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** This inherited individual-creature ability refers to named Strikes that the troop action list does not expose. Preserve the prerequisite and propose a named Attack follow-up (grab, trip, rend, or cleave as applicable), but require an explicit troop binding before enabling it. Rend also requires redesign because the game permits one attack per activation. |
| Pack Attack (passive) | Combat Bonus; candidate | Combat Bonus: +1 melee while at least two distinct allied units also threaten the target. Preserve the ally-count requirement; members inside this troop do not count as allies. |
| Winter Breath (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Keep a separate 2-action short-range breath profile with its source damage tag. After use, roll the source 1d4-round recharge; do not import it as an unlimited ordinary Volley. |

### Wolf Pack

[Original inventory](inventory.md#wolf-pack). Level 6. Proposed: **Weaken Defence, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Harry Prey (action) | Weaken Defence; candidate | Weaken Defence on a successful hit by this specific attack. Omit a follow-up Trip check and separate prone/clumsy values. Preserve an alternative attack as a separate local attachment. |
| Snap and Bite [Battle] (action) | Combat Bonus; candidate | Combat Bonus: +1 melee against an Exposed target. This deliberately collapses prone/off-guard causes into the game condition; avoid duplicate flanking bonuses. |

### Woodland Scouts

[Original inventory](inventory.md#woodland-scouts). Level 8. Proposed: **Terrain Passage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Among the Trees (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** In forest, spend 1 action to Take Cover and attempt Hide. Preserve hidden state until a hostile action; connect the hidden Volley precision rider only after concealment exists. |
| Forest Passage (passive) | Terrain Passage; candidate | Terrain Passage: woods. Omit greater-terrain upgrades and preserve barriers. |
| Longbow Barrage (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Longbow Barrage gets a proposed +2 attack benefit when fired from hidden/undetected state, representing its precision rider. End hidden state on the hostile action; current cover alone does not satisfy the source. |
| Stealthy Formation (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve the source hiding condition: Shadow Host uses shadows; scouts retain hidden/undetected state until a hostile action. Requires concealment and target awareness. |

### Wrath Riot

[Original inventory](inventory.md#wrath-riot). Level 16. Proposed: **Fear**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Frightful Presence (passive) | Fear; candidate | Use adjacent hostile Fear. Preserve fear immunity and source eligibility; omit larger radii, graded fear, reaction locks, and action loss. |
| Serenity Vulnerability (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** When this troop fails a qualifying mass control effect, apply 1 extra mental damage once for that event. Preserve the source minimum four-creature reach and exact eligible conditions. |
| Spores of Wrath (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** At activation start near Wrath Riot, non-demons take poison damage and save against persistent piercing vines. Preserve holy-water/holy-effect removal and prevent unlimited repeated ticks in the compressed Health scale. |
| Festival of Ruin (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Retain a distinct expanding electricity burst around the troop, with non-demon targeting and variable action cost. Its emanation is not a ranged Volley; multi-target resolution needs its own profile. |

Intentional omissions: Telepathy 100 feet; +1 Status to All Saves vs. Magic; Demonic Tide.

### Wyvern Flight

[Original inventory](inventory.md#wyvern-flight). Level 12. Proposed: **Delayed Damage, Combat Bonus**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Flight (passive) | Combat Bonus; candidate | Combat Bonus: +1 melee Defence against non-fliers while the unit can fly. Preserve flight as imported movement; omit the extra Battle-save benefit. |
| Grab (action) | —; source-decision | Resolve the source ambiguity before granting a new ability. **Decision:** This inherited individual-creature ability refers to named Strikes that the troop action list does not expose. Preserve the prerequisite and propose a named Attack follow-up (grab, trip, rend, or cleave as applicable), but require an explicit troop binding before enabling it. Rend also requires redesign because the game permits one attack per activation. |
| Powerful Dive (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** After sufficient forward flight and descent, spend 2 actions for one Attack. On a hit choose grab or expose, using member-size eligibility. Requires altitude and carried-target rules for the full source behavior. |
| Punishing Momentum (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Only after this activation’s Powerful Dive grabs a target, spend 1 action to carry/drop it or make the source improved stinger attack. Requires carried targets and an explicit exception to the single-attack budget. |
| Reactive Attack (reaction) | Retaliate; future-reaction | Future Retaliate with this source trigger set. Omit extra sweep targets and critical interruption. Preserve source restrictions on vulnerable activities. |
| Savage (reaction) | —; reaction-decision | Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity. **Decision:** When a held target critically fails Escape, spend a reaction for a stinger attack capped at 1 damage. Requires a stinger-to-troop profile binding; do not trigger on every failed maneuver. |
| Wyvern Venom (passive) | Delayed Damage; candidate | Apply poison-tagged Delayed Damage on a successful melee hit with no extra save. Omit linked enfeebled while poison persists. |

Intentional omissions: Darkvision.

### Xulgath Army

[Original inventory](inventory.md#xulgath-army). Level 6. Proposed: **Delayed Damage**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Stench (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On entry/start in range, use the source Fortitude save for sickness; critical failure also reduces actions or speed as the variant states. Keep one-minute immunity and the Ravening recovery penalty. Do not replace this with fear. |
| Rend Flesh (action) | Delayed Damage; candidate | Apply Delayed Damage on the source hit or critical-hit result, attached only to the named attack. Preserve its damage tag. Use one pending damage event and omit damage dice and multi-target scaling. |

### Xulgath Dinosaur Cavalry

[Original inventory](inventory.md#xulgath-dinosaur-cavalry). Level 13. Proposed: **Cavalry Charge**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Stench (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On entry/start in range, use the source Fortitude save for sickness; critical failure also reduces actions or speed as the variant states. Keep one-minute immunity and the Ravening recovery penalty. Do not replace this with fear. |
| Trample (action) | Cavalry Charge; candidate | Use Cavalry Charge against one target. Keep source limited uses; omit shared-space routes, damage to additional units, and separate knockdown/push riders. |

Intentional omissions: Mounted Troop.

### Xulgath Ravening

[Original inventory](inventory.md#xulgath-ravening). Level 4. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Stench (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** On entry/start in range, use the source Fortitude save for sickness; critical failure also reduces actions or speed as the variant states. Keep one-minute immunity and the Ravening recovery penalty. Do not replace this with fear. |
| Infected Wounds (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Fang and Claw gains a proposed +2 attack benefit only against a target sickened by this troop’s stench. Track the source of sickness; unrelated frightened/suppressed conditions do not qualify. |
| Sharpened Advance (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 2 actions to Volley and then Step or move toward the attacked area within the source allowance. Preserve direction and safe-Step distinction; no extra Attack follows. |

### Zecui Horde

[Original inventory](inventory.md#zecui-horde). Level 11. Proposed: **Immobilize**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Harden Chitin (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Spend 1 action to resist 1 Health loss per round from eligible damage until this troop moves. Preserve mental/spirit exceptions and remove the stance on any move action. |
| Mucus Deluge (action) | Immobilize; candidate | Grant a two-action non-damaging Volley replacement; a successful game attack check applies Immobilize. Replace source movement/action penalties with root and a one-action release. Omit disease exposure. |
| Subterranean Ambush (action) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** From a prepared underground position, spend 1 action to emerge, Move, and Attack. Preserve terrain and preparation requirements; consumes the normal attack budget. |

Intentional omissions: Zecui Larvae.

### Zombie Leshy Horde

[Original inventory](inventory.md#zombie-leshy-horde). Level 2. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Slow (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Start each activation with 2 actions and disable reactions. Apply independently of movement speed. Preserve the drawback even for the source named Fast Shambler Troop. |

Intentional omissions: Grave Tide.

### Zombie Shamblers

[Original inventory](inventory.md#zombie-shamblers). Level 4. Proposed: **—**.

| Source feature | Classification | Conversion or decision |
|---|---|---|
| Slow (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Start each activation with 2 actions and disable reactions. Apply independently of movement speed. Preserve the drawback even for the source named Fast Shambler Troop. |
| Void Healing (passive) | —; catalogue-decision | No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically. **Decision:** Preserve void immunity, vitality vulnerability, and the rule that only explicitly undead-healing void effects heal it. Ordinary void damage never heals. Requires damage/healing tags and eligible recipients. |

Intentional omissions: Grave Tide.

Regenerate and validate with `node scripts/classify-troop-catalogue.mjs`. This checks source hashes, full review coverage, catalogue references, duplicate grants, and reaction separation. It changes design artifacts only.
