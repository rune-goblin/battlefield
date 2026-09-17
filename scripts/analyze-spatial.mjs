// Compile the engine to a temporary directory, then pass it here. No game state is changed.
// See docs/plans/movement-range-review.md for assumptions and reproduction commands.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
if (!process.argv[2]) throw new Error('Usage: node scripts/analyze-spatial.mjs <compiled-engine-directory> [seed-count]');
const e = await import(pathToFileURL(resolve(process.argv[2], 'index.js')).href);
const samples = Number(process.argv[3] ?? 200);
if (!Number.isInteger(samples) || samples < 1) throw new Error('seed-count must be a positive integer');
const { LIBRARY, COMBATANTS, OFFICIAL, ROSTER, generateBoard, gridOf, at, notation, parse,
  reachable, feetTo, barrierBetween, squaresPerAction, deriveStats, degreeOf, createBattle,
  select, activation, movePath, engagedEnemies, rangeBetween, shootModifier, defenceOf } = e;
const tally = values => values.reduce((counts, value) => (counts[value] = (counts[value] ?? 0) + 1, counts), {});
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const rounded = n => Math.round(n * 1000) / 1000;
function stats(values) {
  const finite = values.filter(Number.isFinite).sort((a,b) => a-b);
  return { n:values.length, unreachable:values.length-finite.length, min:finite[0], mean:rounded(mean(finite)),
    median:finite[Math.floor((finite.length-1)*.5)], p90:finite[Math.floor((finite.length-1)*.9)], max:finite.at(-1) };
}
const blank = () => {
  const board = generateBoard({ base:'plains', feature:'none', construction:null, seed:1 });
  for (const cell of gridOf(board).cells()) Object.assign(at(board,cell), {terrain:'open',elevation:0});
  return board;
};
const grid = gridOf(blank());
const cells = grid.cells();
const front = side => cells.filter(c => c.rank === (side === 'attacker' ? 2 : 8));
const deployment = side => cells.filter(c => e.canDeploy(blank(),side,false,c));
const distances = deployment('attacker').flatMap(a => deployment('defender').map(b => grid.distance(a,b)));
const bandCounts = (origin, ceilings) => Object.fromEntries(ceilings.map(r => [r,cells.filter(c => grid.distance(origin,c)>0 && grid.distance(origin,c)<=r).length]));
const geometry = {
  cells:cells.length, diameter:Math.max(...cells.flatMap(a => cells.map(b => grid.distance(a,b)))),
  deploymentCellsPerSide:deployment('attacker').length,
  deploymentDistances:tally(distances), deploymentDistanceSummary:stats(distances),
  frontlineDistances:tally(front('attacker').flatMap(a => front('defender').map(b => grid.distance(a,b)))),
  withinRadius:Object.fromEntries(['f6','f3','e3'].map(n => [n,bandCounts(parse(n),[1,2,3,4,5,6,8])])),
  deploymentGeometricCoverage:Object.fromEntries([2,3,4,5,6,8].map(r => [r,rounded(distances.filter(d=>d<=r).length/distances.length)])),
};
const library = {
  counts:{combatants:COMBATANTS.length,official:OFFICIAL.length,prototype:ROSTER.length,total:LIBRARY.length},
  cellsPerAction:tally(LIBRARY.map(squaresPerAction)), sheetSpeeds:tally(LIBRARY.filter(c=>c.sheet).map(c=>c.sheet.speed)),
  reach:tally(LIBRARY.map(c=>deriveStats(c).reach??'none')),
  zeroSpeed:LIBRARY.filter(c=>c.sheet?.speed===0).map(c=>({name:c.name,flying:c.sheet.fly,cells:squaresPerAction(c)})),
  defaultUnits:['Line Infantry','Heavy Cavalry','Apprentice Magician Clique','Kobold Warriors','Troll Marauders','Mitflit Vermin Cavalry'].map(name=>{
    const c=LIBRARY.find(c=>c.name===name); const s=deriveStats(c);
    return {name,sheetSpeed:c.sheet.speed,cellsPerAction:squaresPerAction(c),sheetSalvo:c.sheet.salvoFeet,reach:s.reach};
  }),
};
const terrain = [];
for (const [base,feature] of [['plains','none'],['forest','none'],['hills','none'],['mountains','none'],['swamp','none'],['desert','none'],['plains','river'],['plains','lakeside']]) {
  const costs=[], terrainCounts={}, moveCounts={1:[],2:[],3:[],6:[]};
  let noCrossingBoards=0, anyUnreachableBoards=0, elevated=0;
  const disconnectedSeeds=[];
  for(let seed=1;seed<=samples;seed++) {
    const board=generateBoard({base,feature,construction:null,seed});
    for(const c of cells) { const s=at(board,c); terrainCounts[s.terrain]=(terrainCounts[s.terrain]??0)+1; if(s.elevation>0)elevated++; }
    const local=[];
    for(const start of front('attacker').filter(c=>e.canDeploy(board,'attacker',false,c))) {
      const reach=reachable(board,start,{budget:Infinity});
      for(const budget of [1,2,3,6]) moveCounts[budget].push([...reach.entries()].filter(([key,v])=>key!==notation(start)&&v.feet<=budget*10).length);
      for(const target of front('defender').filter(c=>e.canDeploy(board,'defender',false,c))) {
        const contact=grid.neighbours(target).filter(n=>barrierBetween(board,n,target)===null);
        local.push(Math.min(...contact.map(n=>feetTo(reach,notation(n))))/10);
      }
    }
    if(local.every(x=>!Number.isFinite(x))) { noCrossingBoards++; disconnectedSeeds.push(seed); }
    if(local.some(x=>!Number.isFinite(x))) anyUnreachableBoards++;
    costs.push(...local);
  }
  terrain.push({base,feature,seeds:samples,terrainPercent:Object.fromEntries(Object.entries(terrainCounts).map(([k,v])=>[k,rounded(v/(samples*cells.length)*100)])),
    elevatedPercent:rounded(elevated/(samples*cells.length)*100), contactCostOpenHexEquivalents:stats(costs),
    pureMoveActionsToContact:{speed1:stats(costs.map(x=>Math.ceil(x))),speed2:stats(costs.map(x=>Math.ceil(x/2))),speed3:stats(costs.map(x=>Math.ceil(x/3)))},
    meanReachableDestinations:Object.fromEntries(Object.entries(moveCounts).map(([k,v])=>[k,rounded(mean(v))])),
    noMoveAtBudget1:rounded(moveCounts[1].filter(x=>x===0).length/moveCounts[1].length), noCrossingBoards, anyUnreachableBoards, disconnectedSeeds});
}
// Action lower bounds for a straight, unobstructed, uniform-terrain approach to a
// stationary opponent. Charge folds up to one Speed of movement into the final Strike.
const uniformApproach=[];
for(const distance of [4,5,6,8]) for(const cost of [1,2,3]) for(const speed of [1,2,3]) {
  const steps=distance-1;
  const run=Math.floor(speed/cost);
  const actions=run>0 ? Math.ceil(Math.max(0,steps-run)*cost/speed)+1 : Math.ceil(steps*cost/speed)+1;
  const movePerTurn=Math.floor(3*speed/cost);
  const moveOnAttackTurn=Math.floor(2*speed/cost)+run;
  const earliestOwnActivation=1+Math.ceil(Math.max(0,steps-moveOnAttackTurn)/movePerTurn);
  uniformApproach.push({distance,terrainCost:cost,speed,actionLowerBound:actions,earliestOwnActivation,canCharge:run>0});
}
function attackOdds(modifier,dc) {
  const results=Array.from({length:20},(_,i)=>degreeOf(i+1,modifier,dc));
  const crit=results.filter(x=>x==='critical-success').length/20;
  const hit=results.filter(x=>x==='success').length/20;
  return {hitOrCrit:rounded(hit+crit),critical:rounded(crit),expectedWounds:rounded(hit+2*crit)};
}
const shooting=[];
for(const reach of [1,2,3,4]) for(const distance of [1,2,3,4,5,6,7,8,9]) for(const commitment of [0,4]) {
  const [min,max]=[[0,0],[2,2],[3,3],[4,4],[5,7]][reach];
  const legal=distance>1 && distance>=min-1 && distance<=max+1;
  const rangePenalty=distance<min || distance>max ? 2 : 0;
  shooting.push({reach,distance,commitment,preferred:[min,max],rangePenalty,legal,...(legal?attackOdds(11+commitment-rangePenalty,24):{hitOrCrit:0,critical:0,expectedWounds:0})});
}
// Confirm range legality through an intervening high forest ridge with the real offers API.
const infantry=LIBRARY.find(c=>c.name==='Line Infantry');
let obstruction=blank();
for(const c of cells.filter(c=>c.rank===4)) Object.assign(at(obstruction,c),{terrain:'forest',elevation:2});
let battle=createBattle({board:obstruction,units:[{card:infantry,side:'attacker',square:'e3'},{card:infantry,side:'defender',square:'e9'}]});
battle.units[0].square=parse('c6'); battle.units[1].square=parse('f6');
for(const c of cells)Object.assign(at(obstruction,c),{terrain:'open',elevation:0});
battle.board=obstruction;Object.assign(at(obstruction,parse('e6')),{terrain:'forest',elevation:2});
battle=select(battle,'u0');
const shot=activation(battle).offers.find(o=>o.type==='shoot');
const obstructionCheck={from:'c6',to:'f6',intervening:'e6 forest, elevation 2',range:rangeBetween(battle,battle.units[0],battle.units[1]),
  shootLegal:shot?.activities[0].legal,targets:shot?.activities[0].targets.map(t=>t.id),
  modifier:shootModifier(battle,battle.units[0],battle.units[1]),defence:defenceOf(battle,battle.units[1],battle.units[0],true)};
