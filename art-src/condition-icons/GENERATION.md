# Condition icon generation

Date: 2026-09-18.

Mode: built-in image generation. Art direction follows ICONS.md and the existing action and cast icons. The generations are 1024 × 1024 lossless WebP with alpha transparency, kept in `originals/`. The shipped files in `public/art/condition-icons/` are those resized to 512 × 512 at WebP quality 80. Export scales each generated canvas to 870 × 870 and centres it on a transparent 1024 × 1024 canvas. The first ten replace the placeholders; the other ten are assets for future popups.

## Shared generation prompt

Use case: stylized-concept. Asset type: small fantasy battlefield status icon. Create ONE finished icon, square 1024x1024 canvas, actual transparent RGBA background. Match the supplied existing game artwork: detailed painted fantasy inventory art, convincingly worn materials, sculptural volume, crisp edges, strong upper-left highlights and rich shadows. One clear centered composite subject fills about 85% of the square, readable as a bold silhouette at 30 px. Keep the whole subject inside the canvas. No text, numerals, labels, border, frame, badge, watermark, backdrop, checkerboard, or cast shadow on a background. Preserve actual alpha transparency around the object and through gaps. Reference images are style references only, not edit targets. 

## Asset prompts

### wounds.webp

A deep red heart of enamelled metal with a bright worn gold rim. Plain classic symmetrical heart silhouette, slight sculptural thickness, subtle enamel wear. The plainest icon in the set. No cross, blood, drops, flames, wings, or additional objects.

Style references: action-icons/rally.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-4458df59-1c9c-44bc-afb4-4439ac49836c.png`.

### morale.webp

A regimental battle standard on a short wooden pole with a small gold finial. Rich crimson swallow-tailed banner with gold edging, caught mid-flutter. Match the crimson cloth and worn gilding of the horn's banner in the reference. Broad banner and short pole make a compact square silhouette. No horn.

Style references: action-icons/rally.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-1c12076a-2817-4e28-a654-b318c37b922d.png`.

### frightened.webp

A worn soldier's steel helmet with a wide-eyed, shrieking ghostly face of violet smoke rising out of it. Clear eye and mouth shapes in a single violet spectral plume, compact silhouette. Violet is the only strong colour; metal is desaturated. No body.

Style references: action-icons/block.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-070e4754-603d-4fdb-889f-bf8e476ddef3.png`.

### stunned.webp

A dented worn steel soldier's helmet knocked askew with exactly three small gold stars circling above it. Bold compact silhouette, helmet dominates. Gold stars are distinct and close to the helmet. No face or body.

Style references: action-icons/block.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-974d04df-c772-4419-8e2f-00e15d09282a.png`.

### rooted.webp

The same armoured leather boot design as the reference: dark brown leather, bronze buckles, scuffed steel toe and ankle armour. ONE boot planted on a tiny clump of ground, bound firmly at the ankle by thick twisting thorned roots. Roots wrap and restrain it, large enough to read at tiny size. No arrows. Ground is a tiny attached prop, outside remains transparent.

Style references: action-icons/withdraw.webp.

Final refinement prompt: Edit this icon: remove the raised foreground boot completely. Show exactly ONE boot, planted flat on its sole, in side view with toe pointing right; thick thorned roots bind its ankle and sole firmly into a tiny ground clump. Preserve the brown leather, bronze buckles, scuffed steel armour, painterly materials and upper-left lighting. Actual transparent background. Full subject inside square with 7% margin.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-1268a178-07ab-4378-be17-1d59185eca71.png`.

### pinned.webp

ONE armoured leather boot matching the reference's dark brown leather, bronze buckles, scuffed steel toe and ankle armour, firmly staked to the ground by exactly three arrows driven through the projecting sole edge and into a tiny clump of earth around it. Clear long wooden arrow shafts and feather fletching. The arrows pin the boot; no person, injury, blood, roots, or vines. Compact readable silhouette, transparent outside prop. Critical: reference contains two boots; extract only the design of ONE boot. Show ONE single boot in side view flat on its sole, toe to the right. Do not copy the two-boot pose.

Style references: action-icons/withdraw.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-6886afb8-754b-443d-837e-55dcdb368fc2.png`.

### suppressed.webp

