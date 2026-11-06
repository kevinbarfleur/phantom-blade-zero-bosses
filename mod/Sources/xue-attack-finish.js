"use strict";
// PRIVATE QA: a normal input attack after one positive health reduction.
// This checks a terminal path; it is never a played full-fight victory.
const UE=require('ue'),puerts=require('puerts'),config=require('./qa-config'),cinema=require('./cinema');
const id='BP_Monster_XiaoXue';
const paths={attack:'/PBZInput/InputActions/IA_AttackL_Press.IA_AttackL_Press',lock:'/SGameCombatSystem/Targeting/IA_LockTarget.IA_LockTarget'};
let scope=null;
const read=fn=>{try{return fn();}catch(_){return null;}};
const valid=value=>!!value&&read(()=>UE.KismetSystemLibrary.IsValid(value))===true;
const name=value=>valid(value)?read(()=>value.GetName()):null;
const attribute=(actor,key)=>UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter(actor,UE.PBZBlueprintFunctionLibrary.MakeAttribute(key,UE.BasicAttributeSet.StaticClass()));
function snapshot(actor){
 if(!valid(actor))return {present:false};
 const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor),tag=new UE.GameplayTag();
 tag.TagName='CharacterState.Dead';const dead=asc.HasMatchingGameplayTag(tag);
 tag.TagName='CharacterState.HitReact.State.Dead';
 return {present:true,actor:actor.GetName(),health:attribute(actor,'Health'),minimumHealth:attribute(actor,'Health_Min'),deadTag:!!dead,hitreactDeadTag:!!asc.HasMatchingGameplayTag(tag)};
}
function inject(state,kind,value){state.system.InjectInputVectorForAction(state.actions[kind],new UE.Vector(value,0,0),state.modifiers,state.triggers);}
function release(state){
 if(!state?.system)return;
 for(const key of Object.keys(state.actions||{}))try{inject(state,key,0);}catch(error){state.report.errors.push('release '+key+': '+String(error));}
 state.pressed=false;
}
function stop(){if(scope)release(scope);scope=null;}
function finish(state,reason){release(state);state.report.done=true;state.report.reason=reason;state.report.finishedAt=Date.now();}
function tick(context,session,report){
 if(config.mode!=='exercise'||config.xiaoXueAttackFinish!==true||session.boss?.id!==id){stop();return;}
 if(report.done)return;
 try{
  if(!scope||scope.report!==report){
   stop();Object.assign(report,{method:'engine-input-native-attack-after-positive-health-reduction',physicalKeyboardVerified:false,playedFullFight:false,startedAt:Date.now(),deadlineMs:20000,samples:[],errors:[],attackPulses:0,healthMutationAttempts:0});
   scope={report,session,boss:session.boss,arrival:session.directArrival,startedAt:Date.now(),actions:{}};
   const s=scope;s.system=require('../Library/TsHelper').default.getlocalPlayerSubsystem(context,UE.EnhancedInputLocalPlayerSubsystem.StaticClass());
   if(!valid(s.system)||typeof s.system.InjectInputVectorForAction!=='function')throw Error('Enhanced Input unavailable');
   s.modifiers=UE.NewArray(UE.InputModifier);s.triggers=UE.NewArray(UE.InputTrigger);
   for(const [key,path]of Object.entries(paths)){const a=UE.InputAction.Load(path);if(!valid(a))throw Error('Missing native input '+key);if(a.ValueType!==undefined&&UE.EInputActionValueType?.Boolean!==undefined&&a.ValueType!==UE.EInputActionValueType.Boolean)throw Error('Wrong input value type');s.actions[key]=a;}
  }
  const s=scope,now=Date.now();
  if(s.session!==session||s.boss!==session.boss||s.arrival!==session.directArrival||!session.active){finish(s,'encounter-ownership-ended');return;}
  const system=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.SGameAIWorldSubsystem.StaticClass());
  const spawner=system?.GetSpawner(session.boss.profile.primarySpawnerID),pawn=valid(spawner)?spawner.GetPawn():null;
  const player=UE.GameplayStatics.GetPlayerCharacter(context,0);
  if(s.claimedName){
   const state=snapshot(s.actor);
   if(!s.lastSample||now-s.lastSample>=250){
    s.lastSample=now;const montage=read(()=>player.GetCurrentMontage?.());
    report.samples.push({at:now,...state,registeredPawn:name(pawn),montage:name(montage),shouldSpawn:valid(spawner)?read(()=>spawner.GetShouldSpawn()):null});
    if(report.samples.length>88)report.samples.shift();
   }
   if(state.deadTag||state.hitreactDeadTag){report.deathObserved=true;report.deathAt=now;report.deathState=state;finish(s,'native-death-observed');return;}
   if(!state.present||name(pawn)!==s.claimedName){finish(s,'claimed-pawn-replaced-before-observed-death');return;}
  }
  if(now-s.startedAt>=20000){finish(s,'native-attack-timeout');return;}
  if(session.completed){finish(s,'native-completion');return;}
  const ready=session.worldLoadingComplete&&session.directArrival?.released&&session.ux?.directReady&&session.ux?.controls?.routable===true&&!session.cinematicActive&&!cinema.pending(context)&&!cinema.entryLoadingActive?.(context,session)&&!UE.GameplayStatics.IsGamePaused(context);
  if(!ready){release(s);return;}
  if(!valid(pawn)||pawn.bHidden||!valid(player)){finish(s,'authored-pawn-unavailable');return;}
  const targeting=player.GetComponentByClass(UE.TargetingComponent.StaticClass());
  let target=null;
  if(targeting?.HasLockTarget()){const socket=puerts.$ref(new UE.ComponentSocket());targeting.GetLockTarget(socket);target=UE.ComponentSocketHelper.GetActor(puerts.$unref(socket));}
  // Never redirect a lock to a clone by force, and never lower a different pawn.
  if(name(target)!==name(pawn)){
   release(s);
   if(!s.lockAttempted&&!target){s.lockAttempted=true;inject(s,'lock',1);return;}
   if(s.claimedName||target||now-s.startedAt>2000)finish(s,'lock-is-not-authored-primary');
   return;
  }
  if(!s.claimedName){
   const before=snapshot(pawn);
   if(!before.present||before.deadTag||before.hitreactDeadTag||!Number.isFinite(before.health)||before.health<=0||before.minimumHealth!==0){finish(s,'native-health-state-not-eligible');return;}
   // Claim before native mutation; exceptions/reentry cannot reduce a second pawn.
   s.actor=pawn;s.claimedName=pawn.GetName();report.actor=s.claimedName;report.before=before;report.targetHealth=Math.min(100,before.health);report.healthMutationAttempts=1;
   UE.AttributeUtils.ModifyCharacterAttributeValue(pawn,UE.PBZBlueprintFunctionLibrary.MakeAttribute('Health',UE.BasicAttributeSet.StaticClass()),UE.EGameplayModOp.Override,report.targetHealth);
   report.afterReduction=snapshot(pawn);s.nextAttack=now;
   if(!report.afterReduction.present||report.afterReduction.health<=0||report.afterReduction.deadTag||report.afterReduction.hitreactDeadTag){finish(s,'health-reduction-did-not-preserve-living-target');return;}
  }
  if(s.pressed){release(s);return;}
  if(now>=s.nextAttack){inject(s,'attack',1);s.pressed=true;s.nextAttack=now+400;report.attackPulses++;}
 }catch(error){report.errors=report.errors||[];report.errors.push(String(error));if(scope)finish(scope,'native-api-error');else{report.done=true;report.reason='native-api-error';}}
}
exports.tick=tick;exports.stop=stop;
