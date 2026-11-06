const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(mode='flow'){
 let now=10000,reads=0;const saved=[];
 const named=(name)=>({GetName:()=>name,path:name});
 const array=a=>({Num:()=>a.length,Get:i=>a[i]});
 const actor=name=>({...named(name),K2_GetActorLocation:()=>({X:10,Y:20,Z:30}),K2_GetActorRotation:()=>({Pitch:0,Yaw:16,Roll:0})});
 const owner=actor('actual-sequence-owner'),player={...actor('player'),GetVelocity:()=>({X:0,Y:0,Z:0}),GetLastMovementInputVector:()=>({X:0,Y:0,Z:0})};
 const base=name=>({...named(name),GetActivationState:()=>1,IsExecuteDone:()=>false,TriggerOutput(){assert.fail('read-only probe triggered node');}});
 const once={...base('ExecuteOnce_C'),consumed:false,GetNodeSaveString:r=>r.value='ACTOR_QUALIFIED_KEY',NodeExistInExecuteNode(r){r.value=this.consumed;}};
 const sequence={...base('PlayLevelSequence_C'),HasPlay:false,PlayInf:false,PendingNormalAdded:true,NavToOwner:true,NavDuration:2,NavFallbackSeconds:5,PreprocessType:11,GetOwnerActor:()=>owner,TryGetRootFlowActorOwner:()=>owner,NavAsyncTask:named('native-task'),LoadedLevelSequence:null,SequencePlayer:null};
 const entry=base('SetExecuteType_C');
 const flow={...named('BPF_JianChiChuChang_live'),IsActive:()=>true,GetActiveNodes:()=>array([{...sequence,GetGuid:()=>({A:0xCDAEA218,B:0x4B83A6C8,C:0x6BBEBDAC,D:0x38139C83})}]),GetNode(g){return g.A===0xB76277E3?entry:g.A===0xD29C8D3B?once:sequence;}};
 const component={...named('FlowComponent'),RootFlow:named('/Game/PBZContent/Blueprint/FlowGraph/QuestFlowGraph/FuJiZhiLin/BPF_JianChiChuChang.BPF_JianChiChuChang'),GetRootFlowInstance:()=>flow};
 const pawn={...actor('pawn'),GetComponentByClass:()=>component},spawner={...actor('spawner'),GetPawn:()=>pawn};
 const pipeline={ExecuteNodeGuid:{Get:()=>once.consumed?false:undefined,Remove(){assert.fail('probe mutated once gate');}}};
 const controller={WasInputKeyJustPressed:()=>false,IsMoveInputIgnored:()=>false,IsLookInputIgnored:()=>false};
 const UE={Guid:class{},FlowComponent:{StaticClass:()=>1},EventPipelineManager:{StaticClass:()=>2},SGameAIWorldSubsystem:{StaticClass:()=>3},PBZSaveLoadSubsystem:{StaticClass:()=>4},PBZUIActionRouterBase:{StaticClass:()=>5},BasicAttributeSet:{StaticClass:()=>6},Key:class{},GameplayTag:class{},JsonObjectWrapper:class{},ECommonInputMode:{Menu:0},
  KismetSystemLibrary:{IsValid:x=>!!x&&!x.invalid,GetPathName:x=>x.path},GameplayStatics:{GetPlayerCharacter:()=>player,GetPlayerController:()=>controller,IsGamePaused:()=>false},
  AbilitySystemBlueprintLibrary:{GetAbilitySystemComponent:()=>({})},PBZBlueprintFunctionLibrary:{GetUILayOut:()=>null,MakeAttribute:()=>1,GetAttributeFromCharacter:()=>100},
  SubsystemBlueprintLibrary:{GetWorldSubsystem(c,k){if(k===2)return pipeline;return {GetSpawner(id){reads++;assert.equal(id,'HuaQianXiao_Seq027');return spawner;}};},GetGameInstanceSubsystem:()=>({SaveAdvancedObjectDataAndSync:(k,v)=>saved.push(v),SaveAdvancedSaveGameNow(){}})},
  JSONUtility:{ParseStringToJson(s,ok,out){ok.value=true;out.value=JSON.parse(s);}}
 };
 const modules={ue:UE,puerts:{$ref:value=>({value}),$unref:r=>r.value},'./qa-config':{mode},'./cinema':{pending:()=>false},'../Library/TsHelper':{default:{getlocalPlayerSubsystem:()=>({GetActiveInputMode:()=>1})}}};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/control-qa.js','utf8'),{exports,require:n=>{assert(Object.hasOwn(modules,n),n);return modules[n];},Date:{now:()=>now}});
 const session={active:true,boss:{id:'BP_Monster_HuaQianXIao'},ux:{},worldLoadingComplete:true,directArrival:{released:false},entranceSignalSent:true};
 return {session,sequence,once,owner,component,flow,saved,UE,readCount:()=>reads,advance:(ms=1000)=>now+=ms,capture:()=>exports.captureHuaEntrance({},session),tick:()=>exports.tick({},session)};
}
test('HuaQ observes exact native navigation owner, active sequence and actor-qualified once gate read-only',()=>{
 const h=harness(),r=h.capture();assert.equal(r.expectedRoot,true);assert.equal(r.nodes.sequence.owner.name,'actual-sequence-owner');assert.equal(r.nodes.sequence.owner.rotation.Yaw,16);assert.equal(r.nodes.sequence.PreprocessType,11);assert.equal(r.nodes.sequence.NavAsyncTask.valid,true);assert.equal(r.nodes.sequence.HasPlay,false);assert.equal(r.nodes.once.consumed,false);assert.equal(r.nodes.once.actorQualifiedKeyPresent,false);assert.equal(r.activeNodes[0].guid,'CDAEA218-4B83A6C8-6BBEBDAC-38139C83');
 h.once.consumed=true;const consumed=h.capture();assert.equal(consumed.nodes.once.actorQualifiedKeyPresent,true);assert.equal(consumed.nodes.once.consumed,true);assert.equal(consumed.errors.length,0);
 const serialized=JSON.stringify(consumed);assert(!serialized.includes('GetName'));assert.equal(JSON.parse(serialized).nodes.sequence.owner.position.X,10);
});
test('HuaQ unknown native APIs and scalar fields stay unknown without blocking other observations',()=>{
 const h=harness();h.sequence.GetOwnerActor=()=>{throw Error('unavailable owner');};delete h.once.NodeExistInExecuteNode;const r=h.capture();assert.equal(r.nodes.sequence.owner,null);assert.equal(r.nodes.once.consumed,null);assert.equal(r.nodes.sequence.DisableType,null);assert.equal(r.nodes.sequence.PendingNormalAdded,true);assert(r.errors.some(x=>x.field==='sequence.owner'));assert(r.errors.some(x=>x.field==='once.consumed'));
});
test('HuaQ never queries exact nodes on a different root and never runs in public/manual mode',()=>{
 const h=harness();h.component.RootFlow.path='/WrongRoot';h.flow.GetNode=()=>assert.fail('wrong root queried');const r=h.capture();assert.equal(r.expectedRoot,false);assert.equal(r.nodes,undefined);
 const m=harness('manual');assert.equal(m.capture(),null);m.tick();assert.equal(m.readCount(),0);
 h.session.boss.id='OtherBoss';assert.equal(h.capture(),null);
});
test('HuaQ tick limits native probes to one per second and retains at most twenty flag transitions',()=>{
 const h=harness();h.tick();h.advance(500);h.tick();assert.equal(h.readCount(),1);h.advance(500);h.tick();assert.equal(h.readCount(),2);
 for(let i=0;i<30;i++){h.advance();h.sequence.HasPlay=i%2===0;h.once.consumed=i>5;h.tick();}
 const d=h.saved.at(-1).huaEntranceDiagnostic;assert.equal(d.transitions.length,20);assert.equal(d.latest.nodes.once.consumed,true);assert.equal(d.latest.nodes.sequence.owner.name,'actual-sequence-owner');
});
test('continuous owner and player motion update latest without erasing diagnostic flag transitions',()=>{
 const h=harness();h.tick();h.owner.K2_GetActorLocation=()=>({X:99,Y:20,Z:30});h.advance(2000);h.tick();const d=h.saved.at(-1).huaEntranceDiagnostic;assert.equal(d.transitions.length,1);assert.equal(d.latest.nodes.sequence.owner.position.X,99);
});

