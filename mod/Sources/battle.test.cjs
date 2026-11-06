const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 const timers=[],events=[],session={active:false,boss:{members:['Boss'],classes:['/Boss_C']}},victories=[];
 const pack={ReadyToPlayConfirmUI(){events.push('ack');},RefreshItem(){events.push('advance');return false;}};
 const tasks=[];
 const UE={KismetSystemLibrary:{IsValid:()=>true,GetPathName:x=>x},AbilitySystemBlueprintLibrary:{GetAbilitySystemComponent:()=>({HasMatchingGameplayTag:()=>false})},PBZBackPackSubsystem:{StaticClass:()=>1},SubsystemBlueprintLibrary:{GetWorldSubsystem:()=>pack},GameplayTag:class{},BlueprintGameplayTagLibrary:{HasTag:(tags,tag)=>tags.includes(tag.TagName)},AbilityAsync_WaitGameplayTagAdded:{WaitGameplayTagAddToActor(){const callbacks=[];const t={Added:{Add:f=>callbacks.push(f)},Activate(){},Cancel(){this.ended=true;},emit(){if(!this.ended)for(const f of callbacks)f();}};tasks.push(t);return t;}}};
 const puerts={$ref:value=>({value}),$unref:r=>r.value};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/battle.js','utf8'),{exports,console,setTimeout:f=>timers.push(f),require:n=>n==='ue'?UE:puerts});
 exports.install(session,(ctx,r)=>victories.push(r));return {api:exports,session,timers,events,victories,pack,tasks,UE,puerts};
}
test('native recorder runs normally and only a real selected-boss kill reaches the lab',()=>{
 const h=harness();class Recorder{constructor(){this.sessions=new Map();}finishSession(name){this.sessions.delete(name);}}
 h.api.patchRecorder(Recorder);const r=new Recorder();
 for(const active of [false,true]){h.session.active=active;r.sessions.set('A',{rowName:'Boss',classPath:'/Boss_C'});r.finishSession('A',true);}
 assert.equal(h.victories.length,1);r.finishSession('A',true);assert.equal(h.victories.length,1);
 r.sessions.set('B',{rowName:'Other',classPath:'/Other_C'});r.finishSession('B',true);assert.equal(h.victories.length,1);
 r.sessions.set('A',{rowName:'Boss',classPath:'/Boss_C'});r.finishSession('A',false);assert.equal(h.victories.length,1);
});
test('lab pickup queues close without opening equipment or changing the loadout',()=>{
 const h=harness();let native=0,closed=0;class Pickup{InitItemByData(){native++;}BP_OnActivated(){native++;}SetRenderOpacity(){}DeactivateWidget(){closed++;}}
 h.api.patchPickup(Pickup);const p=new Pickup();p.InitItemByData({});assert.equal(native,1);
 h.session.active=true;p.InitItemByData({});p.BP_OnActivated();assert.equal(native,1);h.timers.shift()();assert.equal(closed,1);assert.deepEqual(h.events,['ack','advance']);assert.equal(h.session.rewardsSuppressed,1);
});
test('loot suppression releases every native flow output in order',()=>{
 const h=harness();let original=0;class Loot{K2_ExecuteInput(){original++;}TriggerOutput(...args){h.events.push(args);}}
 h.api.patchLoot(Loot);const node=new Loot();node.K2_ExecuteInput();assert.equal(original,1);assert.equal(h.events.length,0);
 h.session.active=true;node.K2_ExecuteInput();assert.equal(h.events.length,3);assert.equal(h.events[0][1],false);assert.equal(h.events[2][1],true);
 h.api.stop();node.K2_ExecuteInput();assert.equal(original,2);
});
test('an excluded boss is observed once and old death tasks cannot complete a later encounter',()=>{
 const h=harness();h.session.active=true;
 class Recorder{constructor(){this.sessions=new Map();}finishSession(){}onBossEngaged(){}onUnlockTagsAdded(){}}
 h.api.patchRecorder(Recorder);const r=new Recorder(),actor={GetName:()=> 'excluded',GetClass:()=>'/Boss_C'};
 r.onBossEngaged({Target:actor});r.onBossEngaged({Target:actor});assert.equal(h.tasks.length,1);
 h.tasks[0].emit();assert.equal(h.victories.length,1);
 h.api.install(h.session,()=>h.victories.push('new'));assert.equal(h.tasks[0].ended,true);
 h.tasks[0].emit();assert.equal(h.victories.length,1);
 r.onBossEngaged({Target:actor});assert.equal(h.tasks.length,2);h.api.stop();assert.equal(h.tasks[1].ended,true);
});
test('an excluded aggregate encounter waits for its native unlock rather than a first phase death',()=>{
 const h=harness();h.session.active=true;h.session.boss.unlockTag='Kill.Aggregate';
 class Recorder{constructor(){this.sessions=new Map();}finishSession(){}onBossEngaged(){}onUnlockTagsAdded(){}}
 h.api.patchRecorder(Recorder);const r=new Recorder();r.onBossEngaged({Target:{GetName:()=> 'excluded',GetClass:()=>'/Boss_C'}});
 r.sessions.set('excluded',{rowName:'Boss',classPath:'/Boss_C'});r.finishSession('excluded',true);assert.equal(h.victories.length,0);
 assert.equal(h.tasks.length,0);r.onUnlockTagsAdded(['Kill.Other']);assert.equal(h.victories.length,0);r.onUnlockTagsAdded(['Kill.Aggregate']);assert.equal(h.victories.length,1);
});

