const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(mode='exercise',autoSettle=true){
 let now=0,paused=false,montage=null,locked=false,lastInput={X:0,Y:0,Z:0},position={X:0,Y:0,Z:0},health=100;
 const calls=[],config={mode},enemy={GetName:()=> 'boss-actor',GetClass:()=>({path:'boss-class'}),K2_GetActorLocation:()=>({X:600,Y:0,Z:0})};
 const targeting={HasLockTarget:()=>locked,GetLockTarget:out=>{out.value={actor:enemy};}};
 const player={GetName:()=> 'hero',K2_GetActorLocation:()=>({...position}),GetLastMovementInputVector:()=>lastInput,GetComponentByClass:()=>targeting,GetCurrentMontage:()=>montage&&({GetName:()=>montage})};
 const subsystem={InjectInputVectorForAction(action,value){calls.push({action:action.id,x:value.X,time:now});if(action.id==='move'){lastInput={...value};if(value.X)position.X+=15;}if(action.id==='lock'&&value.X)locked=!locked;if(action.id==='attack'&&value.X){montage='AM_Tang_Attack_01';health-=5;}}};
 const UE={Vector:class{constructor(X,Y,Z){Object.assign(this,{X,Y,Z});}},InputModifier:class{},InputTrigger:class{},Actor:class{},ComponentSocket:class{},NewArray:()=>[],EInputActionValueType:{Axis2D:2,Boolean:0},
 KismetSystemLibrary:{IsValid:x=>!!x&&!x.invalid,GetPathName:x=>x.path},EnhancedInputLocalPlayerSubsystem:{StaticClass:()=>1},
 InputAction:{Load:path=>({id:path.includes('KeyboardMove')?'move':path.includes('LockTarget')?'lock':'attack',ValueType:path.includes('KeyboardMove')?2:0})},
 GameplayStatics:{GetPlayerCharacter:()=>player,IsGamePaused:()=>paused,GetAllActorsOfClass(_,__,out){out.value={Num:()=>1,Get:()=>enemy};}},Class:{Find:p=>p},TargetingComponent:{StaticClass:()=>2},ComponentSocketHelper:{GetActor:s=>s.actor},
 PBZBlueprintFunctionLibrary:{MakeAttribute:n=>n,GetAttributeFromCharacter:()=>health},BasicAttributeSet:{StaticClass:()=>3}};
 const session={active:true,boss:{id:'a',classes:['boss-class']},worldLoadingComplete:true,directArrival:{released:true},ux:{directReady:true,controls:{routable:true}},cinematicActive:false},exports={};
 vm.runInNewContext(fs.readFileSync(__dirname+'/control-actions.js','utf8'),{exports,Date:{now:()=>now},require:n=>({'ue':UE,'puerts':{$ref:value=>({value}),$unref:r=>r.value},'./qa-config':config,'./cinema':{pending:()=>false},'../Library/TsHelper':{default:{getlocalPlayerSubsystem:()=>subsystem}}}[n])});
 return {api:exports,UE,session,calls,player,enemy,targeting,subsystem,config,get report(){return session.ux.controlExercise;},tick(ms=100){now+=ms;exports.tick({},session);if(autoSettle&&session.ux.controlExercise?.waiting==='settling'){now+=1000;exports.tick({},session);}},set paused(v){paused=v;},set montage(v){montage=v;},set health(v){health=v;}};
}
test('private exercise observes movement, native lock, attack montage and HP decline without claiming physical input',()=>{
 const h=harness();for(let i=0;i<70;i++)h.tick();const r=h.report;
 assert.equal(r.done,true);assert.equal(r.reason,'completed');assert.equal(r.method,'engine-injected-enhanced-input');assert.equal(r.physicalKeyboardRouting,false);
 assert.equal(r.movement.responded,true);assert(r.movement.maxDisplacementCm>10);assert.equal(r.lock.observed,true);assert.equal(r.lock.expectedOpponent,true);assert.equal(r.lock.actor,'boss-actor');
 assert.equal(r.attack.montageObserved,true);assert.equal(r.attack.healthDecreasedObserved,true);assert.equal(r.errors.length,0);
 assert.equal(h.calls.filter(c=>c.action==='lock'&&c.x===1).length,1,'mapping Pressed trigger is emulated by one nonzero frame');
 assert.equal(h.calls.filter(c=>c.action==='attack'&&c.x===1).length,6);assert(h.calls.slice(-3).every(c=>c.x===0));const count=h.calls.length;h.tick(5000);assert.equal(h.calls.length,count);
});
test('manual and other QA modes never inject any action',()=>{
 for(const mode of ['manual','direct','review','flow']){const h=harness(mode);h.tick();assert.equal(h.calls.length,0);assert.equal(h.report,undefined);}
});

