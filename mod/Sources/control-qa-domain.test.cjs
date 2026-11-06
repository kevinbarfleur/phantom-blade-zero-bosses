const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(mode='flow',big=false){
 let now=10000;const persisted=[],calls=[];
 const array=items=>({Num:()=>items.length,Get:i=>items[i]});
 const named=(name,path=name)=>({GetName:()=>name,path});
 const pawn={...named('combat-pawn'),bHidden:false,GetClass:()=>named('PawnClass','/PawnClass'),K2_GetActorLocation:()=>({X:0,Y:0,Z:0}),GetLastMovementInputVector:()=>({X:0,Y:0,Z:0}),GetVelocity:()=>({X:0,Y:0,Z:0})};
 const group={...named('MobGroup_0','domain.MobGroup_0'),IsActivating:false,Members:array([{AssetPathName:'map',SubPathString:'PersistentLevel.authored-spawner'}]),Activate(){assert.fail('Read-only diagnostic activated group');}};
 const authoredNames=big?['BP_AISpawner_C_UAID_E89C25A750C72DE302_1591131170','BP_AISpawner_C_UAID_E89C25A750C72DE302_1517928169','BP_AISpawner_C_UAID_E89C25A750C72CE302_1744151987','BP_AISpawner_C_UAID_E89C25A750C7F6E102_2002111428','BP_AISpawner_C_UAID_E89C25A750C7A0CB02_2042446446','BP_AISpawner_C_UAID_E89C25A750C729E302_2019269458','BP_AISpawner_C_UAID_E89C25A750C72AE302_1256505636']:['BP_AISpawner_C_UAID_E89C25A75434724A02_2052073366'];
 const spawner={...named(authoredNames[big?4:0]),MobGroup:group,GetPawn:()=>pawn};
 const members=authoredNames.map((name,i)=>i===(big?4:0)?spawner:({...named(name),MobGroup:group,GetPawn:()=>({...pawn,GetName:()=> 'soldier-pawn-'+i})}));
 if(big)group.Members=array(members.map(s=>({AssetPathName:'map',SubPathString:'PersistentLevel.'+s.GetName()})));
 const domain={...named(big?'PBZ_MobDomain_C_UAID_E89C25A750C736E302_1126457833':'BP_MobDomain_C_UAID_E89C25A75434724A02_2052072365'),MobDomainConfig:{MobGroups:{Get:name=>{assert.equal(name,'DefaultGroup');return group;}}},GetCurrentActivatingGroups:()=>array(group.IsActivating?[group]:[]),GetActorsInMobDomain:()=>array([pawn]),GetReferencedTriggers:()=>array([named('authored-trigger')]),ActivateGroup(){assert.fail('Read-only diagnostic activated domain');}};
 const controller={WasInputKeyJustPressed:()=>false,IsMoveInputIgnored:()=>false,IsLookInputIgnored:()=>false};
 const UE={KismetSystemLibrary:{IsValid:x=>!!x&&!x.invalid,GetPathName:x=>x.path},Class:{Find:p=>p},Key:class{},GameplayTag:class{},NewArray:()=>[],Actor:class{},JsonObjectWrapper:class{},
  GameplayStatics:{GetPlayerCharacter:()=>pawn,GetPlayerController:()=>controller,GetAllActorsOfClass(c,cls,out){calls.push('enumeration');out.value=array(cls.includes('/Spawner/')?members:cls.includes('BP_Monster_XiaoXue')?[pawn]:[named('unrelated-domain'),domain]);},IsGamePaused:()=>false},
  ECommonInputMode:{Menu:0},PBZUIActionRouterBase:{StaticClass:()=>1},BasicAttributeSet:{StaticClass:()=>1},SGameAIWorldSubsystem:{StaticClass:()=>1},PBZSaveLoadSubsystem:{StaticClass:()=>1},
  AbilitySystemBlueprintLibrary:{GetAbilitySystemComponent:()=>({HasMatchingGameplayTag:()=>false})},
  PBZBlueprintFunctionLibrary:{GetUILayOut:()=>null,MakeAttribute:n=>n,GetAttributeFromCharacter:()=>100},
  SubsystemBlueprintLibrary:{GetWorldSubsystem:()=>({GetSpawner(id){assert.equal(id,big?'XiongZhang':'XiaoXue_Seq073');return spawner;}}),GetGameInstanceSubsystem:()=>({SaveAdvancedObjectDataAndSync(k,v){persisted.push(JSON.parse(JSON.stringify(v)));},SaveAdvancedSaveGameNow(){}})},
  JSONUtility:{ParseStringToJson(text,ok,value){ok.value=true;value.value=JSON.parse(text);}}
 };
 const modules={ue:UE,puerts:{$ref:value=>({value}),$unref:r=>r.value},'./qa-config':{mode},'../Library/TsHelper':{default:{getlocalPlayerSubsystem:()=>({GetActiveInputMode:()=>1})}}};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/control-qa.js','utf8'),{exports,Date:{now:()=>now},require:n=>{assert(Object.hasOwn(modules,n),n);return modules[n];}});
 const session={active:true,boss:{id:big?'BP_Monster_HuaShan_RedTroop_BigBro':'BP_Monster_XiaoXue'},ux:{directReady:true},worldLoadingComplete:false,directArrival:{released:false}},context={};
 return {session,group,spawner,members,domain,pawn,UE,persisted,calls,capture(phase='preterminal'){return exports.captureDomain(context,session,phase);},tick(){exports.tick(context,session);},advance(ms=2000){now+=ms;}};
}
test('exact XiaoXue diagnostic observes inactive authored membership without activating anything',()=>{
 const h=harness(),s=h.capture();assert.equal(s.status,'observed');assert.equal(s.isActivating,false);assert.equal(s.spawnerGroupMatches,true);assert.equal(s.pawnName,'combat-pawn');assert.deepEqual(Array.from(s.activeGroups),[]);assert.equal(s.phase,'preterminal');
 h.group.IsActivating=true;const active=h.capture();assert.equal(active.isActivating,true);assert.deepEqual(Array.from(active.activeGroups),['MobGroup_0']);
});
test('native query failure is unknown evidence and does not stop the scenario',()=>{
 const h=harness();h.domain.GetCurrentActivatingGroups=()=>{throw Error('native wrapper unavailable');};
 const s=h.capture();assert.equal(s.status,'unknown');assert.equal(s.isActivating,false);assert.equal(s.errors[0].field,'activeGroups');assert.match(s.errors[0].error,/native wrapper unavailable/);
});
test('wrong group identity is reported without repairing native membership',()=>{
 const h=harness();h.spawner.MobGroup={GetName:()=>'other',path:'other.group'};const s=h.capture();assert.equal(s.spawnerGroupMatches,false);assert.equal(h.spawner.MobGroup.path,'other.group');
});
test('manual public mode and other boss IDs never enumerate native domains',()=>{
 const manual=harness('manual');assert.equal(manual.capture(),null);manual.tick();assert.deepEqual(manual.calls,[]);
 const other=harness();other.session.boss.id='unrelated';assert.equal(other.capture(),null);other.tick();assert.deepEqual(other.calls,[]);
});
test('flow-mode control persistence retains load, intro, playable and exact preterminal snapshots',()=>{
 const h=harness('flow');h.tick();h.advance();h.session.worldLoadingComplete=true;h.session.cinematicActive=true;h.tick();
 h.advance();h.session.cinematicActive=false;h.session.directArrival.released=true;h.tick();h.capture();h.advance();h.tick();
 const d=h.persisted.at(-1).domainDiagnostic;assert(d);assert.deepEqual(Object.keys(d.firstByPhase),['loading','intro','playable','preterminal']);assert.equal(d.firstByPhase.preterminal.spawnerGroupMatches,true);assert(d.transitions.length<=12);
});