test('terminal phase death completes the lab even when the native record is waiting for a story tag',()=>{
 const h=harness();h.session.active=true;h.session.boss.classes=['/First_C','/Last_C'];h.session.boss.unlockTag='None';
 class Recorder{constructor(){this.sessions=new Map([['first',{}],['last',{}]]);}finishSession(){}onBossEngaged(){}}
 h.api.patchRecorder(Recorder);const r=new Recorder();
 r.onBossEngaged({Target:{GetName:()=> 'first',GetClass:()=>'/First_C'}});assert.equal(h.tasks.length,0);
 r.onBossEngaged({Target:{GetName:()=> 'last',GetClass:()=>'/Last_C'}});assert.equal(h.tasks.length,1);
 h.tasks[0].emit();assert.equal(h.victories.length,1);assert.equal(h.victories[0].path,'/Last_C');
});

test('a nearby miniboss without a boss-record engagement event still has one native death observer',()=>{
 const h=harness();h.session.active=true;h.session.boss.profile={arena:{X:0,Y:0,Z:0}};
 const actor={GetName:()=> 'miniboss',GetClass:()=>'/Boss_C',K2_GetActorLocation:()=>({X:100,Y:0,Z:0})};
 const far={...actor,GetName:()=> 'another-region',K2_GetActorLocation:()=>({X:90000,Y:0,Z:0})};
 h.UE.Class={Find:()=>1};h.UE.Actor=class{};h.UE.NewArray=()=>({});
 h.UE.GameplayStatics={GetAllActorsOfClass:(_,cls,out)=>out.value={Num:()=>2,Get:i=>[actor,far][i]}};
 h.api.poll({},h.session);h.api.poll({},h.session);assert.equal(h.tasks.length,1);
 h.tasks[0].emit();assert.equal(h.victories.length,1);assert.equal(h.victories[0].source,'native-death-observer');
});

