<script lang="ts">
  import PixiBoard from './PixiBoard.svelte';
  import InkPanel from './InkPanel.svelte';
  import MapLinesPanel from './MapLinesPanel.svelte';
  import { setLayout, setTextureLab, textureLab } from './texture-lab.svelte.js';
  import { mapSettings, persistMapSettings, setMapStyle } from './map-style.svelte.js';
  import { at, gridOf, type Wall } from '../engine/index.js';
  import type { BoardEventOf, Brush } from '../board/index.js';
  import {
    createTextureSample, defaultTextureSettings, DEFAULT_TREES, TERRAIN_GROUPS, TERRAIN_LABELS, TEXTURE_CHOICES, wallStates, type TerrainGroup,
  } from '../board/terrain-textures.js';
  import { IDENTITY_HSB } from '../board/layers/color.js';
  import { onDestroy } from 'svelte';
  import { useNotifications } from './notification-context.js';
  const notifications = useNotifications();
  onDestroy(() => notifications.dismiss('texture-storage'));

  const ELEVATION_LEVELS = [2, 1, 0, -1, -2];
  // Raw, like the board: one draw of the patches, replaced whole when a new layout is rolled.
  let sample = $state.raw(createTextureSample(textureLab.layout));
  // The lab edits the game board's own settings in place, so the map style chosen in the top
  // bar shows what was last set here.
  const settings = $derived(mapSettings.textures);
  const ink = $derived(mapSettings.ink);
  // Which map the lab is showing. Two styles over one board and one set of sample terrain:
  // textured surfaces, or the illustrated wash-and-pencil map. Each keeps its own settings.
  // The choice is the game board's own, so whatever the lab shows is what the game draws.
  const style = $derived(mapSettings.style === 'ink' ? 'ink' : 'textures');
  let selected = $state<TerrainGroup>('forest');
  let tab = $state<'textures' | 'global' | 'lines'>('textures');
  let pane: PixiBoard | undefined = $state();
  let bordersVisible = $state(true);
  let showWallStates = $state(false);
  let elevationMarks = $state(false);
  let compareHard = $state(false);
  // Raw, not deep state: the board is handed straight to Pixi, and a paint stroke announces
  // itself by replacing the object rather than by being watched cell by cell.
  let board = $state.raw(sample.board);
  let elevationLevel = $state<number | null>(null);
  const SHADOW_LEVELS = [{ key: 'level1', label: 'One step up' }, { key: 'level2', label: 'Two steps or more' }] as const;
  const appearance = $derived(style === 'ink' ? null : { settings, groups: sample.groups, compareHard, elevationMarks });
  const inkMap = $derived(style === 'ink' ? { settings: ink, groups: sample.groups, elevationMarks } : null);
  const brush = $derived<Brush | null>(elevationLevel === null ? null : { kind: 'elevation', level: elevationLevel });
  // Only while the elevation brush is down does a press mean the ground rather than the wall.
  const pickableEdges = $derived(elevationLevel === null ? Object.keys(board.walls) : []);
  const choice = $derived(TEXTURE_CHOICES[selected].find(t => t.id === settings.terrains[selected].texture));
  const grade = $derived(settings.terrains[selected].hsb);
  const count = $derived(Object.values(sample.groups).filter(group => group === selected).length);

  $effect(() => {
    if (!persistMapSettings()) notifications.show({ id: 'texture-storage', tone: 'warning', title: 'Changes could not be saved',
      message: 'Browser storage is unavailable. Changes last until you leave this page.' });
    else notifications.dismiss('texture-storage');
  });
  // A snapshot, like the terrain appearance: Pixi keeps the settings it is handed and cannot
  // subscribe to a nested Svelte mutation.
  $effect(() => { pane?.setGrid($state.snapshot(style === 'ink' ? ink.grid : settings.grid)); });
  $effect(() => { pane?.setBorders(bordersVisible); });
  // The board is painted in place, so a reset has to draw the layout again rather than reach
  // back into `sample` for heights that were edited out of it.
  function drawLayout(seed: number) {
    setLayout(seed);
    sample = createTextureSample(textureLab.layout);
    board = showWallStates ? { ...sample.board, walls: wallStates(sample.board) } : sample.board;
    elevationLevel = null;
  }
  // Swaps the walls alone, so heights painted on the layout survive the toggle.
  function toggleWallStates() {
    showWallStates = !showWallStates;
    board = { ...board, walls: showWallStates ? wallStates(board) : createTextureSample(textureLab.layout).board.walls };
  }
  /** Intact, battered, down, and round again — the three states a wall is drawn in. A wall of
   * one box has no battered state to stop at and simply flips. */
  function nextRemaining(wall: Wall): number {
    if (wall.remaining === 0) return wall.boxes;
    if (wall.remaining === wall.boxes) return Math.max(1, wall.boxes - 1);
    return 0;
  }
  function cycleWall(event: BoardEventOf<'edge'>) {
    const wall = board.walls[event.edge];
    if (!wall) return;
    board = { ...board, walls: { ...board.walls, [event.edge]: { ...wall, remaining: nextRemaining(wall) } } };
  }
  function paintElevation(event: BoardEventOf<'paint'>) {
    if (event.brush.kind !== 'elevation') return;
    const grid = gridOf(board);
    for (const key of event.cells) at(board, grid.parse(key)).elevation = event.brush.level;
    board = { ...board };
  }
  function setMin(value: number) {
    settings.trees.min = value;
    settings.trees.max = Math.max(value, settings.trees.max);
  }
  function setMax(value: number) {
    settings.trees.max = value;
    settings.trees.min = Math.min(value, settings.trees.min);
  }
  function compareKey(event: KeyboardEvent, held: boolean) {
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); compareHard = held; }
  }