test('only keyboard-probe can persist training controls; ordinary QA and manual ignore refuge',()=>{
 for(const mode of ['manual','flow','exercise','keyboard-probe']){
  const h=harness(mode);h.session.boss={id:'training',training:true};h.tick();
  assert.equal(h.saved.length,mode==='keyboard-probe'?1:0,mode);
  if(mode==='keyboard-probe')assert.equal(h.saved[0].boss,'training');
 }
});

test('HuaQ distinguishes native fallback busy tags from a stale or false session cinematic flag',()=>{
 const h=harness(),tags=new Set(['CharacterState.InLevelSequence']);
 h.session.cinematicActive=false;h.UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent=()=>({HasMatchingGameplayTag:tag=>tags.has(tag.TagName)});
 const busy=h.capture();assert.equal(busy.cinematic,false);assert.equal(busy.playerNativeTags['CharacterState.InLevelSequence'],true);assert.equal(busy.playerNativeTags['CharacterState.Dead'],false);
 tags.clear();tags.add('CharacterState.Dead');const dead=h.capture();assert.equal(dead.playerNativeTags['CharacterState.Dead'],true);assert.equal(dead.playerNativeTags['CharacterState.InLevelSequence'],false);
 tags.clear();const free=h.capture();assert.equal(free.playerNativeTags['CharacterState.Dead'],false);assert.equal(free.playerNativeTags['CharacterState.InLevelSequence'],false);
 h.UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent=()=>null;const unknown=h.capture();assert.equal(unknown.playerNativeTags['CharacterState.Dead'],null);
});