A worn medieval kite shield held low and tilted overhead as shelter, bristling with five stuck arrows, with three more arrows raining down from upper right. Shield is the dominant single subject with a dense clear fan of arrow shafts. Convey volume of fire. Nobody visible or hurt. Steel rim, worn blue painted wood. Transparent outside object.

Style references: action-icons/block.webp.

Final refinement prompt: Edit this icon: rotate and foreshorten the shield to be held nearly horizontally overhead as shelter under a barrage, low angled overhead shield with five stuck arrows and three incoming arrows falling diagonally from upper right. No person. Keep worn blue wood and steel, gold lion, upper-left lighting, crisp fantasy painted finish and actual transparency. Reduce cloth. Complete arrows and shield inside square with 7% empty margin.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-fea1fa90-09e8-47af-89ef-624b389dde5a.png`.

### exposed.webp

The reference blue heater shield with worn gold lion, central steel boss and riveted steel rim, split by a large jagged crack from its upper right rim deep into the centre. A bright illuminated broken edge frames an obvious open transparent gap through the shield. Broad fracture must read at 30px. Shield dominates, reduce cloth behind it so the gap is visible. Preserve its heraldic appearance.

Style references: action-icons/block.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-341e2647-30f7-4cd3-ac58-7838130bdc82.png`.

### persistent.webp

A torn strip of crimson banner cloth with worn gold edging, still burning along its lower edge with orange-gold fire, exactly three clear embers dripping from it. Fire matches the attack spell reference. Cloth remains the dominant readable silhouette. No pole, sword, separate objects, or background.

Style references: action-icons/rally.webp, cast-icons/buff-attacks.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-d29a0a36-3328-4857-a144-eb46553a6dae.png`.

### routed.webp

A regimental crimson and gold swallow-tailed battle standard thrown down: short wooden pole snapped into two obvious jagged pieces, small gold finial, banner torn and trampled on a small attached patch of dirt with one clear muddy boot print across the crimson cloth. Match the morale standard reference. Compact diagonal arrangement. No actual boot, no standing pole, no background beyond the tiny dirt prop.

Style references: generated morale icon.

Final refinement prompt: Edit the supplied routed icon. Change its pose dramatically: show a TOP-DOWN view of the destroyed battle standard LYING FLAT ON THE GROUND. The snapped wooden pole lies HORIZONTALLY across the lower part of the icon in two separate jagged broken pieces, small gold finial at far left. The crimson-and-gold swallow-tailed cloth lies collapsed, heavily crumpled and folded in a low heap above the pole, pressed into a tiny irregular dirt patch, with a large muddy boot print across its centre. Preserve the same worn crimson velvet, gold lion design, aged gold trim and painterly metal/wood textures. The banner has no upright edge and no flutter; it has completely fallen. One compact destroyed standard prop, actual transparent background around the tiny dirt patch, square composition, upper-left light, no text, no frame, no actual boot, no standing staff. Strongly distinct silhouette from an upright waving flag.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-27848f1d-ed0d-4db0-8fba-48db35ec765b.png`.

### sure-strike.webp

Two unnumbered twenty-sided dice made of gold, one bright and forward, one dim behind it, wrapped together in a single curved orange-gold energy slash. Clear triangular d20 facets; faces carry no numerals, letters, symbols, or pips. One compact grouped icon with vivid orange-gold spell light matching the reference.

Style references: cast-icons/buff-attacks.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-94947ddc-36e4-4818-bc0c-0cf955aa6b4b.png`.

### wrath.webp

A sword blade wreathed in orange-gold fire from guard to tip, embers trailing behind it. Match the reference sword and gold attack magic, but show actual vivid licking flames around the blade. Diagonal compact sword composition. One sword, no background.

Style references: cast-icons/buff-attacks.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-6046ce99-cb87-449b-85c1-e921b5c4f861.png`.

### hasted.webp

A compact worn brass and wood hourglass with orange-gold sand visibly streaming UPWARD against gravity inside the glass, luminous sand gathers toward the top, and short orange-gold speed streaks behind it. Bold hourglass silhouette, upper and lower bulbs clearly visible. Match orange-gold offense magic of the reference.