test('BigBro records all seven authored members and distinguishes absent pawn from missing spawner',()=>{
 const h=harness('flow',true);h.members[1].GetPawn=()=>null;h.members[2].invalid=true;h.members[3].MobGroup={...h.group,path:'wrong-group'};
 const s=h.capture();assert.equal(s.status,'observed');assert.equal(s.memberPawns.length,7);assert.equal(s.liveMemberPawns,5);
 assert.equal(s.memberPawns[1].found,true);assert.equal(s.memberPawns[1].pawn,null);assert.equal(s.memberPawns[2].found,false);
 assert.equal(s.memberPawns[3].groupMatches,false);assert.equal(s.memberPawns[4].classPath,'/PawnClass');assert.equal(s.memberPawns[4].hidden,false);assert.equal(s.memberPawns[4].health,100);
 h.tick();assert.equal(h.persisted.at(-1).domainDiagnostic.latest.memberPawns.length,7);
});

test('BigBro member wrapper errors remain unknown and do not hide other member evidence',()=>{
 const h=harness('exercise',true);h.members[1].GetPawn=()=>{throw Error('destroyed wrapper');};
 const s=h.capture();assert.equal(s.status,'unknown');assert(s.errors.some(e=>e.field==='member.'+h.members[1].GetName()+'.pawn'));assert.equal(s.memberPawns[6].pawn,'soldier-pawn-6');
});

