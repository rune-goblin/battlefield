<script lang="ts">
  import { activeUnit, availableActions, engagedEnemies, isBroken, isOutflanked, isRouted, isWeakened, reachOf, routDc, STEPS, unit, type ActionOption, type Unit } from '../engine/index.js';
  import { backToSetup, game, takeAction, undo } from './game.svelte.js';

  const b = $derived(game.battle!);
  const active = $derived(activeUnit(b));
  const options = $derived(availableActions(b));
  let chosen = $state<Record<string, string>>({});

  const onStep = (i: number) => b.units.filter((u) => u.status === 'active' && u.step === i);
  const melee = (i: number) => onStep(i).some((u) => u.side === 'attacker') && onStep(i).some((u) => u.side === 'defender');
  const tags = (u: Unit) => [
    isRouted(u) ? 'routed' : isBroken(u) ? 'broken' : isWeakened(u) ? 'weakened' : '',
    u.braced ? 'braced' : '', u.exposed ? 'exposed' : '', u.suppressed ? 'suppressed' : '',
    b.phase === 'battle' && isOutflanked(b, u) ? 'outflanked' : '',
    u.pace ? 'pace' : '', u.fear ? 'fear' : '',
  ].filter(Boolean).join(' · ');

  const key = (o: ActionOption) => o.engine === undefined ? o.kind : `${o.kind}:${o.engine}`;
  function go(o: ActionOption) {
    takeAction({ kind: o.kind, engine: o.engine, target: o.targets ? (chosen[key(o)] ?? o.targets[0]) : undefined });
  }
  const abandoned = $derived(b.units.flatMap((u) => u.engines.filter((e) => e.status !== 'crewed').map((e) => ({ ...e, owner: u.name }))));
  const name = (id: string) => unit(b, id).name;
  const cls = (e: { degree: string } | undefined) => !e ? '' : e.degree === 'critical-success' ? 'crit' : e.degree.includes('fail') ? 'fail' : '';
  let logEl = $state<HTMLDivElement>();
  $effect(() => { b.log.length; logEl?.scrollTo({ top: logEl.scrollHeight }); });
</script>

<div class="row" style="justify-content:space-between">
  <div><strong>Round {b.round}</strong> of 6 <span class="muted">· {b.terrain.cover ? 'cover' : ''} {b.terrain.rough ? 'rough' : ''} {b.terrain.river ? 'river' : ''}</span></div>
  <div class="row">
    <button onclick={undo} disabled={!game.history.length}>Undo</button>
    <button onclick={backToSetup}>New battle</button>
  </div>
</div>

<div class="board">
  {#each Array.from({ length: STEPS }, (_, i) => i) as i}
    <div class="step" class:melee={melee(i)}>
      <header><span>{i === 0 ? 'attacker edge' : i === 6 ? 'defender edge' : `step ${i}`}</span>
        {#if i === 6 && b.walls}<span class="walls">walls {b.walls.remaining}/{b.walls.boxes}</span>{/if}</header>
      {#each b.units.filter((u) => u.step === i && u.status === 'active') as u (u.id)}
        <div class="chip" class:def={u.side === 'defender'} class:active={active?.id === u.id} title={tags(u)}>
          <span class="name">{u.name}</span>
          <span class="pips">{#each [1,2,3,4] as n}<span class="pip" class:on={u.wounds >= n}></span>{/each}</span>
          <span class="pips">{#each [1,2,3] as n}<span class="pip shaken" class:on={u.shaken >= n}></span>{/each}</span>
          <div class="tags">L{u.level} {u.role}{tags(u) ? ' · ' + tags(u) : ''}{u.engines.filter((e) => e.status === 'crewed').length ? ' · ⚙ ' + u.engines.filter((e) => e.status === 'crewed').map((e) => e.name).join(', ') : ''}</div>
        </div>
      {/each}
    </div>
  {/each}
</div>
<p class="muted">Squares are wounds, circles are shaken. Attackers are blue, defenders red. Attackers move right, defenders move left.{#if abandoned.length} Abandoned engines: {abandoned.map((e) => `${e.name} on step ${e.step}${e.status === 'captured' ? ' (captured)' : ''}`).join('; ')}.{/if}</p>

<div class="grid2">
  <section>
    {#if b.phase === 'ended'}
      <div class="card result">
        <h2>{b.winner === 'draw' ? (b.endedBy === 'dusk' ? 'Dusk. The field is contested.' : 'Both armies are spent.') : `The ${b.winner} holds the field.`}</h2>
        <div class="unitlist">
          {#each b.units as u}
            <div class="unitrow"><span class={u.side === 'attacker' ? 'side-att' : 'side-def'}>{u.name}</span><span class="stat">wounds {u.wounds}/4</span><span class="stat">shaken {u.shaken}</span><span class="muted">{u.status === 'active' ? (isRouted(u) ? 'routed' : 'standing') : u.status}</span></div>
          {/each}
        </div>
        <p><button class="primary" onclick={backToSetup}>Set up another battle</button></p>
      </div>
    {:else if active}
      <div class="card">
        <h3 class={active.side === 'attacker' ? 'side-att' : 'side-def'}>{active.name} · {active.side} · {b.actionsLeft} action{b.actionsLeft === 1 ? '' : 's'} left</h3>
        <table class="stats"><tbody>
          <tr><td>Strike</td><td class="stat">{active.stats.strike === null ? '—' : '+' + active.stats.strike}</td><td>Volley</td><td class="stat">{active.stats.volley === null ? '—' : `+${active.stats.volley} · ${['—','close','long','extreme'][Math.max(0, reachOf(active))]}`}</td></tr>
          <tr><td>Defence</td><td class="stat">{active.stats.defence}</td><td>Will</td><td class="stat">+{active.stats.will} vs rout DC {routDc(b, active)}</td></tr>
          <tr><td>Engaged with</td><td colspan="3">{engagedEnemies(b, active).map((e) => e.name).join(', ') || 'nobody'}</td></tr>
          {#if active.tactics.length}<tr><td>Tactics</td><td colspan="3">{active.tactics.join(', ')}</td></tr>{/if}
        </tbody></table>
        <div class="actions">
          {#each options as o (key(o))}
            <div class="action">
              <button onclick={() => go(o)}>{o.label}</button>
              <span class="cost">{o.cost} action{o.cost === 1 ? '' : 's'}</span>
              {#if o.targets}
                <select bind:value={chosen[key(o)]}>
                  {#each o.targets as t}<option value={t}>{name(t)}</option>{/each}
                </select>
              {/if}
            </div>
          {/each}
        </div>
      </div>
      <p class="muted">Order this round: {b.order.map((id) => unit(b, id)).filter((u) => u.status === 'active').map((u) => u.name).join(' → ')}</p>
    {/if}
  </section>
  <section>
    <h3>Battle log</h3>
    <div class="log" bind:this={logEl}>
      {#each b.log as e}
        <p class:round={!e.unit} class={cls(e.check)}>{e.text}</p>
      {/each}
    </div>
  </section>
</div>
