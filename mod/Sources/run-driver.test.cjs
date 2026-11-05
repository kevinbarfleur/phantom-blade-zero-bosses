const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),model=require('./run-model');
function delegate(){const handlers=new Set();return {Add:h=>handlers.add(h),Remove:h=>handlers.delete(h),emit:p=>[...handlers].forEach(h=>h(p)),get size(){return handlers.size;}};}
function harness(){
 let now=0,sequence=false,paused=false,qte=false,dead=false,pending=false;const tasks=[],calls=[];
 const actor=(name,faction)=>({name,faction,GetClass:()=>({path:name}),GetOwner:()=>null,GetInstigator:()=>null});
 const player=actor('player','player'),boss=actor('boss','enemy'),friend=actor('friend','ally');
 const asc={HasMatchingGameplayTag:t=>t.TagName==='CharacterState.Dead'?dead:t.TagName==='CharacterState.InLevelSequence'?sequence:false,BP_ApplyGameplayEffectToSelf(){calls.push('kill');dead=true;},MakeEffectContext:()=>({})};
 const UE={GameplayTag:class{},UserWidget:class{},NewArray:()=>[],PBZUIManagerSubsystem:{StaticClass:()=>1},PBZLevelSequenceManager:{StaticClass:()=>2},BasicAttributeSet:{StaticClass:()=>3},EGameplayModOp:{Override:1},
 KismetSystemLibrary:{IsValid:o=>!!o&&!o.invalid,GetPathName:o=>o.path},GameplayStatics:{GetRealTimeSeconds:()=>now/1000,GetPlayerCharacter:()=>player,IsGamePaused:()=>paused},
 Class:{Find:p=>qte&&p.includes('WB_QTEWidget')?1:null,Load:p=>p},SubsystemBlueprintLibrary:{GetWorldSubsystem:()=>({IsInSequence:()=>sequence,GetCurrentSequence:()=>null})},
 WidgetBlueprintLibrary:{GetAllWidgetsOfClass(c,out){out.value={Num:()=>qte?1:0,Get:()=>({IsVisible:()=>true,IsActivated:()=>true,GetRenderOpacity:()=>1})};}},
 AbilitySystemBlueprintLibrary:{GetAbilitySystemComponent:()=>asc},AttributeUtils:{ModifyCharacterAttributeValue:(...args)=>calls.push(['attribute',...args])},PBZBlueprintFunctionLibrary:{MakeAttribute:n=>n},
 FactionUtils:{GetFaction:o=>o.faction,GetFactionRelation:(a,b)=>b.faction==='enemy'?2:0},BlueprintGameplayTagLibrary:{IsGameplayTagValid:t=>!!t},ETeamAttitude:{Hostile:2,Friendly:0},
 AbilityAsync_WaitGameplayEvent:{WaitGameplayEventToActor(p,t){assert.equal(p,player);assert.equal(t.TagName,'GameplayEvent.Actor.Hit.Target');const task={EventReceived:delegate(),Activate(){this.active=true;},Cancel(){this.cancelled=true;}};tasks.push(task);return task;}}};
 const exports={},session={active:true,boss:{id:'a',classes:['boss'],profile:{directEntry:{sequences:['intro']}}},worldLoadingComplete:true,arrivalAnchorPending:false,ux:{directReady:true,directCombatStarted:true,directIntroObserved:true},run:model.create({timer:'series',hits66:true},'a')};
 vm.runInNewContext(fs.readFileSync(__dirname+'/run-driver.js','utf8'),{exports,require:n=>({'ue':UE,'puerts':{$ref:value=>({value}),$unref:r=>r.value},'./run-model':model,'./run-hud':{stop(){},update(){}},'./cinema':{pending:()=>pending}}[n])});
 const context={};exports.install(context,session);
 return {api:exports,session,tasks,calls,player,boss,friend,actor,UE,tick(ms=100){now+=ms;exports.tick(context,session);},hit(source=boss,target=player){tasks.at(-1).EventReceived.emit({Instigator:source,Target:target});},set sequence(v){sequence=v;},set qte(v){qte=v;},set paused(v){paused=v;},set pending(v){pending=v;}};
}
test('native incoming-hit listener accepts enemies and owned projectiles, excludes friends, self and outgoing hits',()=>{
 const h=harness();h.tick();h.hit();const bullet=h.actor('bullet');bullet.GetInstigator=()=>h.boss;h.hit(bullet);h.hit(h.friend);h.hit(h.player);h.hit(h.boss,h.boss);assert.equal(h.session.run.hits,2);assert.equal(h.tasks.length,1);
});
test('66 rapid native events are all counted and the native death effect is applied once',()=>{
 const h=harness();h.tick();for(let i=0;i<66;i++)h.hit();assert.equal(h.session.run.hits,66);assert.equal(h.session.run.phase,'failed');assert.equal(h.session.autoNext,false);assert.equal(h.calls.filter(x=>x==='kill').length,1);
 h.hit();assert.equal(h.calls.filter(x=>x==='kill').length,1);assert.equal(h.calls.find(x=>Array.isArray(x))[2],'Health_Min');
});
test('a stopped listener cannot affect the next world or count duplicate notifications',()=>{
 const h=harness();h.tick();h.hit();const old=h.tasks[0];h.api.stop();assert.equal(old.cancelled,true);assert.equal(old.EventReceived.size,0);old.EventReceived.emit({Instigator:h.boss,Target:h.player});assert.equal(h.session.run.hits,1);
 h.api.install({},h.session);h.tick();assert.equal(h.tasks.length,2);h.hit();assert.equal(h.session.run.hits,2);
});
test('world real time excludes pause, loading and movies, but counts native QTE time',()=>{
 const h=harness();h.tick();h.tick(1000);assert.equal(h.session.run.totalMs,1000);h.paused=true;h.tick(4000);h.paused=false;
 h.sequence=true;h.tick(6000);assert.equal(h.session.run.totalMs,1000);h.hit();assert.equal(h.session.run.hits,0);
 h.qte=true;h.tick(700);h.hit();assert.equal(h.session.run.totalMs,1700);assert.equal(h.session.run.hits,1);
 h.qte=false;h.sequence=false;h.session.worldLoadingComplete=false;h.tick(9000);assert.equal(h.session.run.totalMs,1700);
});
test('unresolved incoming sources flag the result instead of silently claiming a valid hit budget',()=>{
 const h=harness();h.tick();h.hit(h.actor('unknown'));assert.equal(h.session.run.hits,0);assert.equal(h.session.run.invalid,true);assert.equal(h.session.run.unknownSources,1);assert.match(h.api.summary(h.session),/vérifier/);
});
test('scripted hits during a cinematic or a paused menu neither spend the budget nor invalidate it',()=>{
 const h=harness();h.tick();h.sequence=true;h.hit(h.actor('scripted'));assert.equal(h.session.run.hits,0);assert.equal(h.session.run.invalid,undefined);
 h.sequence=false;h.paused=true;h.hit(h.actor('scripted'));assert.equal(h.session.run.invalid,undefined);
});
test('arrival readiness alone cannot start a stopwatch before native combat has begun',()=>{
 const h=harness();h.session.ux.directCombatStarted=false;h.tick(3000);h.tick(4000);assert.equal(h.session.run.phase,'waiting');assert.equal(h.session.run.totalMs,0);
 h.session.ux.directCombatStarted=true;h.tick();assert.equal(h.session.run.phase,'combat');assert.equal(h.session.run.totalMs,0);h.tick(700);assert.equal(h.session.run.totalMs,700);
});
test('a cyclic ownership graph cannot spin or make a friendly projectile hostile',()=>{
 const h=harness(),a=h.actor('a'),b=h.actor('b');a.GetOwner=()=>b;b.GetOwner=()=>a;
 assert.equal(h.api.hostileSource(a,h.player,h.session),null);a.GetInstigator=()=>h.friend;assert.equal(h.api.hostileSource(a,h.player,h.session),false);
});
test('a completed series starts fresh and QTE state cannot leak into a run with disabled options',()=>{
 const h=harness();h.tick();const completed=h.session.run;completed.hits=20;completed.totalMs=90000;completed.phase='finished';h.session.runInteractiveActive=true;
 h.api.enter(h.session,h.session.boss,null);assert.notEqual(h.session.run,completed);assert.equal(completed.totalMs,90000);assert.equal(h.session.run.hits,0);assert.equal(h.session.run.totalMs,0);assert.equal(h.session.runInteractiveActive,false);
 h.session.run.options={timer:'off',hits66:false};h.session.runInteractiveActive=true;h.tick();assert.equal(h.session.runInteractiveActive,false);
});
