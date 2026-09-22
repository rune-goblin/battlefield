import { describe, expect, it } from 'vitest';
import {
  act, at, availableActions, canDeploy, createBattle, defenceOf, deployRanks,
  coverBetween, generateBoard, gridFor, gridOf, hasSight, homeRank, notation, parse,
  siegeAttackOffer, shootModifier, sightCells, strikeModifier, unit, type GridKind, type UnitCard,
} from '../engine/index.js';
import { scriptedRng } from '../engine/rng.js';
import { openBoard } from './helpers.js';

const troop: UnitCard = {name:'Archers',level:6,role:'infantry',salvo:'long',caster:true,tradition:'arcane',tactics:[]};
function battlefield(kind: GridKind = 'hex') {
  const b = createBattle({board:openBoard(kind,11),units:[
    {card:troop,side:'attacker',square:'f3'},
    {card:troop,side:'defender',square:'f9'},
  ]});
  unit(b,'u0').square=parse('c6'); unit(b,'u1').square=parse('g6');
  return b;
}
const targets = (b: ReturnType<typeof battlefield>, type: 'shoot'|'cast', activity=1) =>
  availableActions(b,'u0').find(o => o.type===type && (type!=='cast'||o.spell==='blast'))?.activities[activity-1].targets.map(t=>t.id) ?? [];

describe('larger battlefield', () => {
  it('has 91 centred hexes, a diameter of ten, and three deployment ranks per side', () => {
    const b=generateBoard({base:'plains',seed:1}); const g=gridOf(b), cells=g.cells();
    expect(cells).toHaveLength(91);
    expect(Array.from({length:11},(_,rank)=>cells.filter(c=>c.rank===rank).length)).toEqual([6,7,8,9,10,11,10,9,8,7,6]);
    expect(Math.max(...cells.flatMap(a=>cells.map(b=>g.distance(a,b))))).toBe(10);
    expect(deployRanks('defender')).toEqual([10,9,8]);
    expect(cells.filter(c=>canDeploy(b,'attacker',false,c))).toHaveLength(21);
    expect(cells.filter(c=>canDeploy(b,'defender',false,c))).toHaveLength(21);
    expect(g.center(parse('f6'),40)).toEqual({x:g.bounds(40).width/2,y:g.bounds(40).height/2});
    for(const c of cells) {
      expect(g.fromPoint(g.center(c,40),40)).toEqual(c);
      for(const p of g.vertices(c,40)) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-8);expect(p.x).toBeLessThanOrEqual(g.bounds(40).width+1e-8);
        expect(p.y).toBeGreaterThanOrEqual(-1e-8);expect(p.y).toBeLessThanOrEqual(g.bounds(40).height+1e-8);
      }
    }
  });
  it('preserves old JSON boards and their deployment and retreat edges', () => {
    const b=JSON.parse(JSON.stringify(openBoard('hex')));
    expect(gridOf(b).cells()).toHaveLength(61);
    expect(canDeploy(b,'defender',false,parse('c7'))).toBe(true);
    expect(homeRank('defender',b.squares.length)).toBe(8);
    expect(gridFor('hex',9).fromPoint(gridFor('hex',9).center(parse('e5'),40),40)).toEqual(parse('e5'));
  });
  it.each(['forest','swamp'] as const)('covers a steady share of the board with %s across 200 seeds', base => {
    let total=0;
    for(let seed=1;seed<=200;seed++) {
      const b=generateBoard({base,seed});
      total+=gridOf(b).cells().filter(c=>at(b,c).terrain===base).length;
    }
    const fraction=total/(200*91);
    expect(fraction).toBeGreaterThan(base==='forest'?.40:.30);
    expect(fraction).toBeLessThan(base==='forest'?.52:.43);
  });
});