test('native encounter support remains observable without claiming a primary boss lock',()=>{
 const h=harness();h.session.boss.supportClasses=['support-class'];
 h.enemy.GetClass=()=>({path:'support-class'});h.enemy.GetCurrentMontage=()=>({GetName:()=> 'Support_Attack_01'});
 for(let i=0;i<70;i++)h.tick();
 assert.equal(h.report.lock.expectedOpponent,false);assert.equal(h.report.lock.expectedEncounterSupport,true);
 assert.equal(h.report.attack.expectedOpponent,false);assert.equal(h.report.attack.expectedEncounterSupport,true);
 assert.equal(h.report.attack.healthDecreasedObserved,true);
 const row=h.report.enemyResponse.opponents.find(o=>o.classPath==='support-class');
 assert(row);assert.equal(row.expectedOpponent,false);assert.equal(row.expectedEncounterSupport,true);assert.equal(row.attackLikeMontageObserved,true);
});

test('primary identity takes precedence over overlapping support and unrelated locks are not supports',()=>{
 const primary=harness();primary.session.boss.supportClasses=['boss-class'];for(let i=0;i<70;i++)primary.tick();
 assert.equal(primary.report.lock.expectedOpponent,true);assert.equal(primary.report.lock.expectedEncounterSupport,false);
 const other=harness();other.session.boss.supportClasses=['support-class'];other.enemy.GetClass=()=>({path:'unrelated-class'});for(let i=0;i<70;i++)other.tick();
 assert.equal(other.report.lock.expectedOpponent,false);assert.equal(other.report.lock.expectedEncounterSupport,false);
 assert.equal(other.report.enemyResponse.opponents.length,0);
});
test('unreleased, unroutable or cinematic arrivals cannot start the playable exercise deadline',()=>{
 const h=harness();h.session.directArrival.released=false;h.tick(50000);assert.equal(h.calls.length,0);
 h.session.directArrival.released=true;h.session.ux.controls.routable=false;h.tick();assert.equal(h.calls.length,0);h.tick(15000);assert.equal(h.report.done,false);assert.equal(h.calls.length,0);h.session.ux.controls.routable=true;h.tick();assert(h.calls.length>0);
 const c=harness();c.session.cinematicActive=true;c.tick();assert.equal(c.calls.length,0);c.session.cinematicActive=false;c.tick();assert(c.calls.length>0);
});
test('pause and renewed cinema release every action immediately with a bounded wait',()=>{
 for(const reason of ['pause','cinema']){const h=harness();h.tick();assert.equal(h.calls[0].x,1);if(reason==='pause')h.paused=true;else h.session.cinematicActive=true;h.tick();assert(h.calls.slice(-3).every(c=>c.x===0));const count=h.calls.length;h.tick(1000);assert.equal(h.calls.length,count);h.tick(reason==='cinema'?600000:15000);assert.equal(h.report.done,true);assert.equal(h.report.reason,reason==='cinema'?'global-deadline':'deadline');}
});
test('missing injection API or wrong action type finishes with diagnostics instead of throwing',()=>{
 const h=harness();delete h.subsystem.InjectInputVectorForAction;h.subsystem.OtherInputMethod=()=>{};assert.doesNotThrow(()=>h.tick());assert.equal(h.report.done,true);assert.equal(h.report.reason,'unsupported-or-error');assert(h.report.apiMethods.includes('OtherInputMethod'));assert.match(h.report.errors[0],/unavailable/);
 const bad=harness();bad.UE.InputAction.Load=()=>({ValueType:99});bad.tick();assert.equal(bad.report.done,true);assert.match(bad.report.errors[0],/value type/);assert.equal(bad.calls.length,0);
});
test('hit reactions are not accepted as attack evidence and unknown enemy HP stays unconfirmed',()=>{
 const h=harness();h.subsystem.InjectInputVectorForAction=(a,v)=>h.calls.push({action:a.id,x:v.X});h.montage='AM_Hit_Attack_Knock';h.health=NaN;for(let i=0;i<70;i++)h.tick();assert.equal(h.report.attack.montageObserved,false);assert.equal(h.report.attack.healthDecreasedObserved,false);assert.equal(h.report.movement.responded,false);
});
test('world change clears injected actions and a repeated boss gets a distinct bounded report',()=>{
 const h=harness();h.tick();const old=h.report;h.session.directArrival={released:true};h.tick();assert.notEqual(h.report,old);assert(h.calls.slice(3,6).every(c=>c.x===0));h.session.boss.training=true;h.tick();assert.equal(h.report.done,true);assert.equal(h.report.reason,'session-ended');assert(h.calls.slice(-3).every(c=>c.x===0));
});
test('stale engine wrappers and a vanished pawn cannot leave an indefinite input hold',()=>{
 const h=harness();h.tick();h.subsystem.InjectInputVectorForAction=()=>{throw Error('expired wrapper');};assert.doesNotThrow(()=>h.tick());assert.equal(h.report.done,true);assert.match(h.report.errors.join(' '),/expired wrapper/);
 const lost=harness();lost.tick();lost.player.invalid=true;lost.tick();assert(lost.calls.slice(-3).every(c=>c.x===0));lost.tick(15000);assert.equal(lost.report.done,true);
});

