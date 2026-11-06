const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(options={}){
 let now=1000,paused=false,pending=false,mutation=()=>{};
 const calls=[],pawn={health:1000,floor:0,dead:false,GetName:()=> 'AuthoredXue'},replacement={health:500,GetName:()=> 'ReplacementXue'};
 let registered=pawn,target=pawn;
 const player={GetName:()=> 'Player',GetCurrentMontage:()=>({GetName:()=> 'Hun_ShanZi_A_Montage'}),GetComponentByClass:()=>({HasLockTarget:()=>!!target,GetLockTarget:r=>r.value=target})};
 const system={InjectInputVectorForAction:(a,v)=>calls.push({action:a.path,value:v.X})};
 const UE={KismetSystemLibrary:{IsValid:x=>!!x&&!x.invalid},GameplayTag:class{},Vector:class{constructor(X){this.X=X;}},NewArray:()=>[],InputModifier:{},InputTrigger:{},InputAction:{Load:path=>({path,ValueType:0})},EInputActionValueType:{Boolean:0},EnhancedInputLocalPlayerSubsystem:{StaticClass:()=>1},SGameAIWorldSubsystem:{StaticClass:()=>2},TargetingComponent:{StaticClass:()=>3},ComponentSocket:class{},ComponentSocketHelper:{GetActor:x=>x},BasicAttributeSet:{StaticClass:()=>4},EGameplayModOp:{Override:1},
  AbilitySystemBlueprintLibrary:{GetAbilitySystemComponent:a=>({HasMatchingGameplayTag:t=>t.TagName==='CharacterState.Dead'?a.dead:!!a.hitDead})},
  PBZBlueprintFunctionLibrary:{MakeAttribute:n=>n,GetAttributeFromCharacter:(a,key)=>key==='Health'?a.health:a.floor},
  SubsystemBlueprintLibrary:{GetWorldSubsystem:()=>({GetSpawner:()=>({GetPawn:()=>registered,GetShouldSpawn:()=>!registered.dead})})},
  GameplayStatics:{GetPlayerCharacter:()=>player,IsGamePaused:()=>paused},
  AttributeUtils:{ModifyCharacterAttributeValue(a,attr,op,value){calls.push({healthActor:a.GetName(),attr,value});a.health=value;mutation();}}
 };
 const config={mode:options.mode||'exercise',xiaoXueAttackFinish:options.enabled!==false},session={active:true,boss:{id:options.id||'BP_Monster_XiaoXue',profile:{primarySpawnerID:'XiaoXue_Seq073'}},worldLoadingComplete:true,directArrival:{released:true},ux:{directReady:true,controls:{routable:true}}},report={},api={};
 vm.runInNewContext(fs.readFileSync(__dirname+'/xue-attack-finish.js','utf8'),{exports:api,Date:{now:()=>now},require:n=>({ue:UE,puerts:{$ref:value=>({value}),$unref:r=>r.value},'./qa-config':config,'./cinema':{pending:()=>pending,entryLoadingActive:()=>false},'../Library/TsHelper':{default:{getlocalPlayerSubsystem:()=>system}}}[n])});
 return {calls,pawn,replacement,session,report,api,tick:()=>api.tick({},session,report),advance:ms=>now+=ms,set paused(v){paused=v;},set pending(v){pending=v;},set target(v){target=v;},set registered(v){registered=v;},set mutation(v){mutation=v;}};
}
test('manual, missing flag and every other boss cannot change health or inject inputs',()=>{
 for(const opts of [{mode:'manual'},{mode:'keyboard-probe'},{enabled:false},{id:'OtherBoss'}]){const h=harness(opts);h.tick();assert.deepEqual(h.calls,[]);assert.equal(h.pawn.health,1000);}
});
test('one positive Health reduction targets only the registered locked pawn; normal attacks remain frame pulses',()=>{
 const h=harness();h.tick();h.advance(34);h.tick();h.advance(400);h.tick();
 assert.deepEqual(h.calls.filter(x=>x.healthActor),[{healthActor:'AuthoredXue',attr:'Health',value:100}]);
 assert.equal(h.pawn.floor,0);assert.equal(h.report.attackPulses,2);assert.equal(h.report.playedFullFight,false);
 assert.ok(h.calls.some(x=>x.action?.includes('AttackL')&&x.value===0));
});
test('death is observed before any further attack, records both native tags, and never lowers a replacement',()=>{
 const h=harness();h.tick();h.pawn.health=0;h.pawn.dead=true;h.pawn.hitDead=true;h.advance(34);h.tick();
 assert.equal(h.report.deathObserved,true);assert.equal(h.report.deathState.hitreactDeadTag,true);
 h.registered=h.replacement;h.target=h.replacement;h.advance(4000);h.tick();
 assert.equal(h.replacement.health,500);assert.equal(h.report.healthMutationAttempts,1);
});
test('paused or cinematic play releases inputs and a twenty-second deadline cannot trigger GE_Kill fallback',()=>{
 const h=harness();h.tick();h.paused=true;h.advance(400);h.tick();const pulses=h.report.attackPulses;
 h.paused=false;h.pending=true;h.advance(400);h.tick();assert.equal(h.report.attackPulses,pulses);
 h.advance(21000);h.tick();assert.equal(h.report.done,true);assert.equal(h.report.reason,'native-attack-timeout');assert.equal(h.pawn.health,100);
});
test('wrong lock, nonzero floor and unknown native health are rejected before mutation',()=>{
 for(const change of [h=>h.target=h.replacement,h=>h.pawn.floor=1,h=>h.pawn.health=NaN]){const h=harness();change(h);h.tick();assert.equal(h.report.done,true);assert.equal(h.calls.filter(x=>x.healthActor).length,0);}
});
test('ownership changes, replaced pawns and partial native mutation failures never retry health reduction',()=>{
 for(const change of [h=>h.registered=h.replacement,h=>h.session.directArrival={released:true}]){const h=harness();h.tick();change(h);h.advance(35);h.tick();assert.equal(h.report.done,true);assert.equal(h.report.healthMutationAttempts,1);}
 const h=harness();h.mutation=()=>{throw Error('native failed after write');};h.tick();h.tick();assert.equal(h.report.reason,'native-api-error');assert.equal(h.calls.filter(x=>x.healthActor).length,1);
});
