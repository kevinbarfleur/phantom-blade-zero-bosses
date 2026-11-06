"use strict";
// Private engine-input/transition scenario. Forced terminal boss death is
// explicitly reported; it is not evidence of winning the fight by playing.
const UE=require('ue'),puerts=require('puerts'),config=require('./qa-config');
const bosses=require('./boss-catalog').filter(b=>b.available!==false);
const ids=config.ids.length?config.ids:bosses.map(b=>b.id);
const nativeTerminalManual={
 BP_Monster_GreatBladeMan:'Native GE_BladeMan_LockHealth keeps Health_Min=1 until the ending performance; forced GE_Kill does not validate that performance.',
 BP_Monster_LengTu:'Native summon phases keep a 5% health floor; GA_LengTu_FinalPhase removes the lock and enters Phase.Final. Complete those phases manually.',
 BP_Monster_MengHua:'Native XuKong phase uses a 41% health floor, then SwitchPhase enters P2; a single forced hit does not validate the remaining fight.',
 MoTian_Trial_5:'Only trial V requires the native MoYuan execution removing GE_MoYuan_LockHealth. Earlier trials retain their separate terminal tests.'
};
let current=null,index=0,results=[],done=false,lastSave=0,ticking=false,terminalOwner=null;
function valid(actor){
 if(!actor)return false;
 try{return UE.KismetSystemLibrary.IsValid(actor);}catch(error){
  // Puerts rejects an already-destroyed wrapper before native IsValid runs.
  // This specific bridge error means absent; unrelated exceptions stay visible.
  if(/passing a invalid object/i.test(String(error)))return false;
  throw error;
 }
}
function actorSnapshot(context,classes){
 const actors=new Set();
 for(const path of classes){const cls=UE.Class.Find(path);if(!cls)continue;const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);const list=puerts.$unref(out);
  for(let i=0;i<list.Num();i++){const actor=list.Get(i);if(valid(actor))actors.add(actor);}
 }
 return [...actors];
}
function save(context){
 const sl=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZSaveLoadSubsystem.StaticClass()),ok=puerts.$ref(false),value=puerts.$ref(new UE.JsonObjectWrapper());
 UE.JSONUtility.ParseStringToJson(JSON.stringify({time:Date.now(),index,total:ids.length,done,current,results}),ok,value);
 if(puerts.$unref(ok)){sl.SaveAdvancedObjectDataAndSync('CodexBossLabExerciseQA',puerts.$unref(value));sl.SaveAdvancedSaveGameNow();}
 lastSave=Date.now();
}
function finish(context,session,api,automatic=false){
 if(current?.attackFinish)require('./xue-attack-finish').stop();
 current.finished=Date.now();current.automaticNext=automatic;results.push(current);index++;if(terminalOwner?.entry===current)terminalOwner=null;current=null;
 done=index>=ids.length;save(context);
 if(done){session.autoNext=false;if(!automatic)api.showMenu(context);return;}
 if(!automatic)setTimeout(()=>api.travel(context,2,bosses.find(b=>b.id===ids[index]),false,config.skipIntroduction===true),1000);
}
function terminalState(actor){
 if(!valid(actor))return {present:false};
 const result={present:true};
 try{
  result.actor=actor.GetName();
  const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor),tag=new UE.GameplayTag();tag.TagName='CharacterState.Dead';
  result.health=UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter(actor,UE.PBZBlueprintFunctionLibrary.MakeAttribute('Health',UE.BasicAttributeSet.StaticClass()));
  result.minimumHealth=UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter(actor,UE.PBZBlueprintFunctionLibrary.MakeAttribute('Health_Min',UE.BasicAttributeSet.StaticClass()));
  result.deadTag=!!asc?.HasMatchingGameplayTag(tag);
  tag.TagName='CharacterState.HitReact.State.Dead';result.hitreactDeadTag=!!asc?.HasMatchingGameplayTag(tag);
 }catch(error){result.error=String(error);}
 return result;
}
function skipCounter(session){
 // cinema.js initializes this counter lazily after the native ActionProgress
 // call returns. Absence therefore means zero, not an inherited skip event.
 const value=session.cinematicsSkipped;
 return value===undefined?0:Number.isSafeInteger(value)&&value>=0?value:null;
}
function sampleIntroductionSkips(session){
 if(current.stage!=='entry'||current.introductionSkipCounter.frozen)return;
 const proof=current.introductionSkipCounter;
 // End sequences may be skipped by the same native counter. Never sample
 // them, even when a very short fight completes before the action scenario.
 if(session.completed){proof.frozen=true;proof.frozenAt=Date.now();proof.endReason='encounter-completed';return;}
 const after=skipCounter(session);current.cinematicsSkippedAfter=after;
 proof.sampledAt=Date.now();
 current.cinematicsSkippedDuringIntroduction=Number.isFinite(current.cinematicsSkippedBefore)&&Number.isFinite(after)&&after>=current.cinematicsSkippedBefore?after-current.cinematicsSkippedBefore:null;
 if(session.ux?.controlExercise?.done){proof.frozen=true;proof.frozenAt=Date.now();proof.endReason='entry-actions-finished';}
}
function sampleTerminal(context,session){
 if(!current||Date.now()-(current.lastTerminalSample||0)<1000)return;
 current.lastTerminalSample=Date.now();
 const states=new Map((current.killed||[]).map(name=>[name,{actor:name,present:false}]));
 for(const actor of actorSnapshot(context,session.boss.classes)){if(!valid(actor))continue;const name=actor.GetName();if(states.has(name))states.set(name,terminalState(actor));}
 current.terminalObservations=[...(current.terminalObservations||[]),{afterMs:Date.now()-current.killAt,actors:[...states.values()]}].slice(-16);
}
function canSelectTerminal(context,session){
 const owner=terminalOwner;
 return !!owner&&owner.entry===current&&owner.session===session&&owner.boss===session.boss&&owner.arrival===session.directArrival&&session.active&&!session.completed&&!done&&!session.cinematicActive&&!require('./cinema').pending(context)&&!require('./cinema').entryLoadingActive?.(context,session)&&!!session.worldLoadingComplete&&!!session.directArrival?.released&&!!session.ux?.directReady;
}
function redTroopSupports(context,session){
 if(session.boss.id!=='BP_Monster_HuaShan_RedTroop_BigBro')return true;
 const owned=current,boss=session.boss,owns=()=>current===owned&&session.boss===boss&&canSelectTerminal(context,session);
 if(!owns())return false;
 const state=owned.supportTerminal||(owned.supportTerminal={method:'forced-native-GE_Kill-authored-supports-first',playedVictory:false,attempts:[]});
 if(state.blocked)return false;
 const paths=boss.profile.spawners||[],primaryName=boss.profile.primarySpawnerActor;
 if(paths.length!==7||new Set(paths).size!==7||!paths.includes(primaryName)){state.blocked='authored-seven-member-profile-required';return false;}
 const byName=new Map(actorSnapshot(context,['/SGameAI/Tools/Spawner/BP_AISpawner.BP_AISpawner_C']).map(s=>[s.GetName(),s]));
 const primary=byName.get(primaryName),group=primary?.MobGroup;
 if(!valid(primary)||!valid(group)){state.blocked='primary-spawner-group-unavailable';return false;}
 const groupPath=UE.KismetSystemLibrary.GetPathName(group),pawn=primary.GetPawn();
 if(!valid(pawn)){state.blocked='primary-pawn-unavailable';return false;}
 if(!state.started){
  const candidates=[];
  for(const name of paths.filter(n=>n!==primaryName)){
   const spawner=byName.get(name);
   if(!valid(spawner)||!valid(spawner.MobGroup)||UE.KismetSystemLibrary.GetPathName(spawner.MobGroup)!==groupPath){state.blocked='support-group-mismatch:'+name;return false;}
   const actor=spawner.GetPawn(),before=terminalState(actor);
   if(!valid(actor)||actor.bHidden||before.deadTag||!(before.health>0)||!(boss.supportClasses||[]).includes(UE.KismetSystemLibrary.GetPathName(actor.GetClass()))){state.blocked='support-not-live-authored-soldier:'+name;return false;}
   const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor);
   if(!valid(asc)){state.blocked='support-asc-unavailable:'+name;return false;}
   candidates.push({name,actor,asc,before});
  }
  // Validate all six before changing any actor. Never retry a partially applied
  // batch, spawn a replacement, edit the lock, or synthesize SoldierDead tags.
  state.started=Date.now();state.primaryBefore=terminalState(pawn);
  for(const candidate of candidates){
   if(!owns()){state.blocked='encounter-ownership-ended';return false;}
   const {name,actor,asc,before}=candidate;
   if(!valid(actor)||!valid(asc)){state.blocked='support-invalidated:'+name;return false;}
   const attempt={spawner:name,actor:before.actor,before,at:Date.now()};state.attempts.push(attempt);
   try{
    attempt.effectCallStarted=true;
    asc.BP_ApplyGameplayEffectToSelf(UE.Class.Load('/Game/PBZContent/Blueprint/Ability/GameplayEffects/GE_Kill.GE_Kill_C'),1,asc.MakeEffectContext());
    attempt.effectCallReturned=true;attempt.post=terminalState(actor);
   }catch(error){state.blocked='native-error';attempt.error=String(error);throw error;}
  }
 }
 if(!owns())return false;
 state.primaryAfter=terminalState(pawn);
 state.nativeFloorReleased=Number.isFinite(state.primaryAfter.minimumHealth)&&state.primaryAfter.minimumHealth<=0;
 if(state.nativeFloorReleased)state.releasedAt=state.releasedAt||Date.now();
 return state.nativeFloorReleased;
}
function selectTerminalCandidates(context,session){
 if(!canSelectTerminal(context,session))return;
 current.lastCandidateScanAt=Date.now();
 try{if(!redTroopSupports(context,session))return;}
 catch(error){current.terminalRetryBlocked='native-error';try{save(context);}catch(_){}throw error;}
 const owned=current,boss=session.boss,owns=()=>current===owned&&session.boss===boss&&canSelectTerminal(context,session);
 const now=Date.now(),scan={at:now,afterMs:now-owned.killAt,candidates:[]};owned.lastCandidateScanAt=now;owned.terminalCandidateScans.push(scan);
 try{
  // Snapshot every candidate before any native mutation. Diagnostics contain
  // only primitives; actor wrappers remain local to this bounded scan.
  const found=new Map();
  for(const path of boss.classes){
   const cls=UE.Class.Find(path);if(!cls){scan.candidates.push({classPath:path,actor:null,reason:'class-unavailable'});continue;}
   const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);const list=puerts.$unref(out);
   if(!list.Num())scan.candidates.push({classPath:path,actor:null,reason:'no-actors'});
   for(let i=0;i<list.Num();i++){
    const actor=list.Get(i);if(!valid(actor)){scan.candidates.push({classPath:path,actor:null,reason:'invalid-wrapper'});continue;}
    if(found.has(actor))continue;
    const row={classPath:path,actor:actor.GetName(),reason:'not-yet-evaluated'};scan.candidates.push(row);found.set(actor,row);
   }
  }
  const tag=new UE.GameplayTag();tag.TagName='CharacterState.Dead';
  for(const [actor,row]of found){
   if(!owns()){row.reason='encounter-ownership-ended';return;}
   if(!valid(actor)){row.reason='invalidated-after-snapshot';continue;}
   row.hidden=!!actor.bHidden;if(row.hidden){row.reason='hidden';continue;}
   const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor);row.hasASC=valid(asc);if(!row.hasASC){row.reason='no-valid-asc';continue;}
   row.deadTag=!!asc.HasMatchingGameplayTag(tag);if(row.deadTag){row.reason='already-dead';continue;}
   const p=actor.K2_GetActorLocation(),at=boss.profile.arena;row.position={X:p.X,Y:p.Y,Z:p.Z};
   if(![p.X,p.Y,p.Z].every(Number.isFinite)){row.reason='invalid-position';continue;}
   if(at){row.distanceFromArenaCm=Math.hypot(p.X-at.X,p.Y-at.Y,p.Z-at.Z);if(row.distanceFromArenaCm>7000){row.reason='outside-7000cm';continue;}}
   row.reason='eligible';
   const attempt={actor:row.actor,at:Date.now(),scanAt:now,before:terminalState(actor)};owned.killAttempts.push(attempt);
   let effectContext;
   if(config.mode==='exercise'&&config.xiaoXuePlayerKillContext===true&&boss.id==='BP_Monster_XiaoXue'){
    const player=UE.GameplayStatics.GetPlayerCharacter(context,0);
    const playerASC=valid(player)?UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(player):null;
    if(!valid(playerASC)){attempt.skipped='player-effect-context-unavailable';row.reason=attempt.skipped;continue;}
    attempt.effectContextMethod='player-asc-context-applied-to-target';attempt.instigatorActor=player.GetName();
    effectContext=playerASC.MakeEffectContext();
   }else{attempt.effectContextMethod='target-asc-self-context';effectContext=asc.MakeEffectContext();}
   if(!owns())return;
   // Mark the attempt before the first native mutation. Even a partial error
   // or invalidation below forbids every later scan from trying GE_Kill again.
   if(boss.id!=='BP_Monster_HuaShan_RedTroop_BigBro')UE.AttributeUtils.ModifyCharacterAttributeValue(actor,UE.PBZBlueprintFunctionLibrary.MakeAttribute('Health_Min',UE.BasicAttributeSet.StaticClass()),UE.EGameplayModOp.Override,0);
   if(!owns())return;
   if(!valid(actor)||!valid(asc)){attempt.skipped='native-actor-invalidated-before-effect';attempt.post=terminalState(actor);row.reason=attempt.skipped;continue;}
   const deadClass=UE.Class.Load('/Game/PBZContent/Blueprint/Ability/GameplayEffects/GE_Kill.GE_Kill_C');
   owned.killed.push(row.actor);attempt.effectCallStarted=true;asc.BP_ApplyGameplayEffectToSelf(deadClass,1,effectContext);attempt.effectCallReturned=true;
   attempt.post=terminalState(actor);row.reason='effect-call-returned';
   if(!owns())return;
   if(boss.id==='BP_Monster_XiaoXue'&&!owned.domainAfterTerminal)owned.domainAfterTerminal=require('./control-qa').captureDomain(context,session,'postterminal-effect');
  }
  scan.attemptCount=owned.killAttempts.length;
 }catch(error){
  scan.error=String(error);owned.terminalRetryBlocked='native-error';
  try{save(context);}catch(_){}
  throw error;
 }
}
function tickImpl(context,session,api){
 if(config.mode!=='exercise'||done||!session.active||session.boss.training)return;
 if(current&&current.id!==session.boss.id){
  if(current.killAt&&session.boss.id===ids[index+1])finish(context,session,api,true);
  else throw Error('Unexpected QA encounter transition');
 }
 if(done||session.boss.id!==ids[index])return;
 if(!current){current={id:session.boss.id,started:Date.now(),stage:'entry',method:'engine-input-plus-native-death-path',physicalKeyboardVerified:false,entryDeadlineMs:600000,cinematicsSkippedBefore:skipCounter(session),introductionSkipCounter:{source:'session.cinematicsSkipped-after-native-ActionProgress',window:'entry-until-actions-finished-before-terminal',baselineAt:Date.now(),frozen:false,physicalCircleVerified:false}};session.autoNext=false;}
 sampleIntroductionSkips(session);
 current.ux=JSON.parse(JSON.stringify(session.ux||{}));current.completed=!!session.completed;
 if(Date.now()-lastSave>=2000)save(context);
 if(current.stage==='entry'){
  if(session.ux?.entryFailure||Date.now()-current.started>=600000){current.error='Entry/action timeout';finish(context,session,api);return;}
  if(!session.ux.controlExercise?.done)return;
  if(session.cinematicActive||require('./cinema').pending(context)||!session.worldLoadingComplete||!session.directArrival?.released||!session.ux.directReady)return;
  current.exercise=session.ux.controlExercise;
  current.entryReady=!!session.ux.directReady&&session.ux.controls?.routable===true;
  const multi=session.boss.classes.length>1||session.boss.profile.nativeController||['BP_Monster_Yuu','BP_Monster_TieGui','BP_Monster_JadeMaskMan','BP_Monster_JingYe'].includes(session.boss.id);
  const nativeFinisher=session.boss.id==='BP_Monster_PengMeng_Axe';
  if(multi||nativeFinisher||nativeTerminalManual[session.boss.id]){
   current.fullFight='manual-required';
   current.manualReason=nativeTerminalManual[session.boss.id]||(nativeFinisher?'Native execution removes persistent GE_PengMeng_LockHealth; forced GE_Kill is not a valid finisher test.':session.boss.id==='BP_Monster_JingYe'?'Native mounted-to-ground transition below 60% health removes the 20% health floor; a single GE_Kill cannot validate the remaining ground fight.':'Native phases, QTE or encounter controller require manual completion.');
   finish(context,session,api);return;
  }
  current.stage='terminal-death';current.killAt=Date.now();
  if(['BP_Monster_XiaoXue','BP_Monster_HuaShan_RedTroop_BigBro'].includes(session.boss.id)){
   current.domainBeforeTerminal=require('./control-qa').captureDomain(context,session,'preterminal');
  }
  const catalogNext=bosses[bosses.findIndex(b=>b.id===session.boss.id)+1]?.id;
  session.autoNext=!!ids[index+1]&&ids[index+1]===catalogNext;
  current.killed=[];current.killAttempts=[];current.terminalCandidateScans=[];current.terminalRetryUntil=current.killAt+15000;
  terminalOwner={entry:current,session,boss:session.boss,arrival:session.directArrival};
  const selected=current,owner=terminalOwner;
  if(config.xiaoXueAttackFinish===true&&session.boss.id==='BP_Monster_XiaoXue'){
   current.stage='terminal-attack';current.method='engine-input-native-attack-low-health';current.attackFinish={};
   require('./xue-attack-finish').tick(context,session,current.attackFinish);save(context);return;
  }
  selectTerminalCandidates(context,session);
  if(current!==selected||session.boss!==owner.boss||session.directArrival!==owner.arrival||!session.active)return;
  save(context);return;
 }
 if(current.stage==='terminal-attack'){
  const owned=current;require('./xue-attack-finish').tick(context,session,owned.attackFinish);
  if(current!==owned)return;
  if(owned.attackFinish.done){
   if(owned.attackFinish.deathObserved||session.completed){
    current.stage='terminal-death';current.killAt=owned.attackFinish.deathAt||Date.now();current.killed=[owned.attackFinish.actor].filter(Boolean);
    current.domainAfterTerminal=require('./control-qa').captureDomain(context,session,'post-native-attack-death');
   }else{current.error='Native attack finish inconclusive: '+owned.attackFinish.reason;session.autoNext=false;finish(context,session,api);}
  }
  return;
 }
 if(current.stage==='terminal-death'){
  sampleTerminal(context,session);
  if(session.completed&&session.ux.resultShown&&!session.autoNext){finish(context,session,api);return;}
  if(!current.attackFinish&&!current.killAttempts.length&&!current.terminalRetryBlocked&&Date.now()<=current.terminalRetryUntil&&Date.now()-(current.lastCandidateScanAt||0)>=1000){const selected=current,boss=session.boss;selectTerminalCandidates(context,session);if(current!==selected||session.boss!==boss||!session.active)return;}
  if(Date.now()-current.killAt>90000){current.error='Native terminal transition not completed in 90s';session.autoNext=false;finish(context,session,api);}
 }
}
function tick(context,session,api){
 if(ticking)return;
 ticking=true;
 try{return tickImpl(context,session,api);}finally{ticking=false;}
}
exports.tick=tick;
