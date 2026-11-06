const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 let clock=10000;
 const calls=[],wakes=[],disabled=[],flowCalls=[],actor={GetName:()=>"PrimaryBoss",GetClass:()=>"/Boss_C",K2_GetActorLocation:()=>({X:100,Y:0,Z:0})};
 const UE={Class:{Find:()=>1,Load:()=>1},Actor:{},NewArray:()=>({Num:()=>1,Get:()=>actor}),AbilityUtils:{SetLooseGameplayTagCount:(actor,tag,count)=>disabled.push({actor,tag:tag.TagName,count})},GameplayTag:class{},GameplayStatics:{GetAllActorsOfClass(){},GetPlayerCharacter:()=>({K2_GetActorLocation:()=>({X:0,Y:0,Z:0})})},KismetSystemLibrary:{GetPathName:x=>x},AbilitySystemBlueprintLibrary:{GetAbilitySystemComponent:()=>({HasMatchingGameplayTag:()=>false})}};
 const puerts={$ref:v=>({value:v}),$unref:r=>r.value,blueprint:{tojs:()=>({AwakeAI:(...args)=>wakes.push(args),StartAI:(...args)=>calls.push(args),SetActorBecomeMonster:(...args)=>flowCalls.push(['monster',...args]),SetActorAttackable:(...args)=>flowCalls.push(['attackable',...args])})}};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/battle.js','utf8'),{exports,Date:{now:()=>clock},require:n=>n==='./entrance-gates'?require('./entrance-gates'):n==='./entry-policy'?require('./entry-policy'):n==='ue'?UE:puerts});
 const session={active:true,directArrival:{released:true},boss:{classes:['/Boss_C'],profile:{directEntry:{sequences:[]}}},ux:{}};
 exports.install(session,()=>{});return {api:exports,session,calls,wakes,disabled,flowCalls,UE,actor,set now(value){clock=value;}};
}

test('native AI movement stays suspended under the ordinary arrival cover and resumes once',()=>{
 const h=setup(),stops=[],starts=[],movement=[];
 h.UE.KismetSystemLibrary.IsValid=()=>true;
 const component={StopAI:()=>stops.push(1),StartAI:()=>starts.push(1)};
 h.actor.GetController=()=>({GetBlueprintSGameAIComponent:()=>component,StopMovement:()=>movement.push(1)});
 Object.assign(h.session.directArrival,{released:false,coverRequested:true});
 h.api.holdDirectCombat({},h.session);h.api.holdDirectCombat({},h.session);
 assert.equal(stops.length,2);assert.equal(movement.length,2);assert.equal(starts.length,0);
 h.session.directArrival.released=true;h.api.holdDirectCombat({},h.session);h.api.activateDirectCombat({},h.session);h.api.activateDirectCombat({},h.session);
 assert.equal(stops.length,2,'do not overwrite combat AI after controls are released');assert.equal(starts.length,1);assert.equal(h.calls.length,1);
 const intro=setup();intro.session.boss.profile.directEntry.sequences=['/Intro'];intro.session.directArrival={released:false,coverRequested:true};
 intro.actor.GetController=()=>{throw Error('cinematic AI must retain native ownership');};intro.api.holdDirectCombat({},intro.session);
});
test('direct entry starts the native combat AI once and targets no other phase',()=>{
 const h=setup();h.api.activateDirectCombat({},h.session);h.api.activateDirectCombat({},h.session);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0][1],true);assert.equal(h.session.ux.directCombatStarted,true);
});

test('ordinary combat waits for the owned arrival fade to finish before restarting AI',()=>{
 const h=setup();h.session.directArrival.releasedAt=10000;h.api.activateDirectCombat({},h.session);assert.equal(h.calls.length,0);
 h.now=10400;h.api.activateDirectCombat({},h.session);assert.equal(h.calls.length,1);
});
test('introductions, loading and native encounter controllers keep ownership of their AI',()=>{
 for(const setupBlock of [s=>s.cinematicActive=true,s=>s.arrivalAnchorPending=true,s=>s.directArrival.released=false,s=>s.boss.profile.nativeController=true,s=>s.boss.id='BP_Monster_MuXiaoKui',s=>s.boss.profile.directEntry.sequences=['/Intro']]){
  const h=setup();setupBlock(h.session);h.api.activateDirectCombat({},h.session);assert.equal(h.calls.length,0);
 }
 const h=setup();h.session.boss.profile.directEntry.sequences=['/Intro'];h.session.ux.directIntroObserved=true;h.api.activateDirectCombat({},h.session);assert.equal(h.calls.length,1);
});

