"use strict";
// PRIVATE QA ONLY. Enhanced Input action injection exercises gameplay handlers,
// not physical keyboard focus, key mappings, or the Windows input route.
const UE=require('ue'),puerts=require('puerts'),config=require('./qa-config'),cinema=require('./cinema');
const paths={move:'/SGameLocomotionDriver/Input/IA_KeyboardMoveInput.IA_KeyboardMoveInput',lock:'/SGameCombatSystem/Targeting/IA_LockTarget.IA_LockTarget',attack:'/PBZInput/InputActions/IA_AttackL_Press.IA_AttackL_Press'};
const menuPath='/Game/PBZContent/Input/InputActions/IA_PushGameSystemMenu.IA_PushGameSystemMenu';
let scope=null;
const read=fn=>{try{return fn();}catch(_){return null;}};
const valid=o=>!!o&&read(()=>UE.KismetSystemLibrary.IsValid(o))===true;
const point=o=>o&&Number.isFinite(o.X)&&Number.isFinite(o.Y)&&Number.isFinite(o.Z)?{X:o.X,Y:o.Y,Z:o.Z}:null;
function reflect(value,pattern=/inject|input|action/i){return read(()=>[...new Set([...Object.getOwnPropertyNames(value),...Object.getOwnPropertyNames(Object.getPrototypeOf(value))])].filter(n=>pattern.test(n)).slice(0,80))||[];}
function error(state,where,value){const message=where+': '+String(value);if(!state.report.errors.includes(message))state.report.errors.push(message);}
function stopContinuousMove(state){
 if(!state?.moveContinuousActive)return;
 state.moveContinuousActive=false;
 try{state.subsystem.StopContinuousInputInjectionForAction(state.actions.move);state.report.movement.continuousStopped=true;}catch(e){error(state,'stop continuous movement',e);}
}
function startContinuousMove(state){
 if(state.moveContinuousAttempted)return;state.moveContinuousAttempted=true;
 const system=state.subsystem,library=UE.EnhancedInputLibrary;
 if(typeof system.StartContinuousInputInjectionForAction!=='function'||typeof system.StopContinuousInputInjectionForAction!=='function'||typeof library?.MakeInputActionValueOfType!=='function'||UE.EInputActionValueType?.Axis2D===undefined){state.report.movement.injectionMethod='frame-enhanced-input';return;}
 try{
  const value=library.MakeInputActionValueOfType(1,0,0,UE.EInputActionValueType.Axis2D);
  // Set ownership before calling: a partially failing native start must still
  // receive its matching stop before falling back to frame injection.
  state.moveContinuousActive=true;
  system.StartContinuousInputInjectionForAction(state.actions.move,value,state.modifiers,state.triggers);
  state.report.movement.injectionMethod='continuous-enhanced-input';
 }catch(e){stopContinuousMove(state);state.report.movement.continuousFallback=String(e);state.report.movement.injectionMethod='frame-enhanced-input';}
}
function inject(state,values){
 for(const name of Object.keys(state.actions||{})){if(name==='move'&&state.moveContinuousActive)continue;state.subsystem.InjectInputVectorForAction(state.actions[name],new UE.Vector(values[name]||0,0,0),state.modifiers,state.triggers);}
}
function release(state){
 stopContinuousMove(state);
 if(!state?.subsystem||!state.actions)return;
 for(const name of Object.keys(state.actions))try{state.subsystem.InjectInputVectorForAction(state.actions[name],new UE.Vector(0,0,0),state.modifiers,state.triggers);}catch(e){error(state,'release '+name,e);}
 state.holding=false;
}
function lockPulse(player,state,ms,now){
 const schedule=[600,2200,4000];
 while((state.lockWindow||0)<schedule.length){
  const index=state.lockWindow||0,scheduledMs=schedule[index];if(ms<scheduledMs)return false;
  state.lockWindow=index+1;
  const attempt={scheduledMs,ms,at:now,injectionAttempted:false,hasLockBefore:null};state.report.lock.attempts.push(attempt);
  // A pause/cinematic can consume a window. Never catch up with stale pulses.
  if(ms>=scheduledMs+400){attempt.reason='window-missed';continue;}
  const targeting=read(()=>player.GetComponentByClass(UE.TargetingComponent.StaticClass()));
  attempt.hasLockBefore=read(()=>targeting.HasLockTarget());
  if(attempt.hasLockBefore===true){attempt.reason='existing-target-preserved';return false;}
  if(attempt.hasLockBefore!==false){attempt.reason='target-state-unavailable';return false;}
  attempt.injectionAttempted=true;attempt.reason='pulse-requested';return true;
 }
 return false;
}
function closeOwnedMenu(state){
 const widget=state.menuWidget;
 if(state.menuCloseAllowed!==false&&valid(widget)&&read(()=>widget.IsActivated())===true&&typeof widget.DeactivateWidget==='function')try{widget.DeactivateWidget();state.report.pause.closedNative=true;}catch(e){error(state,'close native QA menu',e);}
}
function stop(){if(scope){release(scope);closeOwnedMenu(scope);}scope=null;}
function finish(state,reason,now){release(state);closeOwnedMenu(state);state.report.done=true;state.report.reason=reason;state.report.elapsedMs=state.readyAt===null?0:now-state.readyAt;state.report.finishedAt=now;}
function setup(context,state){
 const klass=UE.EnhancedInputLocalPlayerSubsystem;if(!klass?.StaticClass)throw Error('EnhancedInputLocalPlayerSubsystem unavailable');
 state.subsystem=require('../Library/TsHelper').default.getlocalPlayerSubsystem(context,klass.StaticClass());
 if(!valid(state.subsystem)||typeof state.subsystem.InjectInputVectorForAction!=='function'){
  state.report.apiMethods=reflect(state.subsystem);throw Error('InjectInputVectorForAction unavailable');
 }
 if(!UE.InputAction?.Load||!UE.InputModifier||!UE.InputTrigger)throw Error('Input action/modifier/trigger type unavailable');
 state.modifiers=UE.NewArray(UE.InputModifier);state.triggers=UE.NewArray(UE.InputTrigger);state.actions={};
 for(const [name,path]of Object.entries(paths)){
  const action=UE.InputAction.Load(path);if(!valid(action))throw Error('Native input action missing: '+path);
  const expected=name==='move'?UE.EInputActionValueType?.Axis2D:UE.EInputActionValueType?.Boolean;
  if(expected!==undefined&&action.ValueType!==undefined&&action.ValueType!==expected)throw Error('Unexpected native value type: '+name+'='+action.ValueType);
  state.actions[name]=action;
 }
 state.report.nativeActions={...paths};
}
function health(actor){return read(()=>UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter(actor,UE.PBZBlueprintFunctionLibrary.MakeAttribute('Health',UE.BasicAttributeSet.StaticClass())));}
function montageName(actor){const montage=read(()=>actor.GetCurrentMontage?.()||actor.GetMesh?.()?.GetAnimInstance?.()?.GetCurrentActiveMontage?.());return montage&&read(()=>montage.GetName());}
const reactionMontage=name=>/hit|knock|hurt|stagger|death|die|receive|damage/i.test(name);
const attackLikeMontage=name=>!reactionMontage(name)&&(/attack|atk|combo|light|heavy/i.test(name)||/_A+(?:_|$)/.test(name));
function encounterRole(session,classPath){
 const matches=paths=>!!classPath&&(paths||[]).some(p=>p.toLowerCase()===classPath.toLowerCase());
 const expectedOpponent=matches(session.boss.classes);
 return {expectedOpponent,expectedEncounterSupport:!expectedOpponent&&matches(session.boss.supportClasses)};
}
function observeEnemyResponse(session,player,state,now){
 // This observer runs only inside the existing routable, loaded, unpaused,
 // non-cinematic action phase. It neither drives AI nor attributes damage.
 const result=state.report.enemyResponse,hp=health(player);
 result.samples++;result.lastSampleAt=now;
 if(result.firstSampleAt===null)result.firstSampleAt=now;
 if(Number.isFinite(hp)){
  if(result.playerHPInitial===null)result.playerHPInitial=hp;
  result.playerHPMin=result.playerHPMin===null?hp:Math.min(result.playerHPMin,hp);result.playerHPLatest=hp;
  if(state.responseContiguous&&Number.isFinite(state.responseLastHP)&&hp<state.responseLastHP-0.01)result.playerHealthDecreasedObserved=true;
 }
 state.responseLastHP=Number.isFinite(hp)?hp:null;state.responseContiguous=true;
 const enemy=state.enemy;if(!valid(enemy))return;
 const classPath=read(()=>UE.KismetSystemLibrary.GetPathName(enemy.GetClass()));
 const role=encounterRole(session,classPath);if(!role.expectedOpponent&&!role.expectedEncounterSupport)return;
 const actor=read(()=>enemy.GetName());if(!actor)return;
 let row=result.opponents.find(item=>item.actor===actor&&item.classPath===classPath);
 if(!row){if(result.opponents.length>=8)return;row={actor,classPath,...role,samples:0,montages:[],attackLikeMontageObserved:false,hitReactionMontageObserved:false};result.opponents.push(row);}
 row.samples++;const at=read(()=>point(enemy.K2_GetActorLocation()));if(at){if(!row.positionInitial)row.positionInitial=at;row.positionLatest=at;}
 const name=montageName(enemy);if(!name)return;
 if(!row.montages.includes(name)&&row.montages.length<24)row.montages.push(name);
 if(attackLikeMontage(name))row.attackLikeMontageObserved=true;
 if(reactionMontage(name))row.hitReactionMontageObserved=true;
}
function interruptEnemyObservation(state){if(state.responseContiguous)state.report.enemyResponse.unobservedIntervalCount++;state.responseContiguous=false;state.responseLastHP=null;}
function menuLayers(context){
 const layout=UE.PBZBlueprintFunctionLibrary.GetUILayOut?.(context);if(!layout?.Layers)return null;
 const rows=[];
 for(const layer of ['UI.Layer.GameSystem','UI.Layer.Menu']){const tag=new UE.GameplayTag();tag.TagName=layer;const widget=layout.Layers.Get(tag)?.GetActiveWidget();if(valid(widget)&&widget.IsActivated())rows.push({layer,widget,name:widget.GetName(),path:UE.KismetSystemLibrary.GetPathName(widget.GetClass())});}
 return rows;
}
function beginMenu(context,state,now){
 release(state);const result=state.report.pause;
 const before=read(()=>menuLayers(context));
 if(!before){result.unsupported='Native menu layer API unavailable';finish(state,'completed',now);return;}
 if(before.length){result.unsupported='Pre-existing native menu';finish(state,'completed',now);return;}
 const action=read(()=>UE.InputAction.Load(menuPath)),expected=UE.EInputActionValueType?.Boolean;
 if(!valid(action)||(expected!==undefined&&action.ValueType!==undefined&&action.ValueType!==expected)){result.unsupported='Native system-menu input action unavailable or wrong type';finish(state,'completed',now);return;}
 state.actions.menu=action;state.report.nativeActions.menu=menuPath;state.menuStarted=now;state.menuPhase='opening';state.menuCloseAllowed=true;
 inject(state,{menu:1});state.holding=true;result.injectionObserved=true;
}
function menuTick(context,state,now,paused,routed,cinematic){
 state.menuCloseAllowed=!cinematic;
 if(state.holding)release(state);
 if(cinematic){state.report.pause.waiting='cinematic';return;}
 const result=state.report.pause;result.waiting=null;
 const rows=menuLayers(context);
 if(!rows){result.unsupported='Native menu layers no longer available';finish(state,'completed',now);return;}
 if(state.menuPhase==='opening'){
  // The native input action is allowed to choose its screen. Only take
  // ownership of the confirmed system root that this pulse just opened.
  const expected=rows.find(row=>/\/W_Systembase\.W_Systembase_C$/.test(row.path));
  if(expected){state.menuWidget=expected.widget;state.menuOpened=now;state.menuPhase='visible';Object.assign(result,{opened:true,paused:paused===true,layer:expected.layer,widget:expected.name,classPath:expected.path});}
  else if(rows.length){result.unsupported='Unexpected native menu: '+rows.map(row=>row.name).join(', ');finish(state,'completed',now);return;}
  else if(now-state.menuStarted>=3000){result.failure='Native system menu did not open';finish(state,'completed',now);return;}
 }
 if(state.menuPhase==='visible'){
  result.paused=result.paused||paused===true;
  if(now-state.menuOpened>=500){closeOwnedMenu(state);state.menuPhase='closing';state.menuClosed=now;}
 }
 if(state.menuPhase==='closing'){
  const closed=!valid(state.menuWidget)||read(()=>state.menuWidget.IsActivated())===false;
  if(closed&&paused===false&&routed){result.resumed=true;result.resumeDelayMs=now-state.menuClosed;finish(state,'completed',now);}
  else if(now-state.menuClosed>=3000){result.failure='Native input or pause did not recover after menu dismissal';finish(state,'completed',now);}
 }
}
function sample(context,session,player,state,now){
 if(now-state.lastSample<70)return;state.lastSample=now;
 const report=state.report,at=read(()=>point(player.K2_GetActorLocation())),input=read(()=>point(player.GetLastMovementInputVector()));
 if(at){if(!report.movement.start)report.movement.start=at;report.movement.end=at;const from=report.movement.start;report.movement.maxDisplacementCm=Math.max(report.movement.maxDisplacementCm,Math.hypot(at.X-from.X,at.Y-from.Y,at.Z-from.Z));}
 const pulseMs=now-state.startedAt;
 if(pulseMs<=500){
  const hp=health(player),sample={ms:pulseMs,position:at,velocity:read(()=>point(player.GetVelocity())),health:Number.isFinite(hp)?hp:null,input};
  if(report.movement.pulseSamples.length<12)report.movement.pulseSamples.push(sample);
  if(Number.isFinite(hp)){if(report.movement.initialHealth===undefined)report.movement.initialHealth=hp;if(hp<report.movement.initialHealth-0.01)report.movement.damagedDuringPulse=true;}
  if(at&&report.movement.start){const from=report.movement.start;report.movement.maxPulseDisplacementCm=Math.max(report.movement.maxPulseDisplacementCm,Math.hypot(at.X-from.X,at.Y-from.Y,at.Z-from.Z));}
  if(input&&Math.hypot(input.X,input.Y,input.Z)>0.05){report.movement.nonzeroInputObserved=true;report.movement.lastNonzeroInput=input;}
 }
 report.movement.responded=report.movement.nonzeroInputObserved&&report.movement.maxPulseDisplacementCm>10&&!report.movement.damagedDuringPulse;
 if(!state.driverReflected){state.driverReflected=true;const driver=read(()=>player.GetLocomotionDriverComponent());report.movement.driverMethods=reflect(driver,/input|move|velocity|locomotion|intent|direction/i);report.movement.driverClass=read(()=>UE.KismetSystemLibrary.GetPathName(driver.GetClass()));}
 const targeting=read(()=>player.GetComponentByClass(UE.TargetingComponent.StaticClass()));
 if(targeting&&read(()=>targeting.HasLockTarget())===true){
  const socket=puerts.$ref(new UE.ComponentSocket());targeting.GetLockTarget(socket);const target=UE.ComponentSocketHelper.GetActor(puerts.$unref(socket));
  report.lock.observed=true;report.lock.actor=read(()=>target.GetName());report.lock.classPath=read(()=>UE.KismetSystemLibrary.GetPathName(target.GetClass()));
  Object.assign(report.lock,encounterRole(session,report.lock.classPath));
  if(valid(target)&&(report.lock.expectedOpponent||report.lock.expectedEncounterSupport))state.enemy=target;
 }
 const name=montageName(player);
 if(name){
  if(!report.attack.montages.includes(name)&&report.attack.montages.length<24)report.attack.montages.push(name);
  if(attackLikeMontage(name)){report.attack.montageObserved=true;report.attack.montage=name;}
 }
 if(!valid(state.enemy)&&now-state.lastEnemySearch>=500){
  state.lastEnemySearch=now;let nearest=Infinity;
  for(const path of session.boss.classes||[]){
   const klass=UE.Class.Find(path);if(!klass)continue;const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,klass,out);const all=puerts.$unref(out);
   for(let i=0;i<all.Num();i++){const candidate=all.Get(i);if(!valid(candidate)||candidate.bHidden)continue;const p=read(()=>point(candidate.K2_GetActorLocation()));if(!p||!at)continue;const distance=Math.hypot(p.X-at.X,p.Y-at.Y,p.Z-at.Z);if(distance<nearest){nearest=distance;state.enemy=candidate;}}
  }
 }
 if(valid(state.enemy)){
  const actor=read(()=>state.enemy.GetName()),hp=health(state.enemy);
  if(Number.isFinite(hp)){
   if(report.attack.enemy!==actor){report.attack.enemy=actor;report.attack.classPath=read(()=>UE.KismetSystemLibrary.GetPathName(state.enemy.GetClass()));Object.assign(report.attack,encounterRole(session,report.attack.classPath));report.attack.initialEnemyHP=hp;report.attack.lowestEnemyHP=hp;}
   report.attack.lowestEnemyHP=Math.min(report.attack.lowestEnemyHP,hp);report.attack.latestEnemyHP=hp;
   report.attack.healthDecreasedObserved=report.attack.lowestEnemyHP<report.attack.initialEnemyHP-0.01;
  }
 }
 observeEnemyResponse(session,player,state,now);report.samples++;
}
function tick(context,session){
 if(config.mode!=='exercise'){if(scope)stop();return;}
 if(!session.active||session.boss.training){if(scope){finish(scope,'session-ended',Date.now());scope=null;}return;}
 const now=Date.now(),player=read(()=>UE.GameplayStatics.GetPlayerCharacter(context,0));
 if(!valid(player)){if(scope)interruptEnemyObservation(scope);if(scope?.holding)release(scope);if(scope){scope.settleAt=null;if(!scope.report.done&&((scope.readyAt!==null&&now-scope.readyAt>=15000)||now-scope.createdAt>=600000))finish(scope,'deadline',now);}return;}
 const identity=read(()=>player.GetName())+':'+session.boss.id;
 if(!scope||scope.session!==session||scope.identity!==identity||scope.arrival!==session.directArrival){
  stop();scope={session,identity,arrival:session.directArrival,createdAt:now,settleAt:null,readyAt:null,lastSample:-Infinity,lastEnemySearch:-Infinity,report:{done:false,method:'engine-injected-enhanced-input',physicalKeyboardRouting:false,globalDeadlineMs:600000,playableDeadlineMs:15000,settleMs:1000,movement:{maxDisplacementCm:0,maxPulseDisplacementCm:0,nonzeroInputObserved:false,responded:false,pulseSamples:[],damagedDuringPulse:false},lock:{observed:false,attempts:[]},attack:{montageObserved:false,montages:[],healthDecreasedObserved:false},pause:{opened:false,paused:false,resumed:false},errors:[],samples:0}};
  scope.report.enemyResponse={method:'read-only-native-observation',scope:'routed-action-phase',physicalKeyboardRouting:false,damageSourceVerified:false,montageClassification:'name-heuristic-not-full-fight-validation',samples:0,firstSampleAt:null,lastSampleAt:null,playerHPInitial:null,playerHPMin:null,playerHPLatest:null,playerHealthDecreasedObserved:false,unobservedIntervalCount:0,opponents:[]};
  session.ux={...session.ux,controlExercise:scope.report};
 }
 const state=scope;if(state.report.done)return;
 const loaded=!!session.worldLoadingComplete&&!!session.directArrival?.released&&!!session.ux?.directReady;
 const routed=(session.controlQA?.routable??session.ux?.controls?.routable)===true;
 const paused=read(()=>UE.GameplayStatics.IsGamePaused(context));
 const nativeSequence=read(()=>{const tag=new UE.GameplayTag();tag.TagName='CharacterState.InLevelSequence';return UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(player)?.HasMatchingGameplayTag(tag);});
 const cinematic=!!session.cinematicActive||nativeSequence===true||read(()=>cinema.pending(context))===true;
 if(state.menuPhase)state.menuCloseAllowed=!cinematic;
 if(now-state.createdAt>=600000){finish(state,'global-deadline',now);return;}
 if(cinematic&&state.startedAt!==undefined&&!state.menuPhase){
  // A multipart intro briefly returned routing. Discard that attempt's
  // baselines so cinematic relocation can never count as successful movement.
  release(state);interruptEnemyObservation(state);
  const history=[...(state.report.interruptedAttempts||[]),JSON.parse(JSON.stringify({...state.report,interruptedAttempts:undefined,done:true,reason:'native-intro-interrupted',finishedAt:now}))].slice(-3);
  const createdAt=state.createdAt;
  scope=null;tick(context,session);
  scope.createdAt=createdAt;scope.report.interruptedAttempts=history;scope.report.restartCount=(state.report.restartCount||0)+1;
  return;
 }
 if(cinematic&&state.menuPhase){release(state);interruptEnemyObservation(state);state.report.pause.waiting='cinematic';state.report.waiting='cinematic';state.menuInterruptedAt=state.menuInterruptedAt??now;return;}
 if(state.menuInterruptedAt!==undefined){
  // Keep the exact owned menu and use only its normal dismissal after native
  // cinema finishes. Do not close native sequence/failure widgets or replay it.
  const gap=now-state.menuInterruptedAt;state.readyAt+=gap;state.menuStarted+=gap;if(state.menuOpened!==undefined)state.menuOpened+=gap;if(state.menuClosed!==undefined)state.menuClosed+=gap;delete state.menuInterruptedAt;
 }
 if(state.readyAt!==null&&now-state.readyAt>=15000){finish(state,'deadline',now);return;}
 if(state.menuPhase){interruptEnemyObservation(state);try{menuTick(context,state,now,paused,routed,cinematic);}catch(e){error(state,'native pause exercise',e);finish(state,'unsupported-or-error',now);}return;}
 if(!loaded||!routed||cinematic||paused!==false){state.settleAt=null;interruptEnemyObservation(state);if(state.holding)release(state);state.report.waiting=!loaded?'loading':cinematic?'cinematic':paused!==false?'pause':'routing';return;}
 // Releasing our arrival cover can hand ownership to a long native intro.
 // Its duration is not time allocated to this playable-input exercise.
 if(state.readyAt===null){
  if(state.settleAt===null)state.settleAt=now;
  state.report.settleObservedMs=now-state.settleAt;
  if(now-state.settleAt<1000){state.report.waiting='settling';return;}
  state.readyAt=now;
 }
 try{
  if(!state.actions)setup(context,state);
  if(state.startedAt===undefined){state.startedAt=now;state.report.startedAt=now;}
  const ms=now-state.startedAt;state.report.elapsedActionMs=ms;state.report.waiting=null;
  sample(context,session,player,state,now);
  if(ms>=6500){beginMenu(context,state,now);return;}
  // Pressed is a mapping-level trigger in this game. Direct action injection
  // does not inherit it: one nonzero frame, then zero, avoids toggling lock or
  // re-issuing an attack on every frame of an artificial hold.
  const lock=lockPulse(player,state,ms,now),attackBucket=ms>=1000&&ms<5000?Math.floor((ms-1000)/700):-1;
  const attack=attackBucket>=0&&attackBucket!==state.attackBucket;
  const values={move:ms<500?1:0,lock:lock?1:0,attack:attack?1:0};
  if(values.move)startContinuousMove(state);else stopContinuousMove(state);
  inject(state,values);state.holding=Object.values(values).some(Boolean);
  if(attack)state.attackBucket=attackBucket;
  if(values.move)state.report.movement.injectionObserved=true;if(values.lock)state.report.lock.injectionObserved=true;if(values.attack)state.report.attack.injectionObserved=true;
 }catch(e){error(state,'exercise',e);finish(state,'unsupported-or-error',now);}
}
exports.tick=tick;exports.stop=stop;