test('a 60-second native intro with a stale session flag does not consume the exercise deadline',()=>{
 const h=harness();let nativeIntro=true;h.UE.GameplayTag=class{};h.UE.AbilitySystemBlueprintLibrary={GetAbilitySystemComponent:()=>({HasMatchingGameplayTag:()=>nativeIntro})};
 h.tick();h.tick(60000);assert.equal(h.calls.length,0);assert.equal(h.report.done,false);assert.equal(h.report.waiting,'cinematic');
 nativeIntro=false;h.tick();for(let i=0;i<70;i++)h.tick();assert.equal(h.report.reason,'completed');assert(h.report.elapsedMs<15000);assert.equal(h.report.movement.responded,true);
});

test('native A-chain attacks are recognized while hit reactions remain excluded',()=>{
 for(const montage of ['Hun_ShanZi_A_Montage','Hun_ShanZi_AA_Montage','Hun_ShanZi_AAA_Montage','Hun_ShanZi_AAAA_Montage']){const h=harness();h.montage=montage;h.tick();assert.equal(h.report.attack.montageObserved,true);}
 const h=harness();h.montage='Hun_ShanZi_Hit_AA_Montage';h.tick();assert.equal(h.report.attack.montageObserved,false);
});

test('movement pulse records bounded position velocity and health without accepting displacement alone',()=>{
 const h=harness();h.player.GetLastMovementInputVector=()=>({X:0,Y:0,Z:0});h.player.GetVelocity=()=>({X:100,Y:0,Z:0});h.player.GetLocomotionDriverComponent=()=>({GetMoveInput(){},GetVelocity(){},GetClass:()=>({path:'driver-class'})});
 for(let i=0;i<70;i++)h.tick();const m=h.report.movement;assert(m.maxPulseDisplacementCm>10);assert.equal(m.responded,false);assert(m.pulseSamples.length<=12);assert(m.pulseSamples.every(s=>s.ms<=500&&s.position&&s.velocity&&Number.isFinite(s.health)));assert(m.driverMethods.includes('GetMoveInput'));assert.equal(m.driverClass,'driver-class');
 const hit=harness();hit.tick();hit.health=90;hit.tick();for(let i=0;i<70;i++)hit.tick();assert.equal(hit.report.movement.damagedDuringPulse,true);assert.equal(hit.report.movement.responded,false);
});

function nativeMenuHarness(options={}){
 const h=harness(),original=h.subsystem.InjectInputVectorForAction;let active=!!options.preexisting,closed=0;
 const widget={GetName:()=>options.unexpected?'NativeFailureScreen':'W_Systembase_QA',GetClass:()=>({path:options.unexpected?'/Game/UI/NativeFailure.NativeFailure_C':'/Game/PBZContent/UI/UINew/System/W_Systembase.W_Systembase_C'}),IsActivated:()=>active,DeactivateWidget(){closed++;active=false;if(!options.stuck){h.paused=false;h.session.ux.controls.routable=true;}}};
 h.UE.GameplayTag=class{};h.UE.PBZBlueprintFunctionLibrary.GetUILayOut=()=>({Layers:{Get:tag=>({GetActiveWidget:()=>tag.TagName==='UI.Layer.GameSystem'&&active?widget:null})}});
 const load=h.UE.InputAction.Load;h.UE.InputAction.Load=path=>path.includes('IA_PushGameSystemMenu')?{id:'menu',ValueType:0}:load(path);
 h.subsystem.InjectInputVectorForAction=(action,value)=>{original(action,value);if(action.id==='menu'&&value.X&&!options.noOpen){active=true;h.paused=true;h.session.ux.controls.routable=false;}};
 return Object.assign(h,{widget,getClosed:()=>closed});
}