describe.each(['hex','square'] as const)('%s range and terrain',kind=>{
  it.each(['short','medium','long','extreme'] as const)('enforces the %s preferred distances and one-hex flexibility for every shooting activity', reach=>{
    const b=battlefield(kind),u=unit(b,'u0'),foe=unit(b,'u1'),g=gridOf(b.board);
    u.stats.reach=reach;
    for(const c of g.cells()) {
      foe.square=c;
      const d=g.distance(u.square,c);
      if(d<=1)continue;
      const legal = {short:[2,3],medium:[2,3,4],long:[3,4,5],extreme:[4,5,6,7,8]}[reach].includes(d);
      const preferred = {short:[2],medium:[3],long:[4],extreme:[5,6,7]}[reach].includes(d);
      for(const index of [1,2,3])expect(targets(b,'shoot',index).includes(foe.id)).toBe(legal);
      if(legal) expect(shootModifier(b,u,foe)).toBe(u.stats.volley! - (preferred?0:2));
    }
    u.square=parse('a1');foe.square=parse('k11');at(b.board,u.square).elevation=2;
    expect(()=>act(b,{unit:u.id,type:'shoot',activity:1,target:foe.id,focus:2},scriptedRng([20]))).toThrow();
  });
  it.each([['e6',-2],['f6',0],['g6',-2]] as const)('resolves medium shots at %s with a %i range modifier', (cell, penalty)=>{
    const b=battlefield(kind),u=unit(b,'u0'),foe=unit(b,'u1');
    u.stats.reach='medium';foe.square=parse(cell);
    const result=act(b,{type:'shoot',unit:u.id,activity:1,target:foe.id},scriptedRng([10]));
    const check=result.log.find(e=>e.text.includes('Fire against'))!.check!;
    expect(check.modifier).toBe(u.stats.volley!+penalty);
  });
  it('extends a shot one hex a level downhill, and leaves the near end where it was',()=>{
    const b=battlefield(kind),u=unit(b,'u0'),foe=unit(b,'u1');
    foe.square=parse('i6');
    expect(targets(b,'shoot')).toEqual([]);
    at(b.board,u.square).elevation=1;
    expect(targets(b,'shoot')).toContain(foe.id);
    expect(shootModifier(b,u,foe)).toBe(u.stats.volley!+1-2);
    at(b.board,u.square).elevation=2;
    expect(shootModifier(b,u,foe)).toBe(u.stats.volley!+1);
    foe.square=parse('e6');
    expect(targets(b,'shoot')).toEqual([]);
    expect(()=>act(b,{type:'shoot',unit:u.id,activity:1,target:foe.id,focus:2},scriptedRng([20]))).toThrow(/no target/);
  });
  it('takes −1 on every attack made uphill',()=>{
    const b=battlefield(kind),u=unit(b,'u0'),foe=unit(b,'u1');
    at(b.board,foe.square).elevation=1;
    expect(shootModifier(b,u,foe)).toBe(u.stats.volley!-1);
    expect(strikeModifier(b,u,foe)).toBe(u.stats.strike!-1);
    at(b.board,u.square).terrain='shallows';
    expect(strikeModifier(b,u,foe)).toBe(u.stats.strike!-1);
  });
  it('uses explicit siege reach for wall bombardment',()=>{
    const b=battlefield(kind),u=unit(b,'u0');
    const wall='e6|f6';b.board.walls[wall]={tier:1,boxes:2,remaining:2};
    u.engines.push({id:'eq-artillery',name:'Artillery',kind:'artillery',reach:'extreme',launch:11,side:'attacker',square:u.square,fired:false,status:'crewed',emplaced:false});
    expect(targets(b,'shoot')).not.toContain(wall);
    expect(siegeAttackOffer(b,u,u.engines[0])!.activities[1].targets.map(t=>t.id)).toContain(wall);
    const result=act(b,{type:'siege',engine:'eq-artillery',operation:'attack',unit:u.id,activity:2,target:wall},scriptedRng([10]));
    expect(result.log.find(e=>e.check)!.check!.modifier).toBe(11);
  });
  it.each([['f6',-2],['g6',0],['h6',0],['i6',0],['j6',-2]] as const)('resolves extreme shots at %s with modifier %i', (cell, penalty)=>{
    const b=battlefield(kind),u=unit(b,'u0'),foe=unit(b,'u1');
    u.square=parse('b6');u.stats.reach='extreme';foe.square=parse(cell);
    const result=act(b,{type:'shoot',unit:u.id,activity:1,target:foe.id},scriptedRng([10]));
    expect(result.log.find(e=>e.text.includes('Fire against'))!.check!.modifier).toBe(u.stats.volley!+penalty);
  });
  it('allows a short weapon across an adjacent wall at −2, but rejects a medium weapon',()=>{
    const b=battlefield(kind),u=unit(b,'u0'),foe=unit(b,'u1');
    foe.square=parse('d6');b.board.walls['c6|d6']={tier:1,boxes:2,remaining:2};
    u.stats.reach='short';expect(targets(b,'shoot')).toContain(foe.id);
    expect(shootModifier(b,u,foe)).toBe(u.stats.volley!-2);
    u.stats.reach='medium';expect(targets(b,'shoot')).toEqual([]);
  });
  it('keeps spell ranges as fixed ceilings without weapon minimum ranges',()=>{
    const b=battlefield(kind),foe=unit(b,'u1');
    foe.square=parse('e6');expect(targets(b,'cast')).toContain(foe.id);
    foe.square=parse('h6');expect(targets(b,'cast')).toEqual([]);
  });
  it('allows shots into mountains but rejects shots and spell shapes beyond them',()=>{
    const b=battlefield(kind),u=unit(b,'u0'),foe=unit(b,'u1');
    at(b.board,parse('e6')).elevation=2;
    expect(hasSight(b.board,u.square,foe.square)).toBe(false);
    expect(hasSight(b.board,foe.square,u.square)).toBe(false);
    expect(targets(b,'shoot')).toEqual([]);
    for(const index of [1,2,3])expect(targets(b,'cast',index)).toEqual([]);
    expect(()=>act(b,{type:'cast',unit:u.id,spell:'blast',activity:1,target:foe.id},scriptedRng([20]))).toThrow(/no target/);
    foe.square=parse('e6');u.stats.reach='medium';
    expect(targets(b,'shoot')).toContain(foe.id);expect(targets(b,'cast')).toContain(foe.id);
    expect(defenceOf(b,foe,u,true)).toBe(foe.stats.defence+1);
    // Painting updates sight despite cached geometry. A hill hides the flat behind it from the
    // flat in front, and from a rise no higher than its crest; a shooter above the crest sees over.
    foe.square=parse('g6');at(b.board,parse('e6')).elevation=1;
    expect(targets(b,'shoot')).toEqual([]);
    at(b.board,u.square).elevation=1;
    expect(targets(b,'shoot')).toEqual([]);
    at(b.board,foe.square).elevation=1;
    expect(hasSight(b.board,u.square,foe.square)).toBe(true);
    at(b.board,foe.square).elevation=0;at(b.board,u.square).elevation=2;
    expect(targets(b,'shoot')).toContain(foe.id);
  });
  it('closes a line that crosses two forest hexes, and screens through a settlement',()=>{
    const b=battlefield(kind),u=unit(b,'u0'),foe=unit(b,'u1');
    at(b.board,parse('e6')).terrain='settlement';
    expect(hasSight(b.board,u.square,foe.square)).toBe(true);
    expect(defenceOf(b,foe,u,true)).toBe(foe.stats.defence+1);
    at(b.board,parse('e6')).terrain='forest';at(b.board,parse('f6')).terrain='forest';
    expect(hasSight(b.board,u.square,foe.square)).toBe(false);
  });
  it('applies forest screening to shots and Blast, without stacking cover or Guard',()=>{
    const b=battlefield(kind),u=unit(b,'u0'),foe=unit(b,'u1');
    at(b.board,parse('e6')).terrain='forest';at(b.board,foe.square).terrain='forest';
    expect(coverBetween(b.board,u.square,foe.square)).toBe(1);
    expect(targets(b,'shoot')).toContain(foe.id);
    expect(defenceOf(b,foe,u,true)).toBe(foe.stats.defence+1);
    expect(defenceOf(b,foe,u,false)).toBe(foe.stats.defence);
    at(b.board,u.square).elevation=1;
    expect(shootModifier(b,u,foe)).toBe(u.stats.volley!+1);
    const result=act(b,{type:'cast',unit:u.id,spell:'blast',activity:1,target:foe.id},scriptedRng([10]));
    const check=result.log.find(e=>e.text.includes('Missile against'))!.check!;
    expect(check.dc).toBe(foe.stats.defence+1);expect(check.modifier).toBe(u.stats.spellAttack!+1);
    foe.guard={defence:2,cap:false,holds:false};
    expect(defenceOf(b,foe,u,true)).toBe(foe.stats.defence+2);
  });
  it('makes swamp cost Defence and Strike; mountain and Guard bonuses do not stack',()=>{
    const b=battlefield(kind),u=unit(b,'u0'),foe=unit(b,'u1');
    at(b.board,u.square).terrain='swamp';
    expect(strikeModifier(b,u,foe)).toBe(u.stats.strike!-1);
    expect(defenceOf(b,u,foe,false)).toBe(u.stats.defence-1);
    at(b.board,u.square).terrain='open';at(b.board,u.square).elevation=2;
    u.guard={defence:2,cap:false,holds:false};
    expect(defenceOf(b,u,foe,false)).toBe(u.stats.defence+2);
  });
  it('requires occupation to fire an emplacement and respects sight and cover',()=>{
    const b=battlefield(kind),u=unit(b,'u0'),foe=unit(b,'u1');
    u.stats.volley=null;u.stats.reach=null;foe.square=parse('h6');
    const e = {id:'eq-test-engine',name:'Test engine',kind:'artillery' as const,reach:'long' as const,launch:11,side:'attacker' as const,square:parse('d6'),fired:false,status:'crewed' as const,emplaced:true};
    b.engines.push(e);
    expect(siegeAttackOffer(b,u,e)).toBeNull();
    u.square=parse('d6');
    expect(siegeAttackOffer(b,u,e)!.activities[0].targets.map(t=>t.id)).toContain(foe.id);
    at(b.board,parse('f6')).terrain='forest';
    const result=act(b,{type:'siege',engine:e.id,operation:'attack',unit:u.id,activity:1,target:foe.id},scriptedRng([10]));
    const check=result.log.find(e=>e.check)!.check!;
    expect(check.modifier).toBe(11);expect(check.dc).toBe(foe.stats.defence+1);
    at(b.board,parse('f6')).elevation=2;
    expect(siegeAttackOffer(b,u,e)!.activities[0].targets).toEqual([]);
  });
  it('reads one hex, not two, where the line runs along a shared edge',()=>{
    const b=battlefield(kind);
    if(kind!=='hex')return;
    // f6 and f8 sit one above the other on screen, so the line between them lies exactly on
    // the f7/g7 edge. It picks a side: a hill on the other one leaves the shot open.
    expect(sightCells(b.board,parse('f6'),parse('f8')).map(notation)).toEqual(['g7']);
    at(b.board,parse('f7')).elevation=1;
    expect(hasSight(b.board,parse('f6'),parse('f8'))).toBe(true);
    at(b.board,parse('f7')).elevation=0;at(b.board,parse('g7')).elevation=1;
    expect(hasSight(b.board,parse('f6'),parse('f8'))).toBe(false);
  });
  it('keeps sight reciprocal for every pair, with endpoints excluded',()=>{
    const b=battlefield(kind);const g=gridOf(b.board);
    for(const to of g.cells()) {
      const from=parse('f6');const cells=sightCells(b.board,from,to).map(notation);
      expect(cells).toEqual(sightCells(b.board,to,from).map(notation));
      expect(cells).not.toContain(notation(from));expect(cells).not.toContain(notation(to));
    }
  });
});