Style references: cast-icons/buff-attacks.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-38ade735-738a-44a0-8148-f22f24588c7a.png`.

### warded.webp

A SINGLE translucent sapphire hexagonal magical pane floating upright at a slight three-quarter angle, with ONE brilliant blue-white impact glint where a blow is about to land. Bold six-sided faceted outline and subtle glass-like internal light; simple solitary hexagonal pane. Sapphire magic matches reference. No shield object, dome, weapon, or spherical bubble.

Style references: cast-icons/buff-defenses.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-eb8d0ef9-a932-4c9d-9a5b-5ae54c26cbea.png`.

### stoneskin.webp

A single clenched gauntleted fist made of rough grey granite, fine sapphire magical light in its cracks. Bold knuckles, segmented stone armour, short wrist cuff; one compact readable fist. Sapphire glow matches reference, granite remains dominant.

Style references: cast-icons/buff-defenses.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-3f64273b-64db-4054-8d5b-9dd78b19e895.png`.

### aegis.webp

A complete protective dome of interlocking translucent sapphire hexagons over a small plain steel shield. The dome is the dominant subject, clear curved hemisphere with closed protective coverage, brighter and more complete than a single magical pane. Strong sapphire and blue-white edges matching reference magic. Small shield has no heraldry, no ornate emblem. No background.

Style references: cast-icons/buff-defenses.webp.

Final refinement prompt: Edit this defensive icon: change only the round sphere barrier into a clearly hemispherical DOME with an arched top and a flat elliptical open-bottom rim. Make the plain metal shield smaller so it sits fully underneath this complete protective dome. Keep interlocking sapphire hexagons, brilliant blue-white light and painterly fantasy style. Square icon with actual transparent background. One shield beneath one hemispherical dome. Keep full silhouette inside canvas.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-e1fedb51-13ef-4ec3-b69e-35257d12a5a5.png`.

### burst-of-speed.webp

The winged boot from the reference, in mid-stride: one dark brown leather boot with worn metal trim and a white feathered ankle wing. ONE long cyan wind ribbon streams behind it in a sweeping curve. Compact dynamic forward movement, same cyan movement magic and materials as reference, one boot only.

Style references: cast-icons/buff-movement.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-ba55da3c-684b-410a-b2ae-fdd3b29ad38f.png`.

### sure-footing.webp

ONE armoured boot matching reference dark leather, bronze buckles and scuffed steel armour, stepping firmly across a tiny attached cluster of broken rocks and a narrow stream. Bright cyan magic glow under sole where it touches down. Boot dominates composition, ground and water minimal attached props, transparent around them. No roots, arrows, wings, or background. Critical: first reference contains TWO boots; use only its material and armour design. Render just ONE single boot with sole facing down, toe pointing right, no extra foreground boot.

Style references: action-icons/withdraw.webp, cast-icons/buff-movement.webp.

Final refinement prompt: Edit the single boot in this icon. Remove all three arrows and all dirt. Preserve exactly this ONE single upright brown leather and steel armoured boot, sole down and toe right. Place a tiny cluster of broken rocks and a narrow water stream under its sole; show the boot stepping firmly onto the rocks with cyan magical light at its sole contact. No second boot, no roots, no arrows. Same detailed painted fantasy style and upper-left lighting. Square canvas, actual transparent background, full subject with empty margins.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-6b868f15-5d5a-409d-a8da-cb768c38688a.png`.

### inspired.webp

The war horn from the reference: curved ivory horn, worn gold engraved bell and mouthpiece, crimson leather straps, with bright golden rays bursting out of its bell. Horn dominates compact diagonal composition. Remove hanging banner; show only the horn and golden rays. Same painterly worn fantasy materials.

Style references: action-icons/rally.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-203b24dd-4dc5-4861-b489-49404f6e3ec0.png`.

### guard.webp

A row of exactly THREE overlapping medieval heater shields, locked edge to edge, planted firmly on a tiny attached strip of earth. Match reference worn blue painted wood, gold heraldry, central bosses, and riveted steel rims. Clear three shield tops and three pointed bases, compact fan-like row filling square. No soldiers or extra objects. Outside the props is transparent.

Style references: action-icons/block.webp.

Selected source: `/Users/mark/.codex/generated_images/01a0b653-c328-7ac0-929e-17595b9c4867/exec-1ac489d5-7ea9-4747-9cf2-71f78249c2ac.png`.