test('soft native member references need no guessed fields or UObject trigger dereference',()=>{
 const h=harness('flow',true);h.group.Members={Num:()=>7,Get(){throw Error('SoftObjectPtr has no AssetPathName');}};h.domain.GetReferencedTriggers=()=>{throw Error('not an actor array');};
 const s=h.capture();assert.equal(s.status,'observed');assert.equal(s.nativeMemberCount,7);assert.equal(s.liveMemberPawns,7);assert.match(s.memberListSource,/authored-map-export/);assert.equal(s.memberPawns[4].spawner,h.spawner.GetName());
});

test('Feng retake observes native control tags and constrained input without resetting them',()=>{
 const h=harness();h.session.boss.id='BP_Monster_FengXueDaoKe';h.session.worldLoadingComplete=true;h.session.directArrival.released=true;
 h.UE.AbilitySystemBlueprintLibrary={GetAbilitySystemComponent:()=>({HasMatchingGameplayTag:tag=>tag.TagName==='CharacterState.Forbid'})};
 h.pawn.GetLocomotionDriverComponent=()=>({GetCurrentMoveInputRaw:()=>({X:1,Y:0}),GetCurrentMoveInputWorldSpace:()=>({X:1,Y:0,Z:0}),GetCurrentMoveInputWorldSpaceAfterConstraint:()=>({X:0,Y:0,Z:0})});
 h.pawn.CharacterMovement={MovementMode:1};h.tick();
 const diagnostic=h.persisted.at(-1).nativeControlSamples[0];assert.equal(diagnostic.tags['CharacterState.Forbid'],true);assert.equal(diagnostic.rawMoveInput.X,1);assert.equal(diagnostic.constrainedMoveInput.X,0);assert.equal(diagnostic.movementMode,1);assert.deepEqual(diagnostic.errors,[]);
 h.advance(16000);h.tick();assert.equal(h.persisted.at(-1).nativeControlSamples.length,1);
});

test('unsupported Feng control getter produces unknown diagnostic rather than a false pass or crash',()=>{
 const h=harness();delete h.UE.AbilitySystemBlueprintLibrary;h.session.boss.id='BP_Monster_FengXueDaoKe';h.session.worldLoadingComplete=true;h.session.directArrival.released=true;h.tick();
 const diagnostic=h.persisted.at(-1).nativeControlSamples[0];assert.equal(diagnostic.rawMoveInput,null);assert.equal(diagnostic.tags['CharacterState.Forbid'],null);assert(diagnostic.errors.some(e=>e.field==='abilitySystem'));
});

test('authored spawner lifecycle is primitive read-only evidence before and after death',()=>{
 const h=harness();Object.assign(h.spawner,{SetShouldNotSpawnAfterDead:true,AutoRespawnOnDead:false,RespawnDelay:1,IsShouldToSpawn:()=>true,GetShouldSpawn:()=>true,SpawnerSaveInfo:{IsAlive:true}});
 const before=h.capture();assert.deepEqual(JSON.parse(JSON.stringify(before.spawnerLifecycle)),{SetShouldNotSpawnAfterDead:true,AutoRespawnOnDead:false,RespawnDelay:1,IsShouldToSpawn:true,GetShouldSpawn:true,savedIsAlive:true});
 h.spawner.IsShouldToSpawn=()=>false;h.spawner.SpawnerSaveInfo.IsAlive=false;h.spawner.GetPawn=()=>null;
 const after=h.capture();assert.equal(after.spawnerLifecycle.IsShouldToSpawn,false);assert.equal(after.spawnerLifecycle.savedIsAlive,false);assert.equal(after.pawnName,null);
});
test('unavailable lifecycle getters stay unknown while native wrapper errors are explicit',()=>{
 const h=harness();const absent=h.capture();assert.equal(absent.spawnerLifecycle.AutoRespawnOnDead,null);assert.equal(absent.spawnerLifecycle.GetShouldSpawn,null);
 h.spawner.IsShouldToSpawn=()=>{throw Error('destroyed lifecycle wrapper');};const broken=h.capture();assert.equal(broken.status,'unknown');assert(broken.errors.some(e=>e.field==='spawnerLifecycle.IsShouldToSpawn'));
});

