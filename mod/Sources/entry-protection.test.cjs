const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 let now=1000,loading=true,count=2,added=0,removed=0,stopAI=0,startAI=0,stops=0;
 const player={},context={},component={StopAI:()=>stopAI++,StartAI:()=>startAI++},controller={path:'controller-original',GetBlueprintSGameAIComponent:()=>component,StopMovement:()=>stops++};
 let actualController=controller;
 const actor={tags:new Set(),bHidden:false,GetName:()=> 'boss',GetClass:()=>({path:'/Boss.Boss_C'}),K2_GetActorLocation:()=>({X:0,Y:0,Z:0}),GetController:()=>actualController};
 const boss={classes:['/Boss.Boss_C'],profile:{directEntry:{},arena:{X:0,Y:0,Z:0}}};
 const session={active:true,mode:'direct-fight',boss,engaged:{boss:'/Boss.Boss_C'}};
 const UE={GameplayTag:class{},Class:{Find:p=>p},KismetSystemLibrary:{IsValid:x=>!!x&&!x.invalid,GetPathName:x=>x.path},NewArray:()=>[actor],Actor:{},GameplayStatics:{GetPlayerCharacter:()=>player,GetAllActorsOfClass:(_,c,out)=>out.value={Num:()=>1,Get:()=>actor}},AbilitySystemBlueprintLibrary:{GetAbilitySystemComponent:a=>({HasMatchingGameplayTag:t=>a===player?count>0:a.tags?.has(t.TagName)})},AbilityUtils:{AddLooseGameplayTag(p,t,replicate){assert.equal(p,player);assert.equal(t.TagName,'CharacterState.Stand.Invulnerable.Debug');assert.equal(replicate,false);count++;added++;},RemoveLooseGameplayTag(p,t,replicate){assert.equal(p,player);assert.equal(t.TagName,'CharacterState.Stand.Invulnerable.Debug');assert.equal(replicate,false);count--;removed++;}}};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/entry-protection.js','utf8'),{exports,require:n=>n==='ue'?UE:n==='puerts'?{$ref:value=>({value}),$unref:r=>r.value}:{entryLoadingActive:()=>loading},Date:{now:()=>now}});
 return {api:exports,UE,session,context,player,actor,controller,component,tick:()=>exports.tick(context,session),advance:ms=>now+=ms,set loading(v){loading=v;},set controller(v){actualController=v;},get count(){return count;},get added(){return added;},get removed(){return removed;},get stopped(){return stopAI;},get resumed(){return startAI;}};
}
test('exact entry loading owns one protective count and holds only the already engaged native boss',()=>{
 const h=harness();h.tick();h.tick();assert.equal(h.count,3);assert.equal(h.added,1);assert.equal(h.stopped,2);assert.equal(h.resumed,0);
 h.loading=false;h.tick();assert.equal(h.count,2,'original native protection count survives');assert.equal(h.removed,1);assert.equal(h.resumed,1);assert.equal(h.session.ux.entryProtectionActive,false);
 h.tick();h.api.stop();assert.equal(h.removed,1);assert.equal(h.resumed,1);
});
test('dormant, hidden, dead, native-disabled and distant actors are never stopped or awakened',()=>{
 for(const change of [h=>h.session.engaged={},h=>h.actor.bHidden=true,h=>h.actor.tags.add('CharacterState.Dead'),h=>h.actor.tags.add('AI.DisableCombatAI'),h=>h.actor.tags.add('CharacterState.InLevelSequence'),h=>h.actor.K2_GetActorLocation=()=>({X:6000,Y:0,Z:0})]){
  const h=harness();change(h);h.tick();assert.equal(h.stopped,0);assert.equal(h.count,3,'projectiles still cannot damage the player under loading');h.loading=false;h.tick();assert.equal(h.resumed,0);assert.equal(h.count,2);
 }
});
test('native phase ownership cancels protection without starting that phase actors',()=>{
 const h=harness();h.tick();h.session.cinematicActive=true;h.tick();assert.equal(h.count,2);assert.equal(h.resumed,0);assert.equal(h.session.ux.entryProtectionReleased,'native-sequence');
 h.tick();assert.equal(h.added,1);
});
test('a changed controller or newly native-owned actor is not resumed by cover cleanup',()=>{
 for(const change of [h=>h.controller={path:'new-controller',GetBlueprintSGameAIComponent:()=>h.component},h=>h.actor.tags.add('AI.DisableCombatAI'),h=>h.actor.tags.add('CharacterState.Dead'),h=>h.actor.bHidden=true]){
  const h=harness();h.tick();change(h);h.loading=false;h.tick();assert.equal(h.resumed,0);assert.equal(h.count,2);
 }
});
test('stop safely restores owned protection and AI before world cleanup; invalid actors are ignored',()=>{
 const h=harness();h.tick();h.api.stop('world-ended');assert.equal(h.count,2);assert.equal(h.resumed,1);
 const b=harness();b.tick();b.player.invalid=true;b.actor.invalid=true;b.api.stop('world-ended');assert.equal(b.removed,0);assert.equal(b.resumed,0);
});
test('loading protection has a hard ninety second bound and does not reacquire in the same encounter',()=>{
 const h=harness();h.tick();h.advance(90000);h.tick();assert.equal(h.count,2);assert.equal(h.resumed,1);assert.equal(h.session.entryProtectionExpired,true);assert.equal(h.session.ux.entryProtectionReleased,'loading-timeout');h.tick();assert.equal(h.added,1);
});
test('ordinary controls, pause, QTE and cinematic playback do not acquire entry protection',()=>{
 const h=harness();h.loading=false;h.tick();assert.equal(h.added,0);h.loading=true;h.session.cinematicActive=true;h.tick();assert.equal(h.added,0);
});
test('unavailable or failed additive native tag API never leaves a stopped boss or false ownership',()=>{
 for(const fault of [h=>delete h.UE.AbilityUtils.AddLooseGameplayTag,h=>h.UE.AbilityUtils.AddLooseGameplayTag=()=>{throw Error('native failure');}]){
  const h=harness();fault(h);h.tick();h.tick();assert.equal(h.stopped,0);assert.equal(h.count,2);assert(h.session.ux.entryProtectionError);h.api.stop();assert.equal(h.removed,0);
 }
});
test('an enemy engaging during the loading window is held on the next tick',()=>{
 const h=harness();h.session.engaged={};h.tick();assert.equal(h.stopped,0);h.session.engaged.boss='/Boss.Boss_C';h.tick();assert.equal(h.stopped,1);h.loading=false;h.tick();assert.equal(h.resumed,1);
});


