<script lang="ts">
  import { activeUnit, availableActions, engagedEnemies, isOutflanked, isRouted, notation, reachOf, routDc, unit, type ActionOption } from '../engine/index.js';
  import type { BoardEventOf, EngineTokenModel, TokenModel, UnitTokenModel } from '../board/index.js';
  import PixiBoard from './PixiBoard.svelte';
  import { backToSetup, game, takeAction, undo } from './game.svelte.js';

  const b = $derived(game.battle!);
  const active = $derived(activeUnit(b));
  const options = $derived(availableActions(b));
  let chosen = $state<Record<string, string>>({});
  let focused = $state<string | null>(null);

  // battle.ts logs a free strike like any other strike, with no flag marking it as one; these
  // three label phrases (from `resolveStrike`'s `reactionsOnEntry`/`reactionsOnLeaving`
  // callers) are the only channel to find one without changing the engine this wave.
  const FREE_STRIKE_RE = /reacts and strikes|strikes from its brace at|strikes the withdrawing/;
  const FLASH_MS = 700;
  let flashing = $state<string[]>([]);
  let flashTimers: ReturnType<typeof setTimeout>[] = [];
  function flash(id: string) {
    flashing = [...flashing, id];
    flashTimers.push(setTimeout(() => { flashing = flashing.filter((x) => x !== id); }, FLASH_MS));
  }
  $effect(() => () => { for (const t of flashTimers) clearTimeout(t); });
  const flashSet = $derived(new Set(flashing));

  const key = (o: ActionOption) => o.engine === undefined ? o.kind : `${o.kind}:${o.engine}`;
  const focusedOption = $derived(options.find((o) => key(o) === focused) ?? null);
  const highlightCells = $derived(focusedOption?.targetKind === 'square' ? focusedOption.targets ?? [] : []);
  const unitIdOf = (t: string) => (t.includes('>') ? t.split('>')[1] : t);
  const highlightedUnitIds = $derived(new Set(focusedOption?.targetKind === 'unit' ? (focusedOption.targets ?? []).map(unitIdOf) : []));

  const tokens = $derived.by<TokenModel[]>(() => [
    ...b.units.filter((u) => u.status === 'active').map((u): UnitTokenModel => ({
      kind: 'unit',
      id: u.id,
      side: u.side,
      name: u.name,
      role: u.role,
      level: u.level,
      cell: notation(u.square),
      wounds: u.wounds,
      shaken: u.shaken,
      engine: u.engines.find((e) => e.status === 'crewed')?.name ?? null,
      ring: active?.id === u.id ? 'active' : flashSet.has(u.id) ? 'flash' : highlightedUnitIds.has(u.id) ? 'highlighted' : null,
    })),
    // Abandoned and captured engines stand alone on the square they were left.
    ...b.units.flatMap((u) => u.engines
      .filter((e) => e.status !== 'crewed')
      .map((e, i): EngineTokenModel => ({ kind: 'engine', id: `${u.id}:engine:${i}`, side: u.side, name: e.name, cell: notation(e.square), ring: null }))),
  ]);

  function go(o: ActionOption, target?: string) {
    const before = game.battle!.log.length;
    takeAction({ kind: o.kind, engine: o.engine, target: target ?? (o.targets ? (chosen[key(o)] ?? o.targets[0]) : undefined) });
    for (const e of game.battle!.log.slice(before)) if (e.unit && FREE_STRIKE_RE.test(e.text)) flash(e.unit);
    focused = null;
  }

  // A second path onto the same options the action list already offers: the focused row
  // (if it matches) wins, so hovering the intended row disambiguates a square/unit two rows
  // share; otherwise every option is searched, same as picking straight from the list.
  function findOption(kind: 'square' | 'unit' | 'wall', matches: (t: string) => boolean): { option: ActionOption; target: string } | null {
    if (focusedOption?.targetKind === kind) {
      const t = focusedOption.targets?.find(matches);
      if (t) return { option: focusedOption, target: t };
    }
    for (const o of options) {
      if (o.targetKind !== kind) continue;
      const t = o.targets?.find(matches);
      if (t) return { option: o, target: t };
    }
    return null;
  }
  function onCell(e: BoardEventOf<'cell'>) {
    const m = findOption('square', (t) => t === e.cell);
    if (m) go(m.option, m.target);
  }
  function onToken(e: BoardEventOf<'token'>) {
    const m = findOption('unit', (t) => unitIdOf(t) === e.id);
    if (m) go(m.option, m.target);
  }
  function onEdge(e: BoardEventOf<'edge'>) {
    const m = findOption('wall', (t) => t === e.edge);
    if (m) go(m.option, m.target);
  }

  const name = (id: string) => unit(b, id).name;
  const targetLabel = (o: ActionOption, t: string) => {
    if (o.targetKind === 'unit') {
      const [sq, id] = t.includes('>') ? t.split('>') : [null, t];
      return sq ? `${sq} → ${name(id)}` : name(id);
    }
    if (o.targetKind === 'wall') {
      const w = b.board.walls[t];
      return w ? `${t.replace('|', ' / ')} · tier ${w.tier} · ${w.remaining}/${w.boxes}` : t;
    }
    return t;
  };
  const status = (u: NonNullable<typeof active>) => [
    u.braced ? 'braced' : '', u.exposed ? 'exposed' : '', u.suppressed ? 'suppressed' : '',
    b.phase === 'battle' && isOutflanked(b, u) ? 'outflanked' : '',
  ].filter(Boolean).join(' · ');
  const spec = $derived(`${b.board.spec.base}${b.board.spec.feature && b.board.spec.feature !== 'none' ? ' · ' + b.board.spec.feature : ''}`);
  const cls = (e: { degree: string } | undefined) => !e ? '' : e.degree === 'critical-success' ? 'crit' : e.degree.includes('fail') ? 'fail' : '';
  let logEl = $state<HTMLDivElement>();
  $effect(() => { void b.log.length; logEl?.scrollTo({ top: logEl.scrollHeight }); });