test('the registered spawner pawn takes precedence over same-class pooled actors',()=>{
 const h=setup(),pawn={GetName:()=> 'ActualEncounterPawn',GetClass:()=> '/Boss_C',K2_GetActorLocation:()=>({X:100,Y:0,Z:0})};
 h.UE.SGameAIWorldSubsystem={StaticClass:()=>1};h.UE.KismetSystemLibrary.IsValid=()=>true;
 h.UE.SubsystemBlueprintLibrary={GetWorldSubsystem:()=>({GetSpawner:id=>{assert.equal(id,'Primary');return {GetPawn:()=>pawn};}})};
 h.session.boss.profile.primarySpawnerID='Primary';
 h.api.activateDirectCombat({},h.session);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],pawn);
});

test('a cinematic replacing the spawner preview cannot leave the visible fighter idle',()=>{
 const h=setup(),preview={bHidden:true,GetName:()=> 'RetiredPreview',GetClass:()=> '/Boss_C',K2_GetActorLocation:()=>({X:100,Y:0,Z:0})};
 h.UE.SGameAIWorldSubsystem={StaticClass:()=>1};h.UE.KismetSystemLibrary.IsValid=()=>true;
 h.UE.SubsystemBlueprintLibrary={GetWorldSubsystem:()=>({GetSpawner:()=>({GetPawn:()=>preview})})};h.session.boss.profile.primarySpawnerID='Primary';
 h.api.activateDirectCombat({},h.session);assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],h.actor);
});

test('non-cinematic preparation waits for final streaming and uses the encounter pawn',()=>{
 const h=setup(),pawn={SetActorEnableCollision(){}};h.UE.SGameAIWorldSubsystem={StaticClass:()=>1};h.UE.KismetSystemLibrary.IsValid=()=>true;
 h.UE.SubsystemBlueprintLibrary={GetWorldSubsystem:()=>({GetSpawner:()=>({GetPawn:()=>pawn})})};
 h.session.boss.profile.primarySpawnerID='Primary';h.session.directArrival.released=false;
 h.api.prepareEncounter({},h.session);assert.equal(h.calls.length,0);
 h.session.directArrival.released=true;h.api.prepareEncounter({},h.session);
 assert.equal(h.wakes.length,1);assert.equal(h.calls.length,0);assert.equal(h.wakes[0][0],pawn);assert.equal(h.session.nativeSpawnerReady,true);assert.equal(h.disabled[0].tag,'AI.DisableCombatAI');assert.equal(h.disabled[0].count,1);
});

test('a non-cinematic NPC encounter uses its authored combat transition without changing execution rules',()=>{
 const h=setup();h.session.boss.profile.nativeCombatActivation={becomeMonster:true,attackable:true};
 h.api.activateDirectCombat({},h.session);
 assert.deepEqual(h.flowCalls.map(x=>x[0]),['monster','attackable']);
 assert.equal(h.flowCalls[0][2],true);assert.equal(h.flowCalls[0][3],false,'do not save a campaign transition');
 assert.equal(h.flowCalls[1][4],true,'keep the native execution rule');assert.equal(h.calls.length,1);
 const intro=setup();intro.session.boss.profile.nativeCombatActivation={becomeMonster:true,attackable:true};intro.session.boss.profile.directEntry.sequences=['/Intro'];intro.session.ux.directIntroObserved=true;
 intro.api.activateDirectCombat({},intro.session);assert.equal(intro.flowCalls.length,0,'cinematic transition stays in its native flow');
});