test('encounter streaming activates only its authored leaf layers once, without activating the campaign tree',()=>{
 const h=harness(),calls=[];h.session.active=true;h.session.boss.classes=['/Phase1','/Phase2'];
 h.session.boss.profile={loadLayers:['Summer'],unloadLayers:['Winter']};
 h.UE.WorldPartitionBlueprintLibrary={GetDataLayerManager:()=>({SetDataLayerRuntimeState:(...args)=>calls.push(args)})};
 h.UE.DataLayerAsset={Load:path=>path};
 h.api.prepareEncounter({},h.session);h.api.prepareEncounter({},h.session);
 assert.deepEqual(calls,[['Winter',0,false],['Summer',2,false]]);assert.equal(h.session.layersPrepared,true);
});
test('seasonal restoration waits for world readiness and reconciles once after the landing cover',()=>{
 const h=harness(),calls=[];h.session.active=true;h.session.boss.profile={loadLayers:['Summer','Ordinary'],unloadLayers:['Winter','Transformed'],restoreLayersAfterArrival:true};
 h.UE.WorldPartitionBlueprintLibrary={GetDataLayerManager:()=>({SetDataLayerRuntimeState:(...args)=>calls.push(args)})};h.UE.DataLayerAsset={Load:path=>path};
 h.session.worldLoadingComplete=false;h.api.prepareEncounter({},h.session);assert.equal(calls.length,0);
 h.session.worldLoadingComplete=true;h.session.directArrival={released:false};h.api.prepareEncounter({},h.session);assert.equal(calls.length,4);assert.equal(h.session.layersRestoredAfterArrival,undefined);
 h.api.prepareEncounter({},h.session);assert.equal(calls.length,4);h.session.directArrival.released=true;h.session.cinematicActive=true;h.api.prepareEncounter({},h.session);assert.equal(calls.length,4);
 h.session.cinematicActive=false;h.api.prepareEncounter({},h.session);h.api.prepareEncounter({},h.session);assert.equal(calls.length,8);assert.equal(h.session.layersRestoredAfterArrival,true);assert(calls.every(x=>x[2]===false));
});
test('a refused final seasonal layer pass remains retryable without claiming success',()=>{
 const h=harness();let refused=true;h.session.active=true;h.session.boss.profile={loadLayers:['Summer'],restoreLayersAfterArrival:true};h.session.layersPrepared=true;h.session.directArrival={released:true};
 h.UE.WorldPartitionBlueprintLibrary={GetDataLayerManager:()=>({SetDataLayerRuntimeState(){if(refused)throw Error('not ready');}})};h.UE.DataLayerAsset={Load:path=>path};
 h.api.prepareEncounter({},h.session);assert.equal(h.session.layersRestoredAfterArrival,undefined);assert.match(h.session.ux.layerPreparationError,/not ready/);
 refused=false;h.api.prepareEncounter({},h.session);assert.equal(h.session.layersRestoredAfterArrival,true);assert.equal(h.session.ux.layerPreparationError,undefined);
});

test('a phase fight prepares its first native spawner only and leaves the guardian and ending controllers alone',()=>{
 const h=harness(),calls=[];h.session.active=true;h.session.boss={id:'PhasedBoss',classes:['/Phase1','/Phase2'],profile:{primarySpawnerID:'First',arena:{X:0,Y:0,Z:0}}};
 h.UE.Class={Load:()=>1,Find:()=>1};h.UE.Actor=class{};h.UE.NewArray=()=>({});
 h.UE.GameplayStatics={GetPlayerCharacter:()=>({K2_GetActorLocation:()=>({X:0,Y:0,Z:0})}),GetAllActorsOfClass:(_,cls,out)=>out.value={Num:()=>0}};
 h.puerts.blueprint={tojs:()=>({SpawnRealMonsterAndHidden:id=>{calls.push(id);return{};},StartAI(){}})};
 h.api.prepareEncounter({},h.session);assert.deepEqual(calls,['First']);assert.equal(h.session.nativeSpawnerReady,true);
 for(const id of ['BP_Monster_MuXiaoKui','BP_Monster_ZuoShang_Ending']){h.session.nativeSpawnerReady=false;h.session.boss.id=id;h.api.prepareEncounter({},h.session);}
 assert.deepEqual(calls,['First']);
});

test('a spawner without an ID uses only its exact authored actor and preserves native domain data',()=>{
 const h=harness(),pawn={},calls=[];h.session.active=true;h.session.boss={id:'NoId',classes:['/Boss'],profile:{primarySpawnerActor:'authored',spawners:['other','authored'],arena:{X:0,Y:0,Z:0}}};
 const spawner={SpawnInfo:{bAutoStartAI:false,MobDomain:'native-domain'},GetName:()=> 'authored',SetShouldSpawn:v=>calls.push(v),UpdateSaveInfo(){},SpawnFromSequence(){calls.push('spawn');},GetPawn:()=>pawn};
 h.UE.Class={Find:()=>2,Load:()=>1};h.UE.Actor=class{};h.UE.NewArray=()=>({});
 h.UE.GameplayStatics={GetPlayerCharacter:()=>({K2_GetActorLocation:()=>({X:0,Y:0,Z:0})}),GetAllActorsOfClass:(_,cls,out)=>out.value={Num:()=>cls===1?1:0,Get:()=>spawner}};
 h.puerts.blueprint={tojs:()=>({SpawnRealMonsterAndHidden:()=>{throw Error('No ID may be fabricated');},StartAI:actor=>assert.equal(actor,pawn)})};
 h.api.prepareEncounter({},h.session);assert.deepEqual(calls,[true,'spawn']);assert.equal(spawner.SpawnInfo.bAutoStartAI,false);assert.equal(spawner.SpawnInfo.MobDomain,'native-domain');assert.equal(h.session.nativeSpawnerReady,true);
});