test('native pause action opens the system root, observes its pause, then normally dismisses and verifies restored routing',()=>{
 const h=nativeMenuHarness();for(let i=0;i<85;i++)h.tick();const p=h.report.pause;
 assert.equal(h.report.done,true);assert.equal(p.opened,true);assert.equal(p.paused,true);assert.equal(p.closedNative,true);assert.equal(p.resumed,true);assert.equal(p.layer,'UI.Layer.GameSystem');assert.equal(p.widget,'W_Systembase_QA');assert.equal(h.getClosed(),1);
 assert.equal(h.calls.filter(c=>c.action==='menu'&&c.x===1).length,1);assert(h.calls.slice(-4).every(c=>c.x===0));
});

test('unexpected and pre-existing native menus are never dismissed by the pause exercise',()=>{
 for(const options of [{unexpected:true},{preexisting:true}]){const h=nativeMenuHarness(options);for(let i=0;i<85;i++)h.tick();assert.equal(h.getClosed(),0);assert.equal(h.report.pause.resumed,false);assert.match(h.report.pause.unsupported,/native menu/i);assert.equal(h.report.done,true);}
});

test('pause action or native close failures remain bounded and cannot manufacture unpause success',()=>{
 const missing=nativeMenuHarness({noOpen:true});for(let i=0;i<110;i++)missing.tick();assert.equal(missing.report.pause.opened,false);assert.match(missing.report.pause.failure,/did not open/);assert.equal(missing.report.done,true);
 const stuck=nativeMenuHarness({stuck:true});for(let i=0;i<120;i++)stuck.tick();assert.equal(stuck.report.pause.opened,true);assert.equal(stuck.report.pause.resumed,false);assert.match(stuck.report.pause.failure,/did not recover/);assert.equal(stuck.getClosed(),1);assert.equal(stuck.report.done,true);
});

function continuousHarness(){
 const h=harness(),native=[];let active=false,x=0;
 h.UE.EnhancedInputLibrary={MakeInputActionValueOfType(...args){native.push({kind:'value',args});return {value:args};}};
 h.subsystem.StartContinuousInputInjectionForAction=(action,value,modifiers,triggers)=>{native.push({kind:'start',action:action.id,value,modifiers,triggers});active=true;};
 h.subsystem.StopContinuousInputInjectionForAction=action=>{native.push({kind:'stop',action:action.id});active=false;};
 h.player.K2_GetActorLocation=()=>({X:x,Y:0,Z:0});h.player.GetLastMovementInputVector=()=>({X:active?1:0,Y:0,Z:0});
 return Object.assign(h,{native,frame(ms=100){if(active)x+=20;h.tick(ms);},isContinuous:()=>active});
}

test('continuous native movement spans engine frames for 500ms, then stops without weakening observed displacement criteria',()=>{
 const h=continuousHarness();for(let i=0;i<70;i++)h.frame();
 assert.equal(h.native.filter(c=>c.kind==='start').length,1);assert.equal(h.native.filter(c=>c.kind==='stop').length,1);assert.deepEqual(h.native.find(c=>c.kind==='value').args,[1,0,0,2]);
 assert.equal(h.report.movement.injectionMethod,'continuous-enhanced-input');assert.equal(h.report.movement.continuousStopped,true);assert.equal(h.report.movement.responded,true);assert(h.report.movement.maxPulseDisplacementCm>10);assert.equal(h.isContinuous(),false);
 assert.equal(h.calls.filter(c=>c.action==='move'&&c.x===1).length,0,'frame injection must not override the owned continuous movement value');
});