test('Feng exact frost tags are observed independently and never removed by the diagnostic',()=>{
 const h=harness();h.session.boss.id='BP_Monster_FengXueDaoKe';h.session.worldLoadingComplete=true;h.session.directArrival.released=true;
 const frost=new Set(['CharacterState.StatusInfliction.Frost.Effect','CharacterState.Stand.Steady','CharacterState.Hitreact.State.Frozen']);
 h.UE.AbilitySystemBlueprintLibrary={GetAbilitySystemComponent:()=>({HasMatchingGameplayTag:tag=>frost.has(tag.TagName)})};
 h.tick();const active=h.persisted.at(-1).nativeControlSamples[0];for(const tag of frost)assert.equal(active.tags[tag],true);
 assert.equal(frost.size,3,'observer did not mutate native frost');frost.clear();h.advance(7000);h.tick();
 const ended=h.persisted.at(-1).nativeControlSamples.at(-1);assert.equal(ended.tags['CharacterState.Hitreact.State.Frozen'],false);assert.equal(ended.tags['CharacterState.StatusInfliction.Frost.Effect'],false);
});

test('XiaoXue class census retains hidden former pawns separately from registered primary ownership',()=>{
 const h=harness(),old={...h.pawn,bHidden:true,GetName:()=> 'hidden-old-preview'},dead={...h.pawn,GetName:()=> 'dead-old-fighter',dead:true};
 const native=h.UE.GameplayStatics.GetAllActorsOfClass;
 h.UE.GameplayStatics.GetAllActorsOfClass=(c,cls,out)=>{if(cls.includes('BP_Monster_XiaoXue')){const list=[old,dead,h.pawn];out.value={Num:()=>list.length,Get:i=>list[i]};}else native(c,cls,out);};
 h.UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent=a=>({HasMatchingGameplayTag:()=>!!a.dead});
 const r=h.capture();assert.equal(r.primaryClassPawnCount,3);assert.equal(r.primaryClassPawns.length,3);
 assert.equal(r.primaryClassPawns[0].hidden,true);assert.equal(r.primaryClassPawns[0].registeredPrimary,false);assert.equal(r.primaryClassPawns[0].inDomainVolume,false);
 assert.equal(r.primaryClassPawns[1].dead,true);assert.equal(r.primaryClassPawns[2].registeredPrimary,true);assert.equal(r.primaryClassPawns[2].inDomainVolume,true);
});

test('domain transitions preserve death lifecycle across changing HP and movement samples',()=>{
 const h=harness();h.tick();h.spawner.SpawnerSaveInfo={IsAlive:true};h.advance();h.tick();const before=h.persisted.at(-1).domainDiagnostic.transitions.length;
 for(let i=0;i<15;i++){h.UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter=()=>100-i;h.pawn.K2_GetActorLocation=()=>({X:i,Y:0,Z:0});h.advance();h.tick();}
 assert.equal(h.persisted.at(-1).domainDiagnostic.transitions.length,before,'HP/motion cannot evict lifecycle evidence');
 h.spawner.SpawnerSaveInfo.IsAlive=false;h.spawner.GetPawn=()=>null;h.capture('postterminal-effect');h.advance();h.tick();
 const d=h.persisted.at(-1).domainDiagnostic;assert.equal(d.transitions.length,before+1);assert.equal(d.firstByPhase['postterminal-effect'].spawnerLifecycle.savedIsAlive,false);assert.equal(d.latest.primaryClassPawns[0].position.X,14);
});