// Recheck the exact ordinary-Move route that previously bypassed enemy contact.
const bypass=structuredClone(battle); bypass.board=blank();
const mover=bypass.units[0], obstacle=bypass.units[1];
mover.square=parse('d1');mover.speed=20;mover.actions=3;mover.feet=0;obstacle.square=parse('f1');
const bypassPath=movePath(bypass,mover,'h1');
const contactBypass=bypassPath.some(p=>grid.distance(parse(p.cell),obstacle.square)===1)
  ? {from:'d1',enemy:'f1',to:'h1',path:bypassPath.map(p=>p.cell),actions:bypassPath.at(-1).actions,engagedAtStart:engagedEnemies(bypass,mover).length}
  : null;
// An ordinary final-action Move discards banked distance when finish() advances play.
let lastMove=createBattle({board:blank(),units:[{card:infantry,side:'attacker',square:'c2'},{card:infantry,side:'defender',square:'e9'}]});
lastMove=select(lastMove,'u0'); lastMove.units[0].speed=20;
lastMove=e.act(lastMove,{type:'guard',activity:2},{d20:()=>10});
const beforeMoves=e.moveReach(lastMove,lastMove.units[0]);
const afterMove=e.act(lastMove,{type:'move',to:'d2'},{d20:()=>10});
const movementBankCheck={speed:20,actionsBefore:1,oneHex:beforeMoves.get('d2'),twoHexes:beforeMoves.get('e2'),
  afterOneHex:{cell:notation(afterMove.units[0].square),bank:afterMove.units[0].feet,activated:afterMove.activated.includes('u0'),active:afterMove.active}};