test('every early exit stops the owned continuous injection before clearing action values',()=>{
 for(const reason of ['pause','cinema','stop','mode','world','pawn']){
  const h=continuousHarness();h.frame();assert.equal(h.isContinuous(),true);
  if(reason==='pause')h.paused=true;else if(reason==='cinema')h.session.cinematicActive=true;else if(reason==='stop')h.api.stop();else if(reason==='mode')h.config.mode='manual';else if(reason==='world'){h.session.directArrival={released:false};}else h.player.invalid=true;
  if(reason!=='stop')h.frame();assert.equal(h.isContinuous(),false,reason);assert.equal(h.native.filter(c=>c.kind==='stop').length,1,reason);assert(h.calls.slice(-3).every(c=>c.x===0),reason);
 }
});

test('unsupported or partially failing continuous input safely falls back to the existing frame path',()=>{
 const unavailable=harness();unavailable.tick();assert.equal(unavailable.report.movement.injectionMethod,'frame-enhanced-input');assert.equal(unavailable.calls.find(c=>c.action==='move').x,1);
 const failed=continuousHarness();failed.subsystem.StartContinuousInputInjectionForAction=()=>{throw Error('unsupported native value wrapper');};assert.doesNotThrow(()=>failed.frame());assert.equal(failed.native.filter(c=>c.kind==='stop').length,1);assert.equal(failed.report.movement.injectionMethod,'frame-enhanced-input');assert.match(failed.report.movement.continuousFallback,/unsupported/);assert.equal(failed.calls.find(c=>c.action==='move').x,1);
});

test('read-only opponent response records expected actor montages and player HP without attributing damage or validating a full fight',()=>{
 const h=harness();let playerHP=100,enemyMontage='AM_PengMeng_Hit_Attack';
 h.UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter=actor=>actor===h.player?playerHP:200;
 h.enemy.GetCurrentMontage=()=>({GetName:()=>enemyMontage});
 h.tick();const r=h.report.enemyResponse;
 assert.equal(r.playerHPInitial,100);assert.equal(r.playerHPMin,100);assert.equal(r.opponents[0].hitReactionMontageObserved,true);assert.equal(r.opponents[0].attackLikeMontageObserved,false);
 playerHP=85;enemyMontage='AM_PengMeng_Attack_01';h.tick();
 assert.equal(r.playerHPInitial,100);assert.equal(r.playerHPMin,85);assert.equal(r.playerHPLatest,85);assert.equal(r.playerHealthDecreasedObserved,true);
 assert.equal(r.damageSourceVerified,false);assert.equal(r.physicalKeyboardRouting,false);assert.equal(r.montageClassification,'name-heuristic-not-full-fight-validation');
 assert.equal(r.opponents[0].expectedOpponent,true);assert.equal(r.opponents[0].classPath,'boss-class');assert.equal(r.opponents[0].attackLikeMontageObserved,true);assert.equal(r.opponents[0].montages.length,2);
 assert.equal(h.calls.filter(c=>c.action==='attack'&&c.x===1).length,0,'observer must not add actions before the existing attack phase');
});

test('enemy response ignores loading, cinematic, pause and unroutable samples and does not attribute an HP change across their gap',()=>{
 for(const reason of ['loading','cinematic','pause','routing']){
  const h=harness();let hp=100;h.UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter=actor=>actor===h.player?hp:200;
  const blocked=value=>{if(reason==='loading')h.session.worldLoadingComplete=!value;else if(reason==='cinematic')h.session.cinematicActive=value;else if(reason==='pause')h.paused=value;else h.session.ux.controls.routable=!value;};
  blocked(true);h.tick();const r=h.report.enemyResponse;assert.equal(r.samples,0,reason);assert.equal(r.playerHPInitial,null,reason);
  blocked(false);h.tick();assert.equal(r.samples,1,reason);blocked(true);hp=60;h.tick();assert.equal(r.samples,1,reason);assert.equal(r.playerHPMin,100,reason);
  blocked(false);h.tick();const current=h.report.enemyResponse;assert.equal(current.samples,reason==='cinematic'?1:2,reason);assert.equal(current.playerHPMin,60,reason);assert.equal(current.playerHealthDecreasedObserved,false,reason);assert.equal(r.unobservedIntervalCount,1,reason);
  hp=55;h.tick();assert.equal(current.playerHealthDecreasedObserved,true,reason);
 }
});

