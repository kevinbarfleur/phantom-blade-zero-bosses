const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(mode='exercise',id='boss'){
 let now=4000,list=[],onKill=()=>{},onFloor=()=>{};
 const saved=[],calls=[],boss={id,classes:['boss-class'],profile:{}},next={id:'next',classes:['next-class'],profile:{}};
 const session={active:true,boss,worldLoadingComplete:true,directArrival:{released:true},ux:{directReady:true,controls:{routable:true},controlExercise:{done:true}},completed:false};
 const UE={KismetSystemLibrary:{IsValid(a){if(a?.validityError)throw Error(a.validityError);return !!a&&!a.invalid&&!a.actor?.invalid;}},GameplayTag:class{},JsonObjectWrapper:class{},NewArray:()=>[],Actor:class{},
  Class:{Find:p=>p,Load:p=>p},GameplayStatics:{GetAllActorsOfClass(c,cls,out){out.value={Num:()=>list.length,Get:i=>list[i]};}},
  AbilitySystemBlueprintLibrary:{GetAbilitySystemComponent(a){assert(a&&!a.invalid,'ASC requested from invalid actor');return a.asc;}},
  PBZBlueprintFunctionLibrary:{MakeAttribute:n=>n,GetAttributeFromCharacter:(a,n)=>n==='Health'?a.health:0},BasicAttributeSet:{StaticClass:()=>1},EGameplayModOp:{Override:1},
  AttributeUtils:{ModifyCharacterAttributeValue(a){calls.push('floor:'+a.name);onFloor(a);}},PBZSaveLoadSubsystem:{StaticClass:()=>1},
  SubsystemBlueprintLibrary:{GetGameInstanceSubsystem:()=>({SaveAdvancedObjectDataAndSync(k,v){saved.push(JSON.parse(JSON.stringify(v)));},SaveAdvancedSaveGameNow(){}})},
  JSONUtility:{ParseStringToJson(text,ok,value){ok.value=true;value.value=JSON.parse(text);}}
 };
 const exports={},modules={ue:UE,puerts:{$ref:value=>({value}),$unref:ref=>ref.value},'./qa-config':{mode,ids:[id,'next']},'./boss-catalog':[boss,next],'./cinema':{pending:()=>false},'./control-qa':{captureDomain(c,s,phase){calls.push('domain:'+phase);return {phase,isActivating:false};}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/exercise-suite.js','utf8'),{exports,Date:{now:()=>now},setTimeout(){},require:n=>{assert(Object.hasOwn(modules,n),n);return modules[n];}});
 const context={},api={showMenu(){},travel(){}};
 function actor(name){
  const a={name,health:100,GetName(){assert(!a.invalid,'GetName on destroyed actor');return name;},K2_GetActorLocation:()=>({X:0,Y:0,Z:0})};
  Object.defineProperty(a,'bHidden',{get(){assert(!a.invalid,'bHidden on destroyed actor');return !!a.hidden;}});
  a.asc={actor:a,HasMatchingGameplayTag:()=>a.dead,MakeEffectContext:()=>({}),BP_ApplyGameplayEffectToSelf(){calls.push('kill:'+name);a.dead=true;a.health=0;onKill(a);}};
  return a;
 }
 return {session,boss,next,calls,saved,actor,UE,modules,tick(){exports.tick(context,session,api);},set actors(v){list=v;},set onKill(v){onKill=v;},set onFloor(v){onFloor=v;},advance(ms){now+=ms;}};
}

test('introduction skip evidence uses a scoped native counter delta and freezes when entry actions finish',()=>{
 const h=harness();h.session.cinematicsSkipped=7;h.session.ux.controlExercise.done=false;h.tick();
 h.session.cinematicsSkipped=8;h.advance(2000);h.tick();
 let r=h.saved.at(-1).current;assert.equal(r.cinematicsSkippedBefore,7);assert.equal(r.cinematicsSkippedAfter,8);assert.equal(r.cinematicsSkippedDuringIntroduction,1);
 h.session.ux.controlExercise.done=true;h.advance(2000);h.tick();
 h.session.cinematicsSkipped=10;h.advance(2000);h.tick();r=h.saved.at(-1).current;
 assert.equal(r.cinematicsSkippedAfter,8);assert.equal(r.cinematicsSkippedDuringIntroduction,1);assert.equal(r.introductionSkipCounter.frozen,true);assert.equal(r.introductionSkipCounter.physicalCircleVerified,false);
});

test('zero or inherited skip counts do not establish a skipped introduction',()=>{
 for(const initial of [undefined,0,4]){
  const h=harness();h.session.cinematicsSkipped=initial;h.tick();const r=h.saved.at(-1).current;
  assert.equal(r.cinematicsSkippedBefore,initial??0);assert.equal(r.cinematicsSkippedAfter,initial??0);assert.equal(r.cinematicsSkippedDuringIntroduction,0);
 }
});

test('terminal or late cinematic skips cannot contaminate an unfinished entry window',()=>{
 const h=harness();h.session.ux.controlExercise.done=false;h.tick();
 h.session.completed=true;h.session.cinematicsSkipped=1;h.advance(2000);h.tick();
 let r=h.saved.at(-1).current;assert.equal(r.cinematicsSkippedDuringIntroduction,0);assert.equal(r.cinematicsSkippedAfter,0);assert.equal(r.introductionSkipCounter.endReason,'encounter-completed');
 h.session.completed=false;h.session.ux.controlExercise.done=true;h.advance(2000);h.tick();
 r=h.saved.at(-1).current;assert.equal(r.cinematicsSkippedDuringIntroduction,0);
});

test('entry counter freezes at action completion even while presentation keeps the stage in entry',()=>{
 const h=harness();h.session.cinematicsSkipped=0;h.session.ux.controlExercise.done=false;h.tick();
 h.session.cinematicsSkipped=1;h.session.ux.controlExercise.done=true;h.session.cinematicActive=true;h.advance(2000);h.tick();
 h.session.cinematicsSkipped=2;h.advance(2000);h.tick();let r=h.saved.at(-1).current;
 assert.equal(r.stage,'entry');assert.equal(r.cinematicsSkippedAfter,1);assert.equal(r.cinematicsSkippedDuringIntroduction,1);
});

test('invalid or reset native skip counters remain unknown rather than positive evidence',()=>{
 for(const change of ['1',-1,NaN,1]){
  const h=harness();h.session.cinematicsSkipped=2;h.session.ux.controlExercise.done=false;h.tick();h.session.cinematicsSkipped=change;h.advance(2000);h.tick();
  assert.equal(h.saved.at(-1).current.cinematicsSkippedDuringIntroduction,null);
 }
});
test('terminal QA copies native actor list before death callbacks clear that list',()=>{
 const h=harness(),a=h.actor('a'),b=h.actor('b');h.actors=[undefined,a,b];
 h.onKill=()=>{h.actors=[];};h.tick();
 assert.deepEqual(h.calls.filter(x=>x.startsWith('kill:')),['kill:a','kill:b']);
 assert.deepEqual(h.saved.at(-1).current.killed,['a','b']);
});
test('synchronous self and sibling despawn is recorded absent without dereferencing invalid wrappers',()=>{
 const h=harness(),a=h.actor('a'),b=h.actor('b');h.actors=[a,b];h.onKill=()=>{a.invalid=true;b.invalid=true;};
 assert.doesNotThrow(()=>h.tick());
 assert.deepEqual(h.calls.filter(x=>x.startsWith('kill:')),['kill:a']);
 assert.deepEqual(h.saved.at(-1).current.killAttempts[0].post,{present:false});
 h.advance(1200);h.actors=[undefined,b];assert.doesNotThrow(()=>h.tick());
 assert.equal(h.saved.at(-1).current.killAttempts.length,1);
});
test('native invalidation during Health_Min change prevents applying an effect through a dead ASC',()=>{
 const h=harness(),a=h.actor('a');h.actors=[a];h.onFloor=()=>{a.invalid=true;};h.tick();
 assert.deepEqual(h.calls,['floor:a']);assert.equal(h.saved.at(-1).current.killed.length,0);
 assert.equal(h.saved.at(-1).current.killAttempts[0].skipped,'native-actor-invalidated-before-effect');
});
test('a reentrant tick and native encounter switch cannot mutate remaining actors in the old world',()=>{
 const h=harness(),a=h.actor('a'),b=h.actor('b');h.actors=[a,b];
 h.onKill=()=>{h.tick();h.session.boss=h.next;h.tick();};h.tick();
 assert.deepEqual(h.calls.filter(x=>x.startsWith('kill:')),['kill:a']);
 // Next normal frame may finish the previous case and discover the new one.
 h.actors=[];assert.doesNotThrow(()=>h.tick());assert.equal(h.saved.at(-1).results[0].id,'boss');
});
test('unexpected native effect exceptions remain visible and release the reentrancy guard',()=>{
 const h=harness(),a=h.actor('a');h.actors=[a];h.onKill=()=>{throw Error('native effect failed');};
 assert.throws(()=>h.tick(),/native effect failed/);
 h.session.boss={id:'unexpected',classes:[],profile:{}};
 assert.throws(()=>h.tick(),/Unexpected QA encounter transition/,'Subsequent invocation must not be silently gated');
});
test('manual public mode cannot enumerate or kill actors',()=>{
 const h=harness('manual'),a=h.actor('a');h.actors=[a];h.tick();assert.deepEqual(h.calls,[]);assert.deepEqual(h.saved,[]);
});
test('Puerts rejected destroyed pawn after GE_Kill is absent, not a runtime failure',()=>{
 const h=harness(),a=h.actor('a');h.actors=[a];h.onKill=()=>{a.validityError='passing a invalid object';};
 assert.doesNotThrow(()=>h.tick());assert.deepEqual(h.saved.at(-1).current.killAttempts[0].post,{present:false});
 h.advance(1500);assert.doesNotThrow(()=>h.tick());
});
test('Puerts rejected ASC after Health_Min prevents GE_Kill without claiming a death',()=>{
 const h=harness(),a=h.actor('a');h.actors=[a];h.onFloor=()=>{a.asc.validityError='passing a invalid object';};
 assert.doesNotThrow(()=>h.tick());assert.deepEqual(h.calls,['floor:a']);
 assert.equal(h.saved.at(-1).current.killAttempts[0].skipped,'native-actor-invalidated-before-effect');
 assert.deepEqual(h.saved.at(-1).current.killed,[]);
});
test('unexpected IsValid bridge failures remain visible',()=>{
 const h=harness(),a=h.actor('a');h.actors=[a];a.validityError='unexpected native dispatch failure';
 assert.throws(()=>h.tick(),/unexpected native dispatch failure/);
});
test('XiaoXue domain observation precedes any terminal health mutation and is retained in its case',()=>{
 const h=harness('exercise','BP_Monster_XiaoXue'),a=h.actor('a');h.actors=[a];h.tick();
 assert.deepEqual(h.calls,['domain:preterminal','floor:a','kill:a','domain:postterminal-effect']);
 assert.deepEqual(h.saved.at(-1).current.domainBeforeTerminal,{phase:'preterminal',isActivating:false});
});

test('zero candidates may be retried once per second when the expected actor later becomes visible',()=>{
 const h=harness(),a=h.actor('native-boss');h.actors=[];h.tick();const first=h.saved.at(-1).current;
 assert.equal(first.killAttempts.length,0);assert.equal(first.terminalCandidateScans[0].candidates[0].reason,'no-actors');
 h.actors=[a];h.advance(999);h.tick();assert.deepEqual(h.calls,[]);h.advance(1);h.tick();assert.deepEqual(h.calls,['floor:native-boss','kill:native-boss']);
 h.advance(1000);h.tick();const r=h.saved.at(-1).current;assert.equal(r.killAt,first.killAt);assert.equal(r.terminalCandidateScans.length,2);assert.equal(r.killAttempts.length,1);assert.equal(r.killAttempts[0].effectCallReturned,true);
 for(let i=0;i<12;i++){h.advance(1000);h.tick();}assert.equal(h.calls.filter(c=>c.startsWith('kill:')).length,1);
});

test('always absent candidates stop retrying after 15 seconds without extending the original 90-second deadline',()=>{
 const h=harness();h.tick();for(let i=0;i<20;i++){h.advance(1000);h.tick();}let r=h.saved.at(-1).current;
 assert.equal(r.terminalCandidateScans.length,16);assert.equal(r.terminalCandidateScans.at(-1).afterMs,15000);assert.equal(r.killAttempts.length,0);assert.equal(r.killAt,4000);assert.deepEqual(h.calls,[]);
 h.advance(70001);h.tick();r=h.saved.at(-1).results[0];assert.equal(r.error,'Native terminal transition not completed in 90s');assert.equal(r.automaticNext,false);assert.equal(r.terminalCandidateScans.length,16);assert.equal(r.killAttempts.length,0);
});

test('native error or partial health-floor mutation never permits a retry',()=>{
 for(const stage of ['floor','effect','invalidation']){
  const h=harness(),a=h.actor('a');h.actors=[a];
  if(stage==='floor')h.onFloor=()=>{throw Error('partial native floor failure');};else if(stage==='effect')h.onKill=()=>{throw Error('partial native effect failure');};else h.onFloor=()=>{a.invalid=true;};
  if(stage==='invalidation')h.tick();else assert.throws(()=>h.tick(),/partial native/);
  h.onFloor=()=>{};h.onKill=()=>{};a.invalid=false;h.advance(2000);h.tick();h.advance(2000);h.tick();
  const r=h.saved.at(-1).current;assert.equal(r.killAttempts.length,1);assert.equal(r.terminalCandidateScans.length,1);assert.equal(h.calls.filter(c=>c.startsWith('floor:')).length,1);assert.equal(h.calls.filter(c=>c.startsWith('kill:')).length,stage==='effect'?1:0);
 }
});

test('candidate diagnostics retain rejection reasons without killing hidden, far, dead, invalid or ASC-less actors',()=>{
 const h=harness(),hidden=h.actor('hidden'),far=h.actor('far'),dead=h.actor('dead'),missing=h.actor('no-asc'),badPosition=h.actor('bad-position');
 hidden.hidden=true;far.K2_GetActorLocation=()=>({X:7001,Y:0,Z:0});dead.dead=true;delete missing.asc;badPosition.K2_GetActorLocation=()=>({X:NaN,Y:0,Z:0});h.boss.profile.arena={X:0,Y:0,Z:0};h.actors=[undefined,hidden,far,dead,missing,badPosition];h.tick();
 const rows=h.saved.at(-1).current.terminalCandidateScans[0].candidates;assert.deepEqual(rows.map(r=>r.reason),['invalid-wrapper','hidden','outside-7000cm','already-dead','no-valid-asc','invalid-position']);assert.deepEqual(h.calls,[]);
 hidden.hidden=false;h.advance(2000);h.tick();assert.deepEqual(h.calls,['floor:hidden','kill:hidden']);
});

test('retry never crosses a cinematic/loading/completion gate or changed arrival ownership',()=>{
 for(const gate of ['cinema','pending','loading','cover','completed','arrival','inactive']){
  const h=harness(),a=h.actor('a');h.tick();h.actors=[a];
  if(gate==='cinema')h.session.cinematicActive=true;else if(gate==='pending')h.modules['./cinema'].pending=()=>true;else if(gate==='loading')h.session.worldLoadingComplete=false;else if(gate==='cover')h.modules['./cinema'].entryLoadingActive=()=>true;else if(gate==='completed')h.session.completed=true;else if(gate==='arrival')h.session.directArrival={released:true};else h.session.active=false;
  h.advance(2000);h.tick();assert.deepEqual(h.calls,[],gate);
 }
});

test('candidate enumeration error is diagnosed and never retried even with zero mutations',()=>{
 const h=harness();h.UE.GameplayStatics.GetAllActorsOfClass=()=>{throw Error('native enumeration failed');};assert.throws(()=>h.tick(),/native enumeration failed/);
 let enumerations=0;h.UE.GameplayStatics.GetAllActorsOfClass=(c,cls,out)=>{enumerations++;out.value={Num:()=>0};};h.advance(2000);h.tick();const r=h.saved.at(-1).current;
 assert.equal(r.terminalRetryBlocked,'native-error');assert.equal(r.terminalCandidateScans.length,1);assert.equal(r.killAttempts.length,0);assert.match(r.terminalCandidateScans[0].error,/enumeration failed/);assert.equal(enumerations,1,'terminal observation may enumerate once, candidate retry must not');
});


test('BigBro authored domain observation is retained before terminal mutation',()=>{
 const h=harness('exercise','BP_Monster_HuaShan_RedTroop_BigBro'),a=h.actor('a');h.actors=[a];h.tick();
 assert.deepEqual(h.calls,['domain:preterminal']);
 assert.equal(h.saved.at(-1).current.supportTerminal.blocked,'authored-seven-member-profile-required');
 assert.deepEqual(h.saved.at(-1).current.domainBeforeTerminal,{phase:'preterminal',isActivating:false});
});

test('synchronous arrival replacement or cinematic starts stop the same scan before further effects',()=>{
 for(const gate of ['arrival','cinema']){
  const h=harness(),a=h.actor('a'),b=h.actor('b');h.actors=[a,b];
  h.onFloor=()=>{if(gate==='arrival')h.session.directArrival={released:true};else h.session.cinematicActive=true;};
  h.tick();assert.deepEqual(h.calls,['floor:a'],gate);
  h.advance(2000);h.tick();assert.deepEqual(h.calls,['floor:a'],gate+' must not retry partial mutation');
 }
});


test('four proven native terminal cases require manual completion without forced mutation',()=>{
 for(const id of ['BP_Monster_GreatBladeMan','BP_Monster_LengTu','BP_Monster_MengHua','MoTian_Trial_5']){
  const h=harness('exercise',id);h.actors=[h.actor('a')];h.tick();
  assert.deepEqual(h.calls,[],id);const result=h.saved.at(-1).results[0];
  assert.equal(result.fullFight,'manual-required',id);assert(result.manualReason);assert.equal(result.killAt,undefined);
 }
});

test('first four MoTian trials and unresolved domains remain eligible for terminal diagnostics',()=>{
 for(const id of ['MoTian_Trial_1','MoTian_Trial_2','MoTian_Trial_3','MoTian_Trial_4','BP_Monster_XiaoXue','BP_Monster_YanQianSui','BP_Monster_FengXueDaoKe']){
  const h=harness('exercise',id);h.actors=[h.actor('a')];h.tick();
  assert(h.calls.includes('kill:a'),id);assert.equal(h.saved.at(-1).current.fullFight,undefined,id);
 }
});
function redTroopHarness(){
 const h=harness('exercise','BP_Monster_HuaShan_RedTroop_BigBro'),primary=h.actor('primary');
 h.UE.KismetSystemLibrary.GetPathName=o=>o.path;
 const group={path:'/authored/group'},supports=Array.from({length:6},(_,i)=>h.actor('soldier'+i));
 for(const a of supports)a.GetClass=()=>({path:'/native/soldier'});
 const spawners=[primary,...supports].map((pawn,i)=>({GetName:()=>`spawner${i}`,MobGroup:group,GetPawn:()=>pawn}));
 h.boss.profile.spawners=spawners.map(s=>s.GetName());h.boss.profile.primarySpawnerActor='spawner0';h.boss.supportClasses=['/native/soldier'];
 h.UE.GameplayStatics.GetAllActorsOfClass=(c,cls,out)=>{const list=cls.includes('BP_AISpawner')?spawners:[primary];out.value={Num:()=>list.length,Get:i=>list[i]};};
 primary.floor=.01;h.UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter=(a,n)=>n==='Health'?a.health:a.floor||0;
 return Object.assign(h,{primary,supports,spawners});
}
test('BigBro forces precisely six authored supports, waits native unlock, then kills primary without floor edits',()=>{
 const h=redTroopHarness();h.tick();
 assert.deepEqual(h.calls,['domain:preterminal',...h.supports.map(a=>'kill:'+a.name)]);
 assert.equal(h.saved.at(-1).current.killAttempts.length,0);assert.equal(h.saved.at(-1).current.supportTerminal.attempts.length,6);
 h.advance(2000);h.tick();assert.equal(h.calls.length,7,'supports never retried while native floor remains');
 h.primary.floor=0;h.advance(2000);h.tick();assert.equal(h.calls.at(-1),'kill:primary');assert(!h.calls.some(c=>c.startsWith('floor:')));
 h.advance(2000);h.tick();assert.equal(h.calls.filter(c=>c==='kill:primary').length,1);assert.equal(h.saved.at(-1).current.supportTerminal.nativeFloorReleased,true);
});
test('BigBro missing or mismatched support cannot permit partial mutation or primary bypass',()=>{
 for(const fault of ['missing','group','class']){
  const h=redTroopHarness();
  if(fault==='missing')h.spawners[6].GetPawn=()=>null;
  if(fault==='group')h.spawners[6].MobGroup={path:'/other/group'};
  if(fault==='class')h.supports[5].GetClass=()=>({path:'/other/class'});
  h.tick();h.advance(2000);h.tick();assert.deepEqual(h.calls,['domain:preterminal'],fault);assert(h.saved.at(-1).current.supportTerminal.blocked);
 }
});
test('BigBro support batch retains ownership and does not repeat after partial exception',()=>{
 for(const fault of ['arrival','cinema','throw']){
  const h=redTroopHarness();h.onKill=()=>{h.tick();if(fault==='arrival')h.session.directArrival={released:true};else if(fault==='cinema')h.session.cinematicActive=true;else throw Error('support effect failed');};
  if(fault==='throw')assert.throws(()=>h.tick(),/support effect failed/);else h.tick();
  h.onKill=()=>{};h.session.cinematicActive=false;h.advance(2000);h.tick();assert.equal(h.calls.filter(c=>c.startsWith('kill:')).length,1,fault);
 }
});
test('BigBro permanent native floor remains bounded without modifying the floor or reporting victory',()=>{
 const h=redTroopHarness();h.tick();for(let i=0;i<16;i++){h.advance(1000);h.tick();}h.advance(75000);h.tick();
 const r=h.saved.at(-1).results[0];assert.match(r.error,/90s/);assert.equal(r.supportTerminal.nativeFloorReleased,false);assert.equal(r.killAttempts.length,0);assert.equal(h.calls.filter(c=>c.startsWith('kill:')).length,6);
});


test('entry QA allows a long native intro yet stops at the independent600s bound',()=>{
 const h=harness();h.session.ux.controlExercise.done=false;h.session.cinematicActive=true;h.tick();
 h.advance(240000);h.tick();assert.equal(h.saved.at(-1).current.stage,'entry');assert.equal(h.saved.at(-1).current.entryDeadlineMs,600000);assert.deepEqual(h.calls,[]);
 h.advance(359999);h.tick();assert.equal(h.saved.at(-1).results.length,0);h.advance(1);h.tick();
 const r=h.saved.at(-1).results[0];assert.equal(r.error,'Entry/action timeout');assert.equal(r.finished-r.started,600000);assert.deepEqual(h.calls,[]);
});

test('entry actions after a four-minute intro proceed normally without extending terminal timeout',()=>{
 const h=harness();h.session.ux.controlExercise.done=false;h.session.cinematicActive=true;h.tick();h.advance(240000);h.tick();
 h.session.cinematicActive=false;h.session.ux.controlExercise.done=true;h.tick();const r=h.saved.at(-1).current;assert.equal(r.stage,'terminal-death');assert.equal(r.killAt-r.started,240000);
 h.advance(90001);h.tick();assert.equal(h.saved.at(-1).results[0].error,'Native terminal transition not completed in 90s');
});

test('XiaoXue private player-credit retake changes only the native effect context owner',()=>{
 const h=harness('exercise','BP_Monster_XiaoXue'),boss=h.actor('xue'),player=h.actor('player'),playerContext={instigator:'player'};
 h.modules['./qa-config'].xiaoXuePlayerKillContext=true;h.UE.GameplayStatics.GetPlayerCharacter=()=>player;player.asc.MakeEffectContext=()=>playerContext;
 let received;boss.asc.BP_ApplyGameplayEffectToSelf=(cls,level,ctx)=>{received=ctx;h.calls.push('kill:xue');boss.health=0;boss.dead=true;};h.actors=[boss];h.tick();
 assert.equal(received,playerContext);assert.equal(h.saved.at(-1).current.killAttempts[0].effectContextMethod,'player-asc-context-applied-to-target');assert.equal(h.saved.at(-1).current.killAttempts[0].instigatorActor,'player');
});
test('player-credit QA flag is inert for other bosses, default retakes and manual mode',()=>{
 for(const [mode,id,flag] of [['exercise','boss',true],['exercise','BP_Monster_XiaoXue',false],['manual','BP_Monster_XiaoXue',true]]){
  const h=harness(mode,id),a=h.actor('a'),self={instigator:'target'};h.modules['./qa-config'].xiaoXuePlayerKillContext=flag;
  h.UE.GameplayStatics.GetPlayerCharacter=()=>{assert.fail('player context must not be requested');};a.asc.MakeEffectContext=()=>self;
  let received;a.asc.BP_ApplyGameplayEffectToSelf=(cls,level,ctx)=>{received=ctx;};h.actors=[a];h.tick();assert.equal(received,mode==='manual'?undefined:self);
 }
});
test('XiaoXue missing player context cannot silently fall back or partially mutate the boss',()=>{
 const h=harness('exercise','BP_Monster_XiaoXue'),a=h.actor('a');h.modules['./qa-config'].xiaoXuePlayerKillContext=true;h.UE.GameplayStatics.GetPlayerCharacter=()=>null;h.actors=[a];h.tick();h.advance(2000);h.tick();
 assert.deepEqual(h.calls,['domain:preterminal']);assert.equal(h.saved.at(-1).current.killAttempts.length,1);assert.equal(h.saved.at(-1).current.killAttempts[0].skipped,'player-effect-context-unavailable');
});


test('private Xue attack finish bypasses every GE_Kill and Health_Min path, then waits for native completion',()=>{
 const h=harness('exercise','BP_Monster_XiaoXue');h.modules['./qa-config'].xiaoXueAttackFinish=true;
 let dead=false;h.modules['./xue-attack-finish']={tick(c,s,r){h.calls.push('native-attack-tick');if(dead)Object.assign(r,{done:true,deathObserved:true,deathAt:7000,actor:'claimed-primary'});},stop(){h.calls.push('attack-stop');}};
 h.actors=[h.actor('other')];h.tick();assert.equal(h.saved.at(-1).current.stage,'terminal-attack');
 assert.equal(h.calls.some(x=>x.startsWith('kill:')||x.startsWith('floor:')),false);
 dead=true;h.advance(3000);h.tick();h.advance(2000);h.tick();
 assert.equal(h.saved.at(-1).current.stage,'terminal-death');assert.equal(h.saved.at(-1).current.killAttempts.length,0);
 assert.equal(h.calls.some(x=>x.startsWith('kill:')||x.startsWith('floor:')),false);
 h.session.completed=true;h.session.ux.resultShown=true;h.session.autoNext=false;h.tick();
 assert.ok(h.calls.includes('attack-stop'));assert.equal(h.saved.at(-1).results[0].completed,true);
});
test('failed private Xue native attack ends inconclusive with no forced-effect fallback',()=>{
 const h=harness('exercise','BP_Monster_XiaoXue');h.modules['./qa-config'].xiaoXueAttackFinish=true;
 h.modules['./xue-attack-finish']={tick(c,s,r){Object.assign(r,{done:true,reason:'native-attack-timeout'});},stop(){}};
 h.actors=[h.actor('boss')];h.tick();h.advance(2000);h.tick();
 assert.match(h.saved.at(-1).results[0].error,/inconclusive/);
 assert.equal(h.calls.some(x=>x.startsWith('kill:')||x.startsWith('floor:')),false);
});