function huaHarness(){
 const h=harness(),array=items=>({Num:()=>items.length,Get:i=>items[i]});
 const phases=[['1979997677','1980000681','1979998679','1980001682','1980002684','1979999680','1980002683'],['1979998678','1980005686','1980006688','1980006687']]
  .map(list=>list.map(x=>'BP_AISpawner_C_UAID_0A6230820DE85F4502_'+x));
 phases[1].push('BP_AISpawner_C_UAID_E89C25A7516AEC7302_1405639150');
 const phase2={...h.group,GetName:()=> 'MobGroup_1',path:'domain.MobGroup_1',IsActivating:false,Members:array(phases[1])};
 h.group.IsActivating=true;h.group.Members=array(phases[0]);
 h.session.boss.id='BP_Monster_HuaShan_Blue';h.domain.GetName=()=> 'BP_MobDomain_C_UAID_0A6230820DE85F4502_1979995676';
 h.domain.MobDomainConfig.MobGroups.Get=key=>({DefaultGroup:h.group,JianOu:phase2})[key];
 h.spawner.GetName=()=>phases[0][0];h.members.length=0;
 phases.forEach((list,phase)=>list.forEach((name,index)=>h.members.push(phase===0&&index===0?h.spawner:{GetName:()=>name,path:name,MobGroup:phase===0?h.group:phase2,GetPawn:()=>phase===0?({...h.pawn,GetName:()=>name+'-pawn'}):null})));
 h.UE.SubsystemBlueprintLibrary.GetWorldSubsystem=()=>({GetSpawner:id=>{assert.equal(id,'Jianou_Seq076');return h.spawner;}});
 return {...h,phase2};
}
test('HuaShan exact authored groups report seven active first-phase pawns and expected inactive second phase',()=>{
 const h=huaHarness(),r=h.capture();assert.equal(r.status,'observed');assert.equal(r.spawnerGroupMatches,true);
 assert.equal(r.memberPawns.length,12);assert.equal(r.groups[0].nativeMemberCount,7);assert.equal(r.groups[0].liveMemberPawns,7);
 assert.equal(r.groups[1].key,'JianOu');assert.equal(r.groups[1].nativeMemberCount,5);assert.equal(r.groups[1].isActivating,false);
 assert.equal(r.groups[1].liveMemberPawns,0);assert.equal(r.groups[1].initialExpectation,'inactive-until-native-phase-transition');
 for(const member of r.memberPawns)assert.equal(member.groupMatches,true);
 h.tick();assert.equal(h.persisted.at(-1).domainDiagnostic.latest.groups[1].phase,2);
});
test('HuaShan diagnostic follows native phase activation without changing groups or requiring both phases alive',()=>{
 const h=huaHarness();h.group.IsActivating=false;h.phase2.IsActivating=true;
 h.members.slice(0,7).forEach(member=>member.GetPawn=()=>null);
 h.members.slice(7).forEach((member,i)=>member.GetPawn=()=>({...h.pawn,GetName:()=> 'phase2-'+i}));
 const r=h.capture();assert.equal(r.status,'observed');assert.equal(r.groups[0].liveMemberPawns,0);assert.equal(r.groups[1].liveMemberPawns,5);
 assert.equal(r.groups[0].isActivating,false);assert.equal(r.groups[1].isActivating,true);
 h.members[8].MobGroup=h.group;const mismatch=h.capture();assert.equal(mismatch.memberPawns[8].groupMatches,false);assert.equal(h.members[8].MobGroup,h.group);
});

test('XiaoXue death observer identity and exposed actor getter distinguish current pawn from a retired binding',()=>{
 const h=harness(),old={...h.pawn,GetName:()=> 'retired-preview'};
 const watcher={GetName:()=> 'WaitGameplayTags_live',path:'Xue.WaitGameplayTags_live',GetClass:()=>({GetName:()=> 'AbilityAsync_WaitGameplayTagsAdded',path:'/Script/SGameAI.AbilityAsync_WaitGameplayTagsAdded'}),GetOuter:()=>h.spawner,GetTargetActor:()=>old,EndAction(){assert.fail('observer ended native action');}};
 h.spawner.WaitSpawnedAIDeadAsyncAction=watcher;
 const before=h.capture();assert.equal(before.spawnerDeathObserver.valid,true);assert.equal(before.spawnerDeathObserver.actors.GetTargetActor.name,'retired-preview');assert.equal(before.spawnerDeathObserver.actors.GetTargetActor.registeredPrimary,false);
 watcher.GetTargetActor=()=>h.pawn;const current=h.capture('postterminal-effect');assert.equal(current.spawnerDeathObserver.actors.GetTargetActor.registeredPrimary,true);
 watcher.invalid=true;const ended=h.capture();assert.equal(ended.spawnerDeathObserver.valid,false);assert.equal(ended.spawnerDeathObserver.name,null);assert.equal(ended.spawnerDeathObserver.actors,undefined);
});

test('XiaoXue unavailable observer target getters stay unknown without inferring a broken or working binding',()=>{
 const h=harness();const absent=h.capture();assert.equal(absent.spawnerDeathObserver.valid,false);
 h.spawner.WaitSpawnedAIDeadAsyncAction={GetName:()=> 'native-action',path:'native-action'};const opaque=h.capture();
 assert.equal(opaque.spawnerDeathObserver.valid,true);assert.deepEqual(Array.from(opaque.spawnerDeathObserver.availableActorGetters),[]);assert.deepEqual(Object.keys(opaque.spawnerDeathObserver.actors),[]);
 h.spawner.WaitSpawnedAIDeadAsyncAction.GetTargetActor=()=>{throw Error('destroyed target wrapper');};const failed=h.capture();assert.equal(failed.status,'unknown');assert(failed.errors.some(e=>e.field==='deathObserver.GetTargetActor'));
});