test('native RefreshMonster cannot restart an already held component while its cover still owns input',()=>{
 const h=harness();let running=true;h.component.StopAI=()=>{running=false;};h.tick();assert.equal(running,false);
 running=true;h.tick();assert.equal(running,false,'reassert after native refresh');assert.equal(h.added,1);
 h.actor.tags.add('CharacterState.InLevelSequence');running=true;h.tick();assert.equal(running,true,'a newly native-owned phase is not stopped');
 h.loading=false;h.tick();assert.equal(h.resumed,0);
});


test('an ambiguous Remove exception retains cleanup ownership instead of claiming success or decrementing twice',()=>{
 for(const afterNative of [false,true]){
  const h=harness();let attempts=0;const remove=h.UE.AbilityUtils.RemoveLooseGameplayTag;
  h.UE.AbilityUtils.RemoveLooseGameplayTag=(...args)=>{attempts++;if(afterNative)remove(...args);throw Error('bridge failed');};
  h.tick();h.loading=false;h.tick();h.api.stop();h.tick();
  assert.equal(attempts,1,'no safe count getter: never guess whether native call executed');
  assert.equal(h.count,afterNative?2:3);assert.equal(h.session.ux.entryProtectionCleanupPending,true);
  assert.equal(h.session.ux.entryProtectionActive,true);assert.equal(h.session.ux.entryProtectionReleased,null);
  assert.equal(h.resumed,1,'protection cleanup failure cannot skip AI cleanup');
  h.loading=true;h.tick();assert.equal(h.added,1,'do not accumulate new counts over an unresolved debt');
  h.player.invalid=true;h.api.stop('world-ended');assert.equal(h.session.ux.entryProtectionCleanupPending,false);
 }
});

test('a proven absent native tag resolves a bridge exception without a second removal',()=>{
 const h=harness();const remove=h.UE.AbilityUtils.RemoveLooseGameplayTag;let calls=0;
 h.UE.AbilityUtils.RemoveLooseGameplayTag=(...args)=>{calls++;remove(...args);throw Error('after native call');};
 h.tick();h.loading=false;h.tick();assert.equal(h.session.ux.entryProtectionCleanupPending,true);
 const get=h.UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent;
 h.UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent=actor=>actor===h.player?{HasMatchingGameplayTag:()=>false}:get(actor);
 h.api.stop();assert.equal(calls,1);assert.equal(h.session.ux.entryProtectionCleanupPending,false);assert.equal(h.session.ux.entryProtectionActive,false);
});