function entrance(){
 const h=setup(),outputs=[],path='/Game/BPF_Entrance',entry={kind:'native-entry-volume',graph:path,node:'9860EF90-4BA16232-D05FB7BA-54DB496D',sequences:['/Seq030']};
 const component={RootFlow:path+'.BPF_Entrance',GetRootFlowInstance:()=>flow};
 const node={TriggerOutput:(...args)=>outputs.push(args),GetConnectionNodeByOutputName:()=>null,SetAllOutPutsExecuteDoneFalse(){}};
 const flow={IsActive:()=>true,GetName:()=> 'LiveEntrance',GetNode(guid){assert.equal(guid.A,0x9860EF90);assert.equal(guid.D,0x54DB496D);return node;}};
 h.UE.Guid=class{};h.UE.FlowComponent={StaticClass:()=>1};h.UE.SGameAIWorldSubsystem={StaticClass:()=>2};h.UE.KismetSystemLibrary.IsValid=()=>true;
 h.UE.SubsystemBlueprintLibrary={GetWorldSubsystem:()=>({GetSpawner:()=>({GetPawn:()=>({GetComponentByClass:()=>component})})})};
 Object.assign(h.session,{nativeSpawnerReady:true,worldLoadingComplete:true});Object.assign(h.session.boss.profile,{primarySpawnerID:'Primary',attachedEntranceFlows:[path],directEntry:entry});h.session.ux.nativeArrivalLoaded=true;
 return {...h,outputs,component,flow,entry,node};
}
test('cinematic entry resolves the exact node on the live authored pawn graph and emits only once',()=>{
 const h=entrance();h.api.prepareEncounter({},h.session);h.api.prepareEncounter({},h.session);assert.deepEqual(h.outputs,[['Out',false]]);assert.equal(h.session.ux.nativeEntranceTriggered,h.entry.node);
});
test('cinematic entry waits for streaming and never interrupts a running or already observed introduction',()=>{
 for(const block of [h=>h.session.worldLoadingComplete=false,h=>h.session.ux.nativeArrivalLoaded=false,h=>h.session.cinematicActive=true,h=>h.session.ux.directIntroObserved=true,h=>h.entry.sequences=[],h=>h.component.RootFlow='/Other.Graph']){
  const h=entrance();block(h);h.api.prepareEncounter({},h.session);assert.equal(h.outputs.length,0);
 }
});
test('a malformed or missing authored entry never starts an unrelated node',()=>{
 const h=entrance();h.entry.node='not-a-guid';h.api.prepareEncounter({},h.session);assert.equal(h.outputs.length,0);
 h.entry.node='9860EF90-4BA16232-D05FB7BA-54DB496D';h.flow.GetNode=()=>null;h.api.prepareEncounter({},h.session);assert.equal(h.outputs.length,0);assert.equal(h.session.entranceSignalSent,undefined);
});

test('a consumed entrance resets only its native one-shot keys and absent keys are never removed',()=>{
 const h=entrance(),remaining=new Map([['Authored_1843292E497399088D881CA214663922',true],['Unrelated',true]]),removed=[];
 const once={GetName:()=> 'ExecuteOnce_C_42',GetConnectionNodeByOutputName:()=>null,GetNodeSaveString:r=>r.value='Authored_1843292E497399088D881CA214663922',GetGuid:()=>({A:0x1843292E,B:0x49739908,C:0x8D881CA2,D:0x14663922}),SetAllOutPutsExecuteDoneFalse(){}};
 h.node.GetConnectionNodeByOutputName=()=>once;h.UE.EventPipelineManager={StaticClass:()=>3};const old=h.UE.SubsystemBlueprintLibrary.GetWorldSubsystem;
 h.UE.SubsystemBlueprintLibrary.GetWorldSubsystem=(_,type)=>type===3?{ExecuteNodeGuid:{Get:k=>remaining.get(k),Remove(k){assert(remaining.has(k),'Puerts rejects missing map keys');removed.push(k);remaining.delete(k);}}}:old(_,type);
 h.api.prepareEncounter({},h.session);assert.equal(h.outputs.length,1);assert.deepEqual(removed,['Authored_1843292E497399088D881CA214663922']);assert.equal(remaining.get('Unrelated'),true);assert.equal(h.session.ux.entranceFlowError,undefined);
});
test('an NPC-owned introduction resolves its authored spawner component rather than the combat pawn',()=>{
 const h=entrance(),owner=require('./entrance-owner-proof.json')[0].owner,graph='/Game/PBZContent/Blueprint/FlowGraph/QuestFlowGraph/MainCh2/BPF_HongYiGuiChai_ChuChang';
 Object.assign(h.entry,{graph,node:'C4D1FB96-4FFFE67E-E3CE9DAE-424EFE9D',volumeOwner:'fixed-volume'});h.session.boss.profile.attachedEntranceFlows=[];h.component.RootFlow=graph+'.BPF_HongYiGuiChai_ChuChang';
 h.flow.GetNode=guid=>{assert.equal(guid.A,0xC4D1FB96);return h.node;};
 const actor={GetName:()=>owner.name,GetComponentByClass:()=>h.component};h.UE.NewArray=()=>({Num:()=>1,Get:()=>actor});
 h.UE.GameplayStatics.GetAllActorsOfClass=(_,cls)=>assert.equal(cls,owner.class);h.UE.Class.Load=p=>p;
 h.api.prepareEncounter({},h.session);assert.equal(h.outputs.length,1);assert.equal(h.session.entranceOwner,actor);
});