test('enemy response excludes unrelated actors, bounds montage history, and treats missing HP or animation APIs as unknown',()=>{
 const h=harness();h.enemy.GetClass=()=>({path:'unrelated-class'});h.enemy.GetCurrentMontage=()=>({GetName:()=> 'AM_Attack_01'});h.UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter=()=>NaN;h.tick();
 assert.equal(h.report.enemyResponse.opponents.length,0);assert.equal(h.report.enemyResponse.playerHPInitial,null);assert.equal(h.report.enemyResponse.playerHealthDecreasedObserved,false);
 h.enemy.GetClass=()=>({path:'boss-class'});delete h.enemy.GetCurrentMontage;h.tick();assert.equal(h.report.enemyResponse.opponents[0].montages.length,0);assert.equal(h.report.enemyResponse.opponents[0].attackLikeMontageObserved,false);
 let id=0;h.enemy.GetMesh=()=>({GetAnimInstance:()=>({GetCurrentActiveMontage:()=>({GetName:()=> 'AM_Idle_'+id})})});for(let i=0;i<30;i++){id++;h.tick();}
 assert.equal(h.report.enemyResponse.opponents[0].montages.length,24);assert.equal(h.report.enemyResponse.opponents[0].attackLikeMontageObserved,false);
});

test('native menu observation does not extend the read-only enemy response sampling window',()=>{
 const h=nativeMenuHarness();for(let i=0;i<66;i++)h.tick();const r=h.report.enemyResponse,count=r.samples,last=r.lastSampleAt;
 for(let i=0;i<15;i++)h.tick();assert.equal(h.report.done,true);assert.equal(r.samples,count);assert.equal(r.lastSampleAt,last);assert.equal(h.report.pause.resumed,true);
});

test('bounded lock retries recover from a refused first pulse and preserve the acquired target',()=>{
 const h=harness(),native=h.subsystem.InjectInputVectorForAction;let count=0;
 h.subsystem.InjectInputVectorForAction=(action,value)=>{if(action.id==='lock'&&value.X&&++count===1){h.calls.push({action:action.id,x:value.X,time:700});return;}native(action,value);};
 for(let i=0;i<70;i++)h.tick();
 assert.equal(h.calls.filter(c=>c.action==='lock'&&c.x===1).length,2);assert.equal(h.report.lock.observed,true);assert.equal(h.report.lock.expectedOpponent,true);
 assert.deepEqual(Array.from(h.report.lock.attempts,a=>a.scheduledMs),[600,2200,4000]);assert.deepEqual(Array.from(h.report.lock.attempts,a=>a.ms),[600,2200,4000]);
 assert.equal(h.report.lock.attempts[2].reason,'existing-target-preserved');assert.equal(h.report.lock.attempts[2].injectionAttempted,false);
 assert.equal(h.calls.filter(c=>c.action==='attack'&&c.x===1).length,6,'retry must not add attacks');assert.equal(h.report.elapsedActionMs,6500);
});

test('three unanswered lock pulses remain unconfirmed and no later retries are sent',()=>{
 const h=harness(),native=h.subsystem.InjectInputVectorForAction;
 h.subsystem.InjectInputVectorForAction=(action,value)=>{if(action.id==='lock'&&value.X){h.calls.push({action:action.id,x:value.X});return;}native(action,value);};
 for(let i=0;i<90;i++)h.tick();assert.equal(h.calls.filter(c=>c.action==='lock'&&c.x===1).length,3);assert.equal(h.report.lock.attempts.length,3);assert.equal(h.report.lock.observed,false);assert.equal(h.report.lock.expectedOpponent,undefined);assert.equal(h.report.done,true);
});

test('already locked or unknown target state never causes a toggle, including an unexpected target',()=>{
 for(const state of [true,null]){
  const h=harness();h.targeting.HasLockTarget=()=>state;h.enemy.GetClass=()=>({path:'unrelated-class'});for(let i=0;i<70;i++)h.tick();
  assert.equal(h.calls.filter(c=>c.action==='lock'&&c.x===1).length,0);assert.equal(h.report.lock.attempts.length,3);
  assert(h.report.lock.attempts.every(a=>a.reason===(state===true?'existing-target-preserved':'target-state-unavailable')));
  assert.notEqual(h.report.lock.expectedOpponent,true);
 }
});