</script>

<svelte:window onblur={() => compareHard = false} />

<div class="texture-lab">
  <header>
    <div class="heading"><span class="badge">Development</span><h1>Terrain lab</h1></div>
    <div class="styles" role="group" aria-label="Map style">
      <button class:active={style === 'textures'} aria-pressed={style === 'textures'} onclick={() => setMapStyle('textures')}>Textured</button>
      <button class:active={style === 'ink'} aria-pressed={style === 'ink'} onclick={() => setMapStyle('ink')}>Illustrated</button>
    </div>
    <button onclick={() => setTextureLab(false)}>← Game board</button>
  </header>
  <main>
    <section class="map" aria-label="Terrain sample board">
      <PixiBoard bind:this={pane} {board} terrainAppearance={appearance} {inkMap} fill
        mode={elevationLevel === null ? 'view' : 'paint'} {brush}
        {pickableEdges}
        onedge={cycleWall}
        onpaint={paintElevation}
        onbrush={(b) => { elevationLevel = b?.kind === 'elevation' ? b.level : null; }}
        oncell={(event) => { selected = sample.groups[event.cell]; }} />
      <div class="map-hint">
        {#if elevationLevel === null}Select a hex to edit its terrain, or a wall to cycle its state. Drag to pan · Scroll to zoom
        {:else}Drag to raise ground to {elevationLevel > 0 ? `+${elevationLevel}` : elevationLevel}. Right-drag levels it back to 0.{/if}
      </div>
      <div class="map-tools">
        {#if style === 'ink'}
          <label><input type="checkbox" bind:checked={ink.grid.visible} /> Hex grid</label>
        {:else}
          <label><input type="checkbox" bind:checked={settings.grid.visible} /> Hex grid</label>
        {/if}
        <label><input type="checkbox" bind:checked={bordersVisible} /> Walls &amp; cliffs</label>
        <label><input type="checkbox" bind:checked={elevationMarks} /> Elevation marks</label>
        <button aria-label="Zoom in" onclick={() => pane?.zoomBy(1.3)}>+</button>
        <button aria-label="Zoom out" onclick={() => pane?.zoomBy(1 / 1.3)}>−</button>
        <button onclick={() => pane?.frame(Object.keys(sample.groups))}>Fit board</button>
        <button onclick={() => drawLayout(Math.floor(Math.random() * 99999) + 1)}>Shuffle terrain</button>
        <button class:active={showWallStates} aria-pressed={showWallStates} onclick={toggleWallStates}>Wall states</button>
        {#if textureLab.layout}
          <button onclick={() => drawLayout(0)}>Reference</button>
          <span class="seed">Layout {textureLab.layout}</span>
        {/if}
      </div>
    </section>
    <aside aria-label="Board settings">
      {#if style === 'ink'}
      <InkPanel bind:settings={mapSettings.ink} bind:selected bind:elevationLevel {count} />
      {:else}
      <div class="tabs" role="tablist" aria-label="Settings">
        <button role="tab" id="tab-textures" aria-controls="panel-settings" aria-selected={tab === 'textures'} class:active={tab === 'textures'} onclick={() => tab = 'textures'}>Textures</button>
        <button role="tab" id="tab-lines" aria-controls="panel-settings" aria-selected={tab === 'lines'} class:active={tab === 'lines'} onclick={() => tab = 'lines'}>Lines</button>
        <button role="tab" id="tab-global" aria-controls="panel-settings" aria-selected={tab === 'global'} class:active={tab === 'global'} onclick={() => tab = 'global'}>Global</button>
      </div>
      <div id="panel-settings" role="tabpanel" aria-labelledby="tab-{tab}">
      {#if tab === 'textures'}
      <p class="eyebrow">Terrain palette</p>
      <nav aria-label="Terrain types">
        {#each TERRAIN_GROUPS as group}
          <button class:active={selected === group} aria-pressed={selected === group} onclick={() => selected = group}>{TERRAIN_LABELS[group]}</button>
        {/each}
      </nav>
      <div class="section-title"><h2>{TERRAIN_LABELS[selected]}</h2><span>{count} sample hexes</span></div>
      <p class="description">One continuous surface across every adjacent {TERRAIN_LABELS[selected].toLowerCase()} hex.</p>
      {#if choice}
        <img class="preview" src={choice.url} alt={`${choice.name} texture preview`} />
        <p class="texture-name">{choice.name}</p>
      {:else}
        <div class="empty-preview">Plain terrain fill</div>
      {/if}
      <label class="slider" for="texture-scale"><span>Texture scale</span><output>{settings.terrains[selected].scale.toFixed(2)} hexes</output></label>
      <input id="texture-scale" type="range" min="0.25" max="8" step="0.05" bind:value={settings.terrains[selected].scale} disabled={!choice} />
      <p class="description">Image width per repeat. Larger values enlarge the texture.</p>
      <div class="choices" aria-label={`${TERRAIN_LABELS[selected]} textures`}>
        <button class:chosen={settings.terrains[selected].texture === null} aria-pressed={settings.terrains[selected].texture === null}
          onclick={() => settings.terrains[selected].texture = null}><span class="plain-swatch"></span><span>Plain fill</span></button>
        {#each TEXTURE_CHOICES[selected] as texture}
          <button class:chosen={texture.id === settings.terrains[selected].texture} aria-pressed={texture.id === settings.terrains[selected].texture}
            onclick={() => settings.terrains[selected].texture = texture.id}>
            <img src={texture.url} alt="" loading="lazy" /><span>{texture.name}</span>
          </button>
        {/each}
      </div>
      <section class="grade-controls" aria-label="Texture colour">
        <div class="section-title"><h2>Colour</h2><span>This texture's own art</span></div>
        <label class="slider" for="texture-hue"><span>Hue shift</span><output>{grade.hue > 0 ? '+' : ''}{grade.hue}°</output></label>
        <input id="texture-hue" type="range" min="-180" max="180" step="1" bind:value={grade.hue} disabled={!choice} />
        <label class="slider" for="texture-saturation"><span>Saturation</span><output>{Math.round(grade.saturation * 100)}%</output></label>
        <input id="texture-saturation" type="range" min="0" max="2" step="0.01" bind:value={grade.saturation} disabled={!choice} />
        <label class="slider" for="texture-brightness"><span>Brightness</span><output>{Math.round(grade.brightness * 100)}%</output></label>
        <input id="texture-brightness" type="range" min="0" max="2" step="0.01" bind:value={grade.brightness} disabled={!choice} />
        <div class="grade-actions"><button disabled={!choice} onclick={() => settings.terrains[selected].hsb = { ...IDENTITY_HSB }}>Leave the art alone</button></div>
        <p class="description">The grade is on the art alone — the ground under it keeps the terrain's own colour — and it is a vertex shader on one sprite, so it costs the same at any setting. Saturation holds a grey where it is, so a texture dialled to 0 comes out as the greys the art was painted in.</p>
      </section>
      {#if !TEXTURE_CHOICES[selected].length}<p class="description">Drop art into this terrain's texture folder to add it here.</p>{/if}
      {#if selected === 'shallows'}<p class="description">Shallows share the water library with a lighter finish.</p>{/if}
      {#if selected === 'forest'}
        <section class="forest-controls" aria-label="Forest tree settings">
          <div class="section-title"><h2>Tree sprites</h2><span>{settings.trees.min}–{settings.trees.max} per hex</span></div>
          <label class="check"><input type="checkbox" bind:checked={settings.trees.area} /> Area mode</label>
          <p class="description">Scatter each wood as one patch instead of hex by hex. The counts below stay per hex, so the wood keeps its size and only the arrangement changes.</p>
          <label class="slider" for="tree-min"><span>Minimum</span><output>{settings.trees.min}</output></label>
          <input id="tree-min" type="range" min="0" max="20" step="1" value={settings.trees.min} oninput={(e) => setMin(+e.currentTarget.value)} />
          <label class="slider" for="tree-max"><span>Maximum</span><output>{settings.trees.max}</output></label>
          <input id="tree-max" type="range" min="0" max="20" step="1" value={settings.trees.max} oninput={(e) => setMax(+e.currentTarget.value)} />
          <label class="slider" for="tree-size"><span>Crown size</span><output>{settings.trees.size.toFixed(2)}×</output></label>
          <input id="tree-size" type="range" min="0.4" max="2.5" step="0.05" bind:value={settings.trees.size} />
          <label class="slider" for="tree-variation"><span>Size variation</span><output>±{Math.round(settings.trees.variation * 100)}%</output></label>
          <input id="tree-variation" type="range" min="0" max="1" step="0.01" bind:value={settings.trees.variation} />
          <div class="tree-actions"><button onclick={() => { settings.trees = { ...settings.trees, min: 0, max: 0 }; }}>Turn trees off</button><button onclick={() => { settings.trees = { ...DEFAULT_TREES, area: settings.trees.area, tint: { ...settings.trees.tint } }; }}>Reset to 3–8</button></div>
          <p class="description">Trees spread to the forest edges, with crowns overlapping nearby hexes. Positions stay stable as you tweak textures.</p>
          <h3 class="tint-title">Colour variation</h3>
          <label class="slider" for="tree-tint-strength"><span>Strength</span><output>{Math.round(settings.trees.tint.strength * 100)}%</output></label>
          <input id="tree-tint-strength" type="range" min="0" max="1" step="0.01" bind:value={settings.trees.tint.strength} />
          <label class="slider" for="tree-tint-hue"><span>Hue</span><output>{settings.trees.tint.hue}°</output></label>
          <input id="tree-tint-hue" type="range" min="0" max="359" step="1" bind:value={settings.trees.tint.hue} disabled={!settings.trees.tint.strength} />
          <label class="slider" for="tree-tint-spread"><span>Hue spread</span><output>±{settings.trees.tint.spread}°</output></label>
          <input id="tree-tint-spread" type="range" min="0" max="180" step="1" bind:value={settings.trees.tint.spread} disabled={!settings.trees.tint.strength} />
          <p class="description">A wash over each crown, its depth and its hue drawn per tree, so a wood is not one flat green. It is a sprite tint, which costs no extra drawing — the whole wood is still one pass — and it can only deepen a colour, never lighten it.</p>
        </section>
      {/if}
      {:else if tab === 'lines'}
        <MapLinesPanel id="tex" bind:area={settings.area} bind:elevation={settings.elevation} bind:grid={settings.grid} />
      {:else}
        <p class="eyebrow">Shared by every terrain and layer</p>
        <section class="display-controls" aria-label="Board display settings">
          <div class="section-title"><h2>Borders &amp; marks</h2><span>What the board draws</span></div>
          <label class="check"><input type="checkbox" bind:checked={bordersVisible} /> Walls, breaches and cliffs</label>
          <label class="check"><input type="checkbox" bind:checked={elevationMarks} /> Elevation wash and numerals</label>
        </section>
      <section class="edge-controls" aria-label="Edge blending settings">
        <div class="section-title"><h2>Edge blending</h2><span>All terrain boundaries</span></div>
        <div class="edge-modes" role="group" aria-label="Edge blending mode">
          {#each ['hard', 'soft', 'natural'] as mode}
            <button class:active={settings.edges.mode === mode} aria-pressed={settings.edges.mode === mode}
              onclick={() => settings.edges.mode = mode as typeof settings.edges.mode}>{mode[0].toUpperCase() + mode.slice(1)}</button>
          {/each}
        </div>
        <label class="slider" for="blend-width"><span>Blend width</span><output>{settings.edges.width.toFixed(2)} hex</output></label>
        <input id="blend-width" type="range" min="0" max="0.5" step="0.01" bind:value={settings.edges.width} disabled={settings.edges.mode === 'hard'} />
        <label class="slider" for="edge-irregularity"><span>Edge irregularity</span><output>{Math.round(settings.edges.irregularity * 100)}%</output></label>
        <input id="edge-irregularity" type="range" min="0" max="1" step="0.01" bind:value={settings.edges.irregularity} disabled={settings.edges.mode !== 'natural'} />
        <label class="slider" for="edge-patch-size"><span>Patch size</span><output>{settings.edges.patchSize.toFixed(2)} hex</output></label>
        <input id="edge-patch-size" type="range" min="0.05" max="1.5" step="0.05" bind:value={settings.edges.patchSize} disabled={settings.edges.mode !== 'natural'} />
        <button class="compare" class:active={compareHard} aria-pressed={compareHard}
          disabled={settings.edges.mode === 'hard' || settings.edges.width === 0}
          onpointerdown={(e) => { if (e.button === 0) { e.currentTarget.setPointerCapture(e.pointerId); compareHard = true; } }}
          onpointerup={() => compareHard = false} onpointercancel={() => compareHard = false}
          onlostpointercapture={() => compareHard = false} onblur={() => compareHard = false}
          onkeydown={(e) => compareKey(e, true)} onkeyup={(e) => compareKey(e, false)}>
          {compareHard ? 'Showing hard edges' : 'Hold to compare'}
        </button>
        <p class="description">Soft blends adjoining textures. Natural adds uneven patches. Hold to compare with hard edges; release to restore.</p>
      </section>
      <section class="shadow-controls" aria-label="Elevation settings">
        <div class="section-title"><h2>Elevation</h2><span>Height and shadow</span></div>
        <div class="levels" role="group" aria-label="Elevation brush">
          {#each ELEVATION_LEVELS as level}
            <button class:active={elevationLevel === level} aria-pressed={elevationLevel === level}
              onclick={() => elevationLevel = elevationLevel === level ? null : level}>{level > 0 ? `+${level}` : level < 0 ? `−${-level}` : '0'}</button>
          {/each}
        </div>
        <p class="description">Paint a height onto the board, then judge the step it makes. A bevel lights the edge itself — bright on the side facing the light, dark on the side away from it — and the drop shadow falls past that edge onto the ground below. <kbd>W</kbd>, <kbd>E</kbd>, <kbd>A</kbd>, <kbd>S</kbd> and <kbd>Q</kbd> reach the five heights from the canvas, <kbd>Esc</kbd> puts the brush down.</p>
        <label class="slider" for="shadow-angle"><span>Light direction</span><output>{settings.shadows.angle}°</output></label>
        <input id="shadow-angle" type="range" min="0" max="359" step="1" bind:value={settings.shadows.angle} />
        <div class="shadow-level">
          <h3>Bevel</h3>
          <label class="slider" for="bevel-light"><span>Light edge</span><output>{Math.round(settings.shadows.bevel.light * 100)}%</output></label>
          <input id="bevel-light" type="range" min="0" max="1" step="0.01" bind:value={settings.shadows.bevel.light} />
          <label class="slider" for="bevel-shadow"><span>Dark edge</span><output>{Math.round(settings.shadows.bevel.shadow * 100)}%</output></label>
          <input id="bevel-shadow" type="range" min="0" max="1" step="0.01" bind:value={settings.shadows.bevel.shadow} />
          <label class="slider" for="bevel-thickness"><span>Thickness</span><output>{settings.shadows.bevel.thickness.toFixed(3)} hex</output></label>
          <input id="bevel-thickness" type="range" min="0" max="0.1" step="0.002" bind:value={settings.shadows.bevel.thickness} />
        </div>
        <div class="shadow-level">
          <h3>Drop shadow</h3>
          <label class="slider" for="shadow-opacity"><span>Opacity</span><output>{Math.round(settings.shadows.opacity * 100)}%</output></label>
          <input id="shadow-opacity" type="range" min="0" max="1" step="0.01" bind:value={settings.shadows.opacity} />
        </div>
        {#each SHADOW_LEVELS as row}
          <div class="shadow-level">
            <h3>{row.label}</h3>
            <label class="slider" for="{row.key}-distance"><span>Distance</span><output>{settings.shadows[row.key].distance.toFixed(2)} hex</output></label>
            <input id="{row.key}-distance" type="range" min="0" max="0.6" step="0.01" bind:value={settings.shadows[row.key].distance} />
            <label class="slider" for="{row.key}-softness"><span>Softness</span><output>{settings.shadows[row.key].softness.toFixed(2)} hex</output></label>
            <input id="{row.key}-softness" type="range" min="0" max="0.5" step="0.01" bind:value={settings.shadows[row.key].softness} />
          </div>
        {/each}
        <div class="shadow-actions">
          <button onclick={() => { settings.shadows.opacity = 0; settings.shadows.bevel.light = 0; settings.shadows.bevel.shadow = 0; }}>Turn relief off</button>
          <button onclick={() => drawLayout(textureLab.layout)}>Reset heights</button>
        </div>
      </section>
      {/if}
      </div>
      <footer><button onclick={() => { mapSettings.textures = defaultTextureSettings(); compareHard = false; }}>Reset all settings</button></footer>
      {/if}
      <p class="storage">Settings affect this development preview.</p>
    </aside>
  </main>
</div>

<style>
  .texture-lab { position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--paper); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .8rem 1.2rem; border-bottom: 1px solid var(--rule); }
  .heading { display: flex; align-items: center; gap: .8rem; }
  .styles { display: flex; gap: .35rem; }
  .styles button { padding: .3rem .7rem; font-size: .85rem; }
  .styles button.active { color: var(--paper); background: var(--accent); border-color: var(--accent); }
  h1 { font-size: 1.2rem; }
  .badge, .eyebrow { font: 600 .65rem/1.4 system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .badge { border: 1px solid var(--rule); border-radius: 4px; padding: .25rem .4rem; }
  main { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 23rem; min-height: 0; }
  .map { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
  .map-hint { position: absolute; top: 1rem; left: 1rem; right: 1rem; text-align: center; pointer-events: none; color: var(--muted); font-size: .8rem; }
  .map-tools { position: absolute; right: 1rem; bottom: 1rem; display: flex; gap: .4rem; align-items: center; background: var(--card); border: 1px solid var(--rule); border-radius: 8px; padding: .4rem; font-size: .85rem; }
  .map-tools label { padding: 0 .3rem; }
  .map-tools button.active { color: var(--paper); background: var(--accent); border-color: var(--accent); }
  .seed { padding: 0 .3rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  aside { overflow-y: auto; padding: 1.2rem; border-left: 1px solid var(--rule); background: var(--card); }
  .eyebrow { margin: 0 0 .6rem; }
  .tabs { display: flex; gap: .35rem; margin-bottom: 1rem; }
  .tabs button { flex: 1; padding: .35rem .5rem; font-size: .85rem; }
  .tabs button.active { color: var(--paper); background: var(--accent); border-color: var(--accent); }
  .display-controls { margin-bottom: 1.2rem; }
  nav { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: 1.4rem; }
  nav button { padding: .25rem .5rem; font-size: .8rem; }
  nav button.active { color: var(--paper); background: var(--accent); border-color: var(--accent); }
  .section-title { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; }
  h2 { border: 0; margin: 0; padding: 0; }
  .section-title span { font-size: .75rem; color: var(--muted); }
  .description { margin: .4rem 0 .9rem; color: var(--muted); font-size: .8rem; }
  .preview, .empty-preview { width: 100%; height: 8rem; object-fit: cover; border: 1px solid var(--rule); border-radius: 7px; }
  .empty-preview { display: grid; place-items: center; background: var(--band); color: var(--muted); margin-bottom: 1rem; }
  .texture-name { margin: .35rem 0 1rem; font-size: .85rem; }
  .slider { display: flex; justify-content: space-between; width: 100%; font-size: .85rem; }
  output { font-variant-numeric: tabular-nums; color: var(--accent); }
  input[type=range] { display: block; width: 100%; padding: 0; margin: .5rem 0 .65rem; accent-color: var(--accent); }
  .choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .45rem; }
  .choices button { padding: .25rem; font-size: .65rem; text-align: left; overflow: hidden; border: 2px solid transparent; background: var(--band); }
  .choices button.chosen { border-color: var(--accent); }
  .choices img, .plain-swatch { width: 100%; height: 3.6rem; display: block; object-fit: cover; border-radius: 3px; margin-bottom: .2rem; }
  .plain-swatch { background: var(--paper); border: 1px solid var(--rule); }
  .choices span { display: block; overflow-wrap: anywhere; }
  .edge-controls { border-top: 1px solid var(--rule); margin-top: 1.2rem; padding-top: 1rem; }
  .edge-modes { display: flex; gap: .35rem; margin: .7rem 0 1rem; }
  .edge-modes button { flex: 1; padding: .25rem .5rem; font-size: .8rem; }
  .edge-modes button.active, .compare.active { color: var(--paper); background: var(--accent); border-color: var(--accent); }
  .compare { width: 100%; font-size: .8rem; touch-action: none; user-select: none; }
  .shadow-controls, .forest-controls, .grade-controls { border-top: 1px solid var(--rule); margin-top: 1.2rem; padding-top: 1rem; }
  .grade-actions { margin-top: .6rem; }
  .grade-actions button { font-size: .8rem; }
  .shadow-level { margin-top: .6rem; }
  .shadow-level h3 { font-size: .8rem; margin: 0 0 .3rem; color: var(--muted); }
  .check { display: flex; align-items: center; gap: .4rem; margin: .7rem 0 .2rem; font-size: .85rem; }
  kbd { font: inherit; border: 1px solid var(--rule); border-radius: 3px; padding: 0 .25rem; }
  .levels { display: flex; gap: .35rem; margin: .7rem 0 0; }
  .levels button { flex: 1; padding: .25rem .4rem; font-size: .8rem; font-variant-numeric: tabular-nums; }
  .levels button.active { color: var(--paper); background: var(--accent); border-color: var(--accent); }
  .shadow-actions { display: flex; gap: .5rem; margin-top: .6rem; }
  .shadow-actions button { font-size: .8rem; }
  .forest-controls .section-title { margin-bottom: .8rem; }
  .tree-actions { display: flex; gap: .5rem; margin-top: .8rem; }
  .tint-title { font-size: .8rem; margin: .9rem 0 .3rem; color: var(--muted); }
  .tree-actions button, footer button { font-size: .8rem; }
  footer { border-top: 1px solid var(--rule); margin-top: 1.2rem; padding-top: 1rem; }
  .storage { font-size: .75rem; color: var(--muted); margin-top: .8rem; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (max-width: 760px) {
    header { padding: .6rem; } .heading { gap: .4rem; } .badge { display: none; } h1 { font-size: 1rem; }
    main { grid-template-columns: minmax(0, 1fr) 18rem; } aside { padding: .75rem; } .map-hint { font-size: .7rem; } .map-tools { flex-wrap: wrap; left: .5rem; right: .5rem; bottom: .5rem; }
  }
  @media (max-width: 520px) {
    main { grid-template-columns: 1fr; grid-template-rows: minmax(16rem, 45%) minmax(0, 1fr); } aside { border-left: 0; border-top: 1px solid var(--rule); }
    .preview { height: 6rem; } .map-hint { top: .4rem; }
  }
</style>