function secondActor(h){
 let resumed=0,stopped=0;const component={StartAI:()=>resumed++,StopAI:()=>stopped++};
 const controller={path:'second-controller',GetBlueprintSGameAIComponent:()=>component};
 const actor={...h.actor,tags:new Set(),GetName:()=> 'second',GetController:()=>controller};
 h.session.engaged.second='/Boss.Boss_C';h.UE.GameplayStatics.GetAllActorsOfClass=(_,cls,out)=>out.value={Num:()=>2,Get:i=>i?actor:h.actor};
 return {actor,component,get resumed(){return resumed;},get stopped(){return stopped;}};
}
test('one failed StartAI cannot skip another held actor and retries only the failed controller',()=>{
 const h=harness(),second=secondActor(h);let attempts=0;const start=h.component.StartAI;
 h.component.StartAI=()=>{if(++attempts===1)throw Error('temporary resume failure');start();};
 h.tick();h.loading=false;h.tick();assert.equal(second.resumed,1);assert.equal(h.resumed,0);assert.equal(h.count,2);
 assert.equal(h.session.ux.entryProtectionCleanupPending,true);assert.deepEqual(Array.from(h.session.ux.entryAICleanupPending),['boss']);
 h.api.stop();assert.equal(h.resumed,1);assert.equal(second.resumed,1);assert.equal(h.session.ux.entryProtectionCleanupPending,false);
});
test('resume retries are bounded and cannot transfer to a replaced or native-owned controller',()=>{
 const h=harness(),second=secondActor(h);let attempts=0;h.component.StartAI=()=>{attempts++;throw Error('permanent resume failure');};
 h.tick();h.loading=false;h.tick();for(let i=0;i<6;i++)h.api.stop();assert.equal(attempts,3);assert.equal(second.resumed,1);assert.equal(h.session.ux.entryProtectionCleanupPending,true);
 h.actor.tags.add('CharacterState.InLevelSequence');h.api.stop();assert.equal(attempts,3);assert.equal(h.session.ux.entryProtectionCleanupPending,false);
 const b=harness();b.component.StartAI=()=>{throw Error('one failure');};b.tick();b.loading=false;b.tick();b.controller={path:'replaced',GetBlueprintSGameAIComponent:()=>({StartAI:()=>assert.fail('cannot resume replacement')})};b.api.stop();assert.equal(b.session.ux.entryProtectionCleanupPending,false);
});

test('a new native cinematic cancels pending AI retries before the next cleanup poll',()=>{
 const h=harness();let attempts=0;h.component.StartAI=()=>{attempts++;throw Error('resume failed');};
 h.tick();h.loading=false;h.tick();assert.equal(attempts,1);h.session.cinematicActive=true;h.tick();assert.equal(attempts,1);assert.equal(h.session.ux.entryProtectionCleanupPending,false);
});
test('an ambiguous Add bridge failure is retained without speculative removal or repeated acquisition',()=>{
 const h=harness();const add=h.UE.AbilityUtils.AddLooseGameplayTag;h.UE.AbilityUtils.AddLooseGameplayTag=(...args)=>{add(...args);throw Error('after native add');};
 h.tick();h.tick();h.api.stop();assert.equal(h.count,3);assert.equal(h.added,1);assert.equal(h.removed,0);assert.equal(h.stopped,0);assert.equal(h.session.ux.entryProtectionCleanupPending,true);
 h.player.invalid=true;h.api.stop();assert.equal(h.session.ux.entryProtectionCleanupPending,false);
});

test('committed world exit abandons unresolved cleanup without retaining or modifying the outgoing player again',()=>{
 const h=harness();let attempts=0;h.UE.AbilityUtils.RemoveLooseGameplayTag=()=>{attempts++;throw Error('ambiguous');};
 h.tick();h.loading=false;h.tick();assert.equal(h.session.ux.entryProtectionCleanupPending,true);h.api.forgetWorldReferences();h.api.stop();
 assert.equal(attempts,1);assert.equal(h.session.ux.entryProtectionCleanupPending,false);assert.equal(h.session.ux.entryProtectionCleanupAbandoned.protectionUncertain,true);assert.equal(h.session.ux.entryProtectionActive,false);
});

test('authored BigBro support ownership preserves native AI and still restores owned player protection',()=>{
 for(const [flag,id,skip] of [[true,'BP_Monster_HuaShan_RedTroop_BigBro',true],[false,'BP_Monster_HuaShan_RedTroop_BigBro',false],[true,'other-group',false]]){
  const h=harness(),stopped=[],resumed=[];
  const support={...h.actor,GetName:()=> 'support',GetClass:()=>({path:'/Support.Support_C'}),GetController:()=>({path:'support-controller',GetBlueprintSGameAIComponent:()=>({StopAI:()=>stopped.push('support'),StartAI:()=>resumed.push('support')}),StopMovement(){}})};
  h.session.boss.id=id;h.session.boss.profile.nativeSupportAI=flag;h.session.boss.supportClasses=['/Support.Support_C'];h.session.engaged.support='/Support.Support_C';
  h.UE.GameplayStatics.GetAllActorsOfClass=(c,path,out)=>{const actor=path.includes('Support')?support:h.actor;out.value={Num:()=>1,Get:()=>actor};};
  h.tick();assert.equal(h.stopped,1);assert.equal(h.added,1);assert.equal(stopped.length,skip?0:1);
  h.loading=false;h.tick();assert.equal(h.resumed,1);assert.equal(h.removed,1);assert.equal(h.count,2);assert.equal(resumed.length,skip?0:1);
 }
});