test('paused and unroutable retry windows are missed rather than replayed late',()=>{
 for(const gate of ['paused','routing']){
  const h=harness();h.tick();
  if(gate==='cinematic')h.session.cinematicActive=true;else if(gate==='paused')h.paused=true;else h.session.ux.controls.routable=false;
  for(let i=0;i<45;i++)h.tick();assert.equal(h.calls.filter(c=>c.action==='lock'&&c.x===1).length,0);
  if(gate==='cinematic')h.session.cinematicActive=false;else if(gate==='paused')h.paused=false;else h.session.ux.controls.routable=true;
  h.tick();assert.equal(h.report.lock.attempts.length,3);assert(h.report.lock.attempts.every(a=>a.reason==='window-missed'));assert.equal(h.calls.filter(c=>c.action==='lock'&&c.x===1).length,0);
 }
});

test('short routing gaps between native intro clips never start injection or its playable deadline',()=>{
 const h=harness('exercise',false);h.tick();h.tick(700);assert.equal(h.calls.length,0);assert.equal(h.report.waiting,'settling');
 h.session.cinematicActive=true;h.tick(50);h.tick(30000);assert.equal(h.report.done,false);assert.equal(h.calls.length,0);
 h.session.cinematicActive=false;h.tick(50);h.tick(999);assert.equal(h.calls.length,0);h.tick(1);assert(h.calls.some(c=>c.x===1));assert.equal(h.report.settleObservedMs,1000);assert.equal(h.report.elapsedActionMs,0);
});

test('multipart native intro restarts a fresh bounded attempt and never accepts cinematic relocation as movement',()=>{
 const h=harness('exercise',false);let x=0;h.player.K2_GetActorLocation=()=>({X:x,Y:0,Z:0});h.player.GetLastMovementInputVector=()=>({X:1,Y:0,Z:0});
 h.tick();h.tick(1000);h.tick(100);const old=h.report;assert.equal(old.movement.responded,false);
 h.session.cinematicActive=true;h.tick(100);assert(h.calls.slice(-3).every(c=>c.x===0));x=50000;h.tick(60000);assert.equal(h.report.done,false);assert.equal(h.report.restartCount,1);
 h.session.cinematicActive=false;h.tick();h.tick(1000);const fresh=h.report;assert.notEqual(fresh,old);assert.equal(fresh.movement.start.X,50000);assert.equal(fresh.movement.maxDisplacementCm,0);assert.equal(fresh.movement.responded,false);assert.equal(fresh.interruptedAttempts[0].reason,'native-intro-interrupted');
 h.tick(100);assert.equal(fresh.movement.maxDisplacementCm,0);assert.equal(fresh.movement.responded,false);
});

test('permanent initial loading or routing blockage reaches the independent600s bound without injection',()=>{
 for(const gate of ['loading','routing']){const h=harness('exercise',false);if(gate==='loading')h.session.worldLoadingComplete=false;else h.session.ux.controls.routable=false;
  h.tick();h.tick(599999);assert.equal(h.report.done,false);h.tick(1);assert.equal(h.report.reason,'global-deadline');assert.equal(h.calls.length,0);
 }
});

test('a native cinema during the owned pause menu never closes it until cinematic ownership ends',()=>{
 const h=nativeMenuHarness();for(let i=0;i<67;i++)h.tick();assert.equal(h.report.pause.opened,true);
 h.session.cinematicActive=true;h.tick(100);h.tick(20000);assert.equal(h.getClosed(),0);assert.equal(h.report.done,false);
 h.session.cinematicActive=false;for(let i=0;i<12;i++)h.tick();assert.equal(h.getClosed(),1);assert.equal(h.report.pause.resumed,true);assert.equal(h.report.done,true);
});


test('long native introduction may exceed three minutes without consuming the15s action budget',()=>{
 const h=harness('exercise',false);h.session.cinematicActive=true;h.tick();h.tick(240000);
 assert.equal(h.report.done,false);assert.equal(h.calls.length,0);assert.equal(h.report.globalDeadlineMs,600000);assert.equal(h.report.playableDeadlineMs,15000);
 h.session.cinematicActive=false;h.tick();h.tick(1000);for(let i=0;i<70;i++)h.tick();
 assert.equal(h.report.reason,'completed');assert(h.report.elapsedActionMs<15000);
});

test('vanished pawn before readiness still terminates at600s global bound without input',()=>{
 const h=harness('exercise',false);h.session.cinematicActive=true;h.tick();h.player.invalid=true;h.tick(599999);
 assert.equal(h.report.done,false);h.tick(1);assert.equal(h.report.done,true);assert.equal(h.calls.length,0);
});
