<script lang="ts">
  import { activeUnit, availableActions, engagedEnemies, isBroken, isOutflanked, isRouted, isWeakened, notation, reachOf, routDc, unit, type ActionOption, type Unit } from '../engine/index.js';
  import Board from './Board.svelte';
  import { backToSetup, game, takeAction, undo } from './game.svelte.js';

  const b = $derived(game.battle!);
  const active = $derived(activeUnit(b));
  const options = $derived(availableActions(b));
  let chosen = $state<Record<string, string>>({});
  let focused = $state<string | null>(null);

  const tags = (u: Unit) => [
    isRouted(u) ? 'routed' : isBroken(u) ? 'broken' : isWeakened(u) ? 'weakened' : '',
    u.braced ? 'braced' : '', u.exposed ? 'exposed' : '', u.suppressed ? 'suppressed' : '',
    b.phase === 'battle' && isOutflanked(b, u) ? 'outflanked' : '',
    u.pace ? 'pace' : '', u.fear ? 'fear' : '',
  ].filter(Boolean).join(' · ');
  const crewed = (u: Unit) => u.engines.filter((e) => e.status === 'crewed').map((e) => e.name);
  const boardUnits = $derived(b.units.filter((u) => u.status === 'active').map((u) => ({
    id: u.id, name: u.name, side: u.side, square: notation(u.square), wounds: u.wounds, shaken: u.shaken, active: active?.id === u.id,
    tags: [`${u.name} · L${u.level} ${u.role}`, tags(u), crewed(u).length ? '⚙ ' + crewed(u).join(', ') : ''].filter(Boolean).join(' · '),
  })));

  const key = (o: ActionOption) => o.engine === undefined ? o.kind : `${o.kind}:${o.engine}`;
  const squareOptions = $derived(options.filter((o) => o.targetKind === 'square'));
  const focusedOption = $derived(squareOptions.find((o) => key(o) === focused) ?? null);
  const highlight = $derived(new Set(focusedOption ? focusedOption.targets ?? [] : squareOptions.flatMap((o) => o.targets ?? [])));
  function go(o: ActionOption, target?: string) {
    takeAction({ kind: o.kind, engine: o.engine, target: target ?? (o.targets ? (chosen[key(o)] ?? o.targets[0]) : undefined) });
    focused = null;
  }
  function onSquare(n: string) {
    const o = focusedOption?.targets?.includes(n) ? focusedOption : squareOptions.find((x) => x.targets?.includes(n));
    if (o) go(o, n);
  }
  const abandoned = $derived(b.units.flatMap((u) => u.engines.filter((e) => e.status !== 'crewed').map((e) => ({ ...e, owner: u.name }))));
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
    <Board board={b.board} units={boardUnits} {highlight} selected={active ? notation(active.square) : null} onSquare={b.phase === 'battle' ? onSquare : undefined} />
    <p class="muted">Squares are wounds, circles are shaken. Attackers are blue and move up the board, defenders red and move down. Click an outlined square to move there.{#if abandoned.length} Abandoned engines: {abandoned.map((e) => `${e.name} on ${notation(e.square)}${e.status === 'captured' ? ' (captured)' : ''}`).join('; ')}.{/if}</p>
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
        </tbody></table>
        <div class="actions">
          {#each options as o (key(o))}
            <div class="action" role="group"
              onmouseenter={() => { if (o.targetKind === 'square') focused = key(o); }}
              onmouseleave={() => { if (focused === key(o)) focused = null; }}
              onfocusin={() => { if (o.targetKind === 'square') focused = key(o); }}
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