const wounded=structuredClone(battle); wounded.units[0].wounds=2;
const woundedRangeCheck={displayedBand:e.reachOf(wounded,wounded.units[0]),actualEffectiveBand:e.shootHome(wounded,wounded.units[0]),
  shotModifier:shootModifier(wounded,wounded.units[0],wounded.units[1])};
// Exact geometry comparisons independent of the engine's current fixed radius. These do
// not simulate generated terrain, combat or revised deployment presets on larger boards.
const cubeDistance=(a,b)=>(Math.abs(a.q-b.q)+Math.abs(a.r-b.r)+Math.abs(a.s-b.s))/2;
const boardSizes=[4,5,6].map(radius=>{
  const cells=[];
  for(let q=-radius;q<=radius;q++)for(let r=-radius;r<=radius;r++) {
    const s=-q-r;if(Math.abs(s)<=radius)cells.push({q,r,s});
  }
  const attackers=cells.filter(c=>c.r < -radius+3);
  const defenders=cells.filter(c=>c.r > radius-3);
  const gaps=attackers.flatMap(a=>defenders.map(b=>cubeDistance(a,b)));
  const nearest=Math.min(...gaps);
  return {radius,cells:cells.length,width:2*radius+1,diameter:2*radius,
    deploymentCellsPerSide:attackers.length,deploymentDistances:stats(gaps),
    nearestFrontFirstAttackActivationAtSpeed1:Math.ceil((nearest-1)/3),
    centreCoverage:Object.fromEntries([2,3,4,6,8].map(range=>[range,cells.filter(c=>{
      const d=cubeDistance(c,{q:0,r:0,s:0});return d>0&&d<=range;
    }).length]))};
});
if(boardSizes[1].cells!==geometry.cells || boardSizes[1].deploymentDistances.mean!==geometry.deploymentDistanceSummary.mean)throw new Error('Independent geometry disagrees with engine');
if(geometry.cells!==91 || geometry.diameter!==10)throw new Error('Board geometry changed; review assumptions');
// Behavioural checks report the current result; null contactBypass means control now stops the route.
console.log(JSON.stringify({samples,library,geometry,boardSizes,terrain,uniformApproach,shooting,obstructionCheck,contactBypass,movementBankCheck,woundedRangeCheck},null,2));