</script>

<div class="row" style="justify-content:space-between">
  <div><strong>Round {b.round}</strong> of 6 · {b.actionsLeft} of 3 actions <span class="muted">· {spec}</span></div>
  <div class="row">
    <button onclick={undo} disabled={!game.history.length}>Undo</button>
    <button onclick={backToSetup}>New battle</button>
  </div>
</div>

<div class="grid2">
  <section>
    <PixiBoard
      board={b.board}
      {tokens}
      mode="battle"
      highlight={highlightCells}
      highlightStyle="move"
      oncell={active ? onCell : undefined}
      ontoken={active ? onToken : undefined}
      onedge={active ? onEdge : undefined}
    />
    <p class="muted">Squares are wounds, circles are shaken; a pulsing ring marks the active unit. Attackers are blue and move up the board, defenders red and move down. Hover an action below to see its targets highlighted on the board, then click a highlighted square, unit or wall — or use the list. A lone siege icon is an abandoned or captured engine.</p>
  </section>
  <section>
    {#if b.phase === 'ended'}
      <div class="card result">
        <h2>{b.winner === 'draw' ? (b.endedBy === 'dusk' ? 'Dusk. The field is contested.' : 'Both armies are spent.') : `The ${b.winner} holds the field.`}</h2>
        <div class="unitlist">
          {#each b.units as u (u.id)}
            <div class="unitrow"><span class={u.side === 'attacker' ? 'side-att' : 'side-def'}>{u.name}</span><span class="stat">wounds {u.wounds}/4</span><span class="stat">shaken {u.shaken}</span><span class="muted">{u.status === 'active' ? (isRouted(u) ? 'routed' : 'standing') : u.status}</span></div>
          {/each}
        </div>
        <p><button class="primary" onclick={backToSetup}>Set up another battle</button></p>
      </div>
    {:else if active}
      <div class="card">
        <h3 class={active.side === 'attacker' ? 'side-att' : 'side-def'}>{active.name} · {active.side} · {notation(active.square)} · {b.actionsLeft} action{b.actionsLeft === 1 ? '' : 's'} left</h3>
        <table class="stats"><tbody>
          <tr><td>Strike</td><td class="stat">{active.stats.strike === null ? '—' : '+' + active.stats.strike}</td><td>Volley</td><td class="stat">{active.stats.volley === null ? '—' : `+${active.stats.volley} · ${['—', 'close', 'long', 'extreme'][Math.max(0, reachOf(b, active))]}`}</td></tr>
          <tr><td>Defence</td><td class="stat">{active.stats.defence}</td><td>Will</td><td class="stat">+{active.stats.will} vs rout DC {routDc(b, active)}</td></tr>
          <tr><td>Engaged with</td><td colspan="3">{engagedEnemies(b, active).map((e) => `${e.name} (${notation(e.square)})`).join(', ') || 'nobody'}</td></tr>
          {#if active.tactics.length}<tr><td>Tactics</td><td colspan="3">{active.tactics.join(', ')}</td></tr>{/if}
          {#if status(active)}<tr><td>Status</td><td colspan="3">{status(active)}</td></tr>{/if}
        </tbody></table>
        <div class="actions">
          {#each options as o (key(o))}
            <div class="action" role="group"
              onmouseenter={() => { if (o.targets) focused = key(o); }}
              onmouseleave={() => { if (focused === key(o)) focused = null; }}
              onfocusin={() => { if (o.targets) focused = key(o); }}
            >
              <button onclick={() => go(o)}>{o.label}</button>
              <span class="cost">{o.cost} action{o.cost === 1 ? '' : 's'}</span>
              {#if o.targets}
                <select bind:value={chosen[key(o)]}>
                  {#each o.targets as t (t)}<option value={t}>{targetLabel(o, t)}</option>{/each}
                </select>
              {/if}
            </div>
          {/each}
        </div>
      </div>
      <p class="muted">Order this round: {b.order.map((id) => unit(b, id)).filter((u) => u.status === 'active').map((u) => u.name).join(' → ')}</p>
    {/if}
    <h3>Battle log</h3>
    <div class="log" bind:this={logEl}>
      {#each b.log as e, i (i)}
        <p class:round={!e.unit} class={cls(e.check)}>{e.text}</p>
      {/each}
    </div>
  </section>
</div>
