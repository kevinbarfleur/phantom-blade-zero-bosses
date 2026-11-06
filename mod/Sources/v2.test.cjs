const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const model = require('./model');
const pristine = {PBZGameSystem:{CurrentLevelName:'PBZ_Duanhun_WP',LastSaveActorID:'Bell_DH_007',CycleCount:0,PlayerTransform:{Location:{X:0,Y:0,Z:62152}}},BellManager:{SaveBellID:'Bell_DH_007',ActivateBellIDs:[]},AISystem:{SpawnerSaveData:{}},BossRecord:{earlier:1},EventPipeline:{trigger:0},Player:{RemainingDays:65},Inventory:{CurrentMapID:'Duanhun',MainWeaponInfos:{Tang:{WeaponLevel:30}},CurrentMainWeaponID:'Tang',MedicineInfos:{Hulu:{CurrentTime:0,MaxTime:4}}}};
function delegate(){const handlers=new Set();return {Add:h=>handlers.add(h),Remove:h=>handlers.delete(h),emit:(...a)=>[...handlers].forEach(h=>h(...a))};}
function harness(options={}) {
 const calls={order:[],writes:[],captures:[],loads:[],travel:[],dialogs:[],pushes:[],intervals:new Map(),timeouts:new Map(),original:[],pauses:[],nextGear:structuredClone(pristine)};let serial=0,gearRequest=false;
 const instance={valid:true,OnEndLoadingScreen:delegate(),LoadGame(slot,ref){calls.loads.push(slot);ref.value={ResultType:options.loadFails?0:1,LevelName:options.level||'PBZ_Duanhun_WP',GameModeOptions:'test'};},SetLoadingScreen(){}};
 const save={ReplaceSaveString(param,cb,json){(gearRequest?calls.captures:calls.writes).push({param,cb,json});gearRequest=false;return {ResultType:options.writeFails?0:1};},SaveObjectData(){},ForceSave(){throw Error('Full-world save must not be used');}};
 const UE={EDifficultMode:{Easy:1,Handicapped:0,Normal:2,Hard:3,NightMare:4},JsonObjectWrapper:class{},KismetTextLibrary:{Conv_TextToString:x=>x},KismetSystemLibrary:{IsValid:x=>!!x?.valid,MakeSoftClassPath:x=>x,Conv_SoftClassPathToSoftClassRef:x=>x},SubsystemBlueprintLibrary:{GetGameInstanceSubsystem:()=>save},PBZSaveLoadSubsystem:{StaticClass:()=>0},SaveGameParam:class{},LoadGameResultParam:class{},GameplayTag:class{},Key:class{},ESaveLoadResultType:{Success:1,Failed:0},ESlateVisibility:{Collapsed:8},ECommonMessagingResult:{Confirmed:1},GameplayStatics:{GetGameInstance:()=>instance,GetPlayerController:()=>({valid:true,IsInputKeyDown:()=>false}),GetPlayerCharacter:()=>({valid:true,K2_GetActorLocation:()=>({X:0,Y:0,Z:62152})}),IsGamePaused:()=>calls.paused||false,SetGamePaused:(_,value)=>{calls.paused=value;calls.pauses.push(value);},OpenLevel:(...a)=>calls.travel.push(a)},JSONUtility:{ParseStringToJson(str,ok,out){ok.value=true;out.value=JSON.parse(str);},JsonToString(json,ok,str){ok.value=true;str.value=JSON.stringify(json);}},AsyncAction_ShowConfirmation:{},AsyncAction_PushContentToLayerForPlayer:{PushContentToLayerForPlayer(){const a={BeforePush:delegate(),AfterPush:delegate(),Activate(){}};calls.pushes.push(a);return a;}}};
 for(const kind of ['ShowConfirmationYesNo','ShowConfirmationOk'])UE.AsyncAction_ShowConfirmation[kind]=(...args)=>{const a={args,OnResult:delegate(),Activate(){}};calls.dialogs.push(a);return a;};
 const runDriver={};vm.runInNewContext(fs.readFileSync(__dirname+'/run-driver.js','utf8'),{exports:runDriver,require:n=>({'ue':UE,'puerts':{$ref:value=>({value}),$unref:r=>r.value},'./run-model':require('./run-model'),'./run-hud':{stop(){},update(){}},'./cinema':{pending:()=>false,entryLoadingActive:()=>false}}[n])});
 const originalRunTick=runDriver.tick;runDriver.tick=(...args)=>{calls.order.push('runs');return originalRunTick(...args);};
 const exports={};
 vm.runInNewContext(fs.readFileSync(__dirname+'/runtime-v2.js','utf8'),{exports,Date:options.Date||Date,__CodexBossesLoader:options.loaderVersion?{version:options.loaderVersion}:undefined,console:{log(){}},JSON,String,Error,setTimeout:fn=>{const id=++serial;calls.timeouts.set(id,fn);return id;},clearTimeout:id=>calls.timeouts.delete(id),setInterval:fn=>{const id=++serial;calls.intervals.set(id,fn);return id;},clearInterval:id=>calls.intervals.delete(id),require(name){if(name==='./boss-label')return require('./boss-label');if(name==='./entry-watchdog')return require('./entry-watchdog');if(name==='./run-driver')return runDriver;return {'ue':UE,'cpp':{FText:{FromString:x=>x}},'puerts':{$ref:value=>({value}),$unref:r=>r.value,toDelegate:(_,h)=>h},'./snapshot':pristine,'./validation':{tick(){}},'./battle':{activateDirectCombat(){calls.order.push('activate-combat');},holdDirectCombat(){calls.order.push('initial-hold');if(options.holdFails)throw Error('expired native wrapper');},install(session,onVictory){calls.session=session;calls.onVictory=onVictory;},patchRecorder(){}},'./hold':{configure(){},beginLaunch(widget){widget.codexRetainOnConfirm=true;calls.launches=(calls.launches||0)+1;},endLaunch(){}},'./cinema':{tick:()=>false,releaseArrivalLoading(){calls.order.push('loading-cleanup');},entryLoadingActive:()=>!!options.entryLoading},'./entry-protection':{tick(){calls.order.push('entry-protection');if(options.protectionFails)throw Error('expired protection actor');},stop(){calls.order.push('protection-stop');},forgetWorldReferences(){calls.worldRefDrops=(calls.worldRefDrops||0)+1;}},'./selector':{bosses:[{id:'BP_Monster_ZuoShang_Ending',profile:{},classes:['phase1','phase2'],members:['FinalBoss']}]},'../Library/UIHelper':{default:{GetTextByID:()=> 'skip-prologue'}},'./gear':{capture(){gearRequest=true;return structuredClone(calls.nextGear);}},'./arrival':{begin(){},tick(){calls.order.push('arrival');},release(){},dispose(s){calls.disposals=(calls.disposals||0)+1;s.directArrival=null;}},'./training':{destination:{id:'Codex_Training',training:true,members:[],classes:[],map:'Duanhun',profile:{level:'PBZ_Duanhun_WP',bell:'Bell_DH_007',transform:pristine.PBZGameSystem.PlayerTransform,camera:{},clearActors:[],clearTags:[],nodeIDs:[]}},tick(){}},'./inanis':{configure(){}},'./arena':{tick(){}},'./model':model,'./arsenal':{initialize:()=>({weapons:30,edges:25,accessories:40,medicines:15})}}[name]||(()=>{throw Error(name)})();}});
 const flush=()=>{const entries=[...calls.timeouts];for(const [id,fn]of entries)if(calls.timeouts.has(id)){calls.timeouts.delete(id);fn();}};
 return {api:exports,calls,instance,UE,flush};
}
test('retry retains chosen loadout, resets world and position, and refills remedies',()=>{
 const changed=structuredClone(pristine);changed.Inventory.CurrentMainWeaponID='Other';changed.Inventory.MainWeaponInfos.Other={WeaponLevel:60};changed.PBZGameSystem.PlayerTransform={Z:999};changed.BossRecord.final=1;changed.EventPipeline.trigger=1;
 const gear=model.captureGear(changed), result=model.encounterSave(pristine,gear,2,true);
 assert.equal(result.Inventory.CurrentMainWeaponID,'Other');assert.equal(result.Inventory.MainWeaponInfos.Other.WeaponLevel,30);assert.equal(result.Inventory.MainWeaponInfos.Other.ReincarnationCount,0);
 assert.deepEqual(result.BossRecord,pristine.BossRecord);assert.deepEqual(result.EventPipeline,pristine.EventPipeline);assert.deepEqual(result.PBZGameSystem.PlayerTransform,pristine.PBZGameSystem.PlayerTransform);
 assert.equal(result.Inventory.MedicineInfos.Hulu.CurrentTime,4);assert.equal(result.PBZGameSystem.CycleCount,0);assert.equal(result.PBZGameSystem.DifficultModeByte,2);assert.equal(pristine.Inventory.MedicineInfos.Hulu.CurrentTime,0);
});
test('campaign-only nightmare is rejected; ordinary difficulty does not allocate campaign binding',()=>{
 for(const d of [1,2,3]){const r=model.encounterSave(pristine,null,d,false);assert.equal(r.PBZGameSystem.DifficultModeByte,d);assert.equal(r.PBZGameSystem.NightmareSlotIndex,-1);}
 assert.throws(()=>model.encounterSave(pristine,null,4,false));assert.throws(()=>model.captureGear({}));
});
test('the title screen identifies the actual loader version so a previous release is recognizable',()=>{
 const h=harness({loaderVersion:'0.7.0-preview.3'});let label;
 class Start{bindButtonClicked(){}InitText(){}BP_OnActivated(){}CheckTag(){}UpdateVersionText(){}}
 h.api.patchStartMenu(Start);const menu=new Start();menu.Version={SetText:value=>label=value};menu.InitText();assert.equal(label,'BOSSES 0.7.0-preview.3');
});
test('first title-to-training launch works before any run or failure-return state exists',()=>{
 const h=harness();h.api.openTraining(h.instance);
 assert.equal(h.calls.writes.length,1);
 h.calls.writes[0].cb('ManualSave3',null,0,true);
 assert.equal(h.calls.dialogs.length,0);
 assert.equal(h.calls.travel.length,1);
 assert.equal(h.calls.session.boss.training,true);
 assert.equal(h.calls.session.runFailureReturn,undefined);
 assert.equal(h.calls.session.prepareOnArrival,true);
});
test('travel waits for write; duplicate and late callbacks do not load twice',()=>{
 const h=harness();h.api.replay(h.instance,2);assert.equal(h.api.replay(h.instance),false);const w=h.calls.writes[0];assert.equal(h.calls.travel.length,0);
 w.cb('wrong',null,0,true);assert.equal(h.calls.travel.length,0);w.cb('ManualSave3',null,0,true);w.cb('ManualSave3',null,0,true);assert.equal(h.calls.travel.length,1);
 h.api.replay(h.instance,3);w.cb('ManualSave3',null,0,true);assert.equal(h.calls.travel.length,1);assert.equal(h.calls.writes[1].param.SaveSlotName,'ManualSave3');
});
test('save/read failure and unexpected map fail before world travel',()=>{
 for(const opts of [{writeFails:true},{loadFails:true},{level:'Wrong'}]){const h=harness(opts);h.api.replay(h.instance);if(!opts.writeFails)h.calls.writes[0].cb('ManualSave3',null,0,true);else h.flush();assert.equal(h.calls.travel.length,0);assert.equal(h.calls.dialogs.length,1);}
});

test('an expired native wrapper stops automation and opens an actionable recovery menu',()=>{
 const h=harness({holdFails:true});h.api.replay(h.instance,2);h.calls.writes[0].cb('ManualSave3',null,0,true);
 class Mode{bindSaveTipExtension(){}}
 h.api.patchGameMode(Mode);const mode=new Mode();mode.valid=true;mode.bindSaveTipExtension();
 for(let i=0;i<5;i++)for(const tick of [...h.calls.intervals.values()])tick();
 assert.equal(h.calls.intervals.size,0);assert.equal(h.calls.session.autoNext,false);assert.equal(h.calls.session.ux.entryFailure,true);assert.equal(h.calls.pushes.length,1);
 const menu={};h.calls.pushes[0].BeforePush.emit(menu);assert.equal(menu.codexScreen,'entry-error');
});

test('entry protection runs after arrival cleanup and prevents direct activation from undoing a native loading hold',()=>{
 const options={entryLoading:true},h=harness(options);h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);h.calls.session.initialized=true;
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}}h.api.patchGameMode(Mode);const mode=new Mode();mode.valid=true;mode.bindSaveTipExtension();const tick=()=>[...h.calls.intervals.values()].forEach(fn=>fn());
 for(let i=0;i<14;i++)tick();h.calls.order.length=0;tick();
 assert.deepEqual(h.calls.order,['initial-hold','arrival','loading-cleanup','entry-protection','runs']);
 options.entryLoading=false;for(let i=0;i<14;i++)tick();h.calls.order.length=0;tick();
 assert.deepEqual(h.calls.order,['initial-hold','arrival','loading-cleanup','entry-protection','activate-combat','runs']);mode.ReceiveEndPlay();
});

test('native world end releases entry protection and removes its runtime ticker',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){h.calls.order.push('native-end');}}h.api.patchGameMode(Mode);const mode=new Mode();mode.valid=true;mode.bindSaveTipExtension();h.calls.order.length=0;
 mode.ReceiveEndPlay();assert.equal(h.calls.intervals.size,0);assert.deepEqual(h.calls.order,['protection-stop','native-end']);
});

test('an entry protection exception releases its ownership before opening recovery UI',()=>{
 const h=harness({protectionFails:true});h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}}h.api.patchGameMode(Mode);const mode=new Mode();mode.valid=true;mode.bindSaveTipExtension();h.calls.order.length=0;
 for(const fn of [...h.calls.intervals.values()])fn();assert.equal(h.calls.intervals.size,0);assert.deepEqual(h.calls.order,['arrival','loading-cleanup','entry-protection','protection-stop']);assert.equal(h.calls.pushes.length,1);const menu={};h.calls.pushes[0].BeforePush.emit(menu);assert.equal(menu.codexScreen,'entry-error');
});

test('a committed encounter change releases old protection before loading and resets its expiration and diagnostics',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);h.calls.session.entryProtectionExpired=true;Object.assign(h.calls.session.ux,{entryProtectionActive:true,entryProtectionError:'old',entryAIHeld:['old'],entryAIResumed:['old']});
 const load=h.instance.LoadGame;h.instance.LoadGame=(...args)=>{h.calls.order.push('load-game');return load(...args);};h.calls.order.length=0;
 h.api.replay(h.instance);assert.equal(h.calls.order.length,0,'pending save does not prematurely release old ownership');h.calls.writes[1].cb('ManualSave3',null,0,true);
 assert.deepEqual(h.calls.order,['protection-stop','load-game','protection-stop']);assert.equal(h.calls.session.entryProtectionExpired,false);assert.equal(Object.keys(h.calls.session.ux).some(key=>key.startsWith('entryProtection')||key==='entryAIHeld'||key==='entryAIResumed'),false);
});
test('difficulty back does not save; confirmation writes while the difficulty screen remains active',()=>{
 const h=harness();h.api.chooseDifficulty(h.instance);const a=h.calls.pushes[0],w={'Change Difficult Delegate':delegate(),BP_OnWidgetDeactivated:delegate()};a.BeforePush.emit(w);a.AfterPush.emit(w);w.BP_OnWidgetDeactivated.emit();h.flush();assert.equal(h.calls.writes.length,0);
 h.api.chooseDifficulty(h.instance);const b=h.calls.pushes[1],v={'Change Difficult Delegate':delegate(),BP_OnWidgetDeactivated:delegate()};b.AfterPush.emit(v);v['Change Difficult Delegate'].emit(2);assert.equal(h.calls.writes.length,1);assert.equal(v.codexRetainOnConfirm,true);v['Change Difficult Delegate'].emit(3);assert.equal(h.calls.launches,1);v.BP_OnWidgetDeactivated.emit();h.flush();assert.equal(h.calls.writes.length,1);
});
test('auto-next commits on a valid launch only and survives returning to selection',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);h.calls.session.autoNext=true;
 h.api.showMenu(h.instance);const selector={};h.calls.pushes[0].BeforePush.emit(selector);h.calls.pushes[0].AfterPush.emit(selector);assert.equal(selector.codexAutoNext,true);assert.equal(h.calls.session.autoNext,true);
 h.api.chooseDifficulty(h.instance);const cancelled={'Change Difficult Delegate':delegate(),BP_OnWidgetDeactivated:delegate(),codexAutoNext:false};h.calls.pushes[1].AfterPush.emit(cancelled);cancelled.BP_OnWidgetDeactivated.emit();assert.equal(h.calls.session.autoNext,true);
 h.api.chooseDifficulty(h.instance);const accepted={'Change Difficult Delegate':delegate(),BP_OnWidgetDeactivated:delegate(),codexAutoNext:false};h.calls.pushes[2].AfterPush.emit(accepted);accepted['Change Difficult Delegate'].emit(4);assert.equal(h.calls.session.autoNext,true);accepted['Change Difficult Delegate'].emit(2);assert.equal(h.calls.session.autoNext,true);h.calls.writes[1].cb('ManualSave3',null,0,true);assert.equal(h.calls.session.autoNext,false);
});
test('a new timed 66 HITS series commits only after its checkpoint succeeds and always uses native Hard',()=>{
 const h=harness();h.api.chooseDifficulty(h.instance);
 const w={'Change Difficult Delegate':delegate(),BP_OnWidgetDeactivated:delegate(),codexTimerMode:'series',codexHits66:true,codexAutoNext:true};h.calls.pushes[0].AfterPush.emit(w);w['Change Difficult Delegate'].emit(2);
 assert.equal(h.calls.session,undefined);assert.equal(h.calls.writes.length,1);assert.equal(JSON.parse(h.calls.writes[0].json).PBZGameSystem.DifficultModeByte,3);
 h.calls.writes[0].cb('ManualSave3',null,0,true);assert.equal(h.calls.session.run.options.hits66,true);assert.equal(h.calls.session.run.options.timer,'series');assert.equal(h.calls.session.difficulty,3);assert.equal(h.calls.session.autoNext,true);
 h.calls.session.run.hits=12;h.api.replay(h.instance,3);h.calls.writes[1].cb('ManualSave3',null,0,true);assert.equal(h.calls.session.run.hits,12);
});
test('a failed launch keeps the current run and auto-next setting intact',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);const previous=h.calls.session.run;previous.hits=12;previous.totalMs=5000;h.calls.session.autoNext=true;
 h.api.chooseDifficulty(h.instance);const w={'Change Difficult Delegate':delegate(),BP_OnWidgetDeactivated:delegate(),codexTimerMode:'series',codexHits66:true,codexAutoNext:false};h.calls.pushes[0].AfterPush.emit(w);w['Change Difficult Delegate'].emit(3);
 assert.equal(h.calls.session.run,previous);assert.equal(h.calls.session.autoNext,true);h.calls.writes[1].cb('ManualSave3',null,0,false);
 assert.equal(h.calls.session.run,previous);assert.equal(h.calls.session.autoNext,true);assert.equal(previous.hits,12);assert.equal(previous.totalMs,5000);assert.equal(h.calls.session.pendingRunOptions,null);assert.equal(h.calls.travel.length,1);
});
test('the 66th-hit native death returns once to Inanis without restarting the exhausted run',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 h.calls.session.run=require('./run-model').create({hits66:true,timer:'series'},h.calls.session.boss.id);h.calls.session.run.phase='failed';h.calls.session.run.hits=66;
 class Death{BP_OnActivated(){}Tick(){}Destruct(){}}h.api.patchDeathMenu(Death);const death=new Death();death.valid=true;death.BP_OnActivated();death.BP_OnActivated();h.flush();
 assert.equal(h.calls.writes.length,2);assert.equal(h.calls.pushes.length,0);assert.equal(h.calls.session.runFailureReturn.requested,true);
 h.calls.writes[1].cb('ManualSave3',null,0,true);assert.equal(h.calls.session.boss.training,true);assert.equal(h.calls.session.run.hits,66);assert.equal(h.calls.session.run.phase,'failed');assert.equal(h.calls.session.prepareOnArrival,false);
 assert.equal(h.api.replay(h.instance,2,{id:'other',profile:{}}),false,'stale retry or next cannot replace a failed run');
 assert.equal(h.calls.writes.length,2);
});
test('a native dismissal after the 66th-hit death retains failure actions until an explicit choice',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 h.calls.session.run=require('./run-model').create({hits66:true},h.calls.session.boss.id);Object.assign(h.calls.session.run,{phase:'failed',hits:66});
 h.api.showMenu(h.instance,'failure');const widget={valid:true,BP_OnWidgetDeactivated:delegate()};h.calls.pushes[0].BeforePush.emit(widget);h.calls.pushes[0].AfterPush.emit(widget);
 widget.BP_OnWidgetDeactivated.emit();h.flush();assert.equal(h.calls.pushes.length,2);const replacement={};h.calls.pushes[1].BeforePush.emit(replacement);assert.equal(replacement.codexScreen,'failure');assert.equal(h.calls.writes.length,1);assert.equal(h.calls.session.run.hits,66);
});

test('missing native death callback uses Dead-tag backstop, preserves gear and shows one refuge recap after loading',()=>{
 let now=0,dead=false;const h=harness({Date:{now:()=>now}});
 h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);h.calls.session.initialized=true;
 const failed=require('./run-model').create({hits66:true,timer:'series'},h.calls.session.boss.id);
 Object.assign(failed,{phase:'failed',hits:66,totalMs:12345,splits:[{boss:'earlier'}]});h.calls.session.run=failed;h.calls.session.runRuntimeError='test avoids unrelated timer engine';
 h.calls.session.boss.label='Boss atteint';h.UE.AbilitySystemBlueprintLibrary={GetAbilitySystemComponent:()=>({HasMatchingGameplayTag:tag=>tag.TagName==='CharacterState.Dead'&&dead})};
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}}h.api.patchGameMode(Mode);const mode=new Mode();mode.valid=true;mode.bindSaveTipExtension();
 const tick=()=>[...h.calls.intervals.values()].forEach(fn=>fn());
 now=5000;tick();h.flush();assert.equal(h.calls.captures.length,0,'a terminal counter alone never transports a living player');
 dead=true;tick();now=7999;tick();h.flush();assert.equal(h.calls.captures.length,0);
 now=8000;tick();h.flush();assert.equal(h.calls.captures.length,1);tick();assert.equal(h.calls.captures.length,1,'one return request while its checkpoint is pending');
 h.calls.captures[0].cb('ManualSave3',null,0,true);h.calls.writes[1].cb('ManualSave3',null,0,true);
 assert.equal(h.calls.session.boss.training,true);assert.equal(h.calls.session.run,failed);assert.equal(h.calls.session.prepareOnArrival,false);
 mode.ReceiveEndPlay();const refuge=new Mode();refuge.valid=true;refuge.bindSaveTipExtension();h.calls.session.arrivalAnchorPending=false;
 tick();assert.equal(h.calls.dialogs.length,0,'no dialog before native loading completion');
 h.instance.OnEndLoadingScreen.emit();tick();tick();assert.equal(h.calls.dialogs.length,1);assert.match(h.calls.dialogs[0].args[1],/DÉFI TERMINÉ/);assert.match(h.calls.dialogs[0].args[2],/Boss atteint/);assert.match(h.calls.dialogs[0].args[2],/Combats remportés : 1/);
 assert.equal(h.calls.pushes.length,0,'no equipment menu covers the ended-run message');assert.equal(h.calls.session.lastRunResult.totalMs,12345);refuge.ReceiveEndPlay();
});

test('a failed challenge waits for an in-flight equipment save and cancels a queued ordinary retry',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}}h.api.patchGameMode(Mode);const mode=new Mode();mode.valid=true;mode.bindSaveTipExtension();
 h.api.captureCheckpoint(mode);class Death{BP_OnActivated(){}Tick(){}Destruct(){}}h.api.patchDeathMenu(Death);const death=new Death();death.valid=true;death.BP_OnActivated();
 Object.assign(h.calls.session.run,{phase:'failed',hits:66});death.BP_OnActivated();
 h.calls.captures[0].cb('ManualSave3',null,0,true);assert.equal(h.calls.writes.length,1,'queued ordinary retry is discarded');
 h.flush();assert.equal(h.calls.captures.length,2);h.calls.captures[1].cb('ManualSave3',null,0,true);h.calls.writes[1].cb('ManualSave3',null,0,true);
 assert.equal(h.calls.session.boss.training,true);assert.equal(h.calls.session.run.hits,66);mode.ReceiveEndPlay();
});

test('a late next-encounter save callback cannot revive a challenge exhausted in a final QTE',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 h.api.replay(h.instance);assert.equal(h.calls.writes.length,2);Object.assign(h.calls.session.run,{phase:'failed',hits:66});
 h.calls.writes[1].cb('ManualSave3',null,0,true);assert.equal(h.calls.travel.length,1);assert.equal(h.calls.session.run.phase,'failed');
 assert.equal(h.api.openTraining(h.instance),true);h.calls.writes[2].cb('ManualSave3',null,0,true);assert.equal(h.calls.session.boss.training,true);assert.equal(h.calls.session.run.hits,66);
});

test('the 66th hit during asynchronous native menu closure cannot revive the pending next encounter',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);h.api.replay(h.instance);
 let open=true;const menu={valid:true,DeactivateWidget(){open=false;}};
 h.UE.PBZBlueprintFunctionLibrary={GetUILayOut:()=>({Layers:{Get:()=>({GetActiveWidget:()=>open?menu:null})}})};h.UE.WidgetBlueprintLibrary={SetFocusToGameViewport(){}};
 h.calls.writes[1].cb('ManualSave3',null,0,true);Object.assign(h.calls.session.run,{phase:'failed',hits:66});h.flush();
 assert.equal(h.calls.session.run.phase,'failed');assert.equal(h.calls.session.run.hits,66);assert.equal(h.calls.travel.length,1);
 assert.equal(h.api.openTraining(h.instance),true);h.calls.writes[2].cb('ManualSave3',null,0,true);assert.equal(h.calls.session.boss.training,true);
});

test('an asynchronous failed return checkpoint retries once successfully without resetting the exhausted run',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);Object.assign(h.calls.session.run,{phase:'failed',hits:66});
 class Death{BP_OnActivated(){}Tick(){}Destruct(){}}h.api.patchDeathMenu(Death);const death=new Death();death.valid=true;death.BP_OnActivated();h.flush();
 h.calls.writes[1].cb('ManualSave3',null,0,false);assert.equal(h.calls.session.runFailureReturn.requested,false);assert.equal(h.calls.dialogs.length,0);
 death.BP_OnActivated();h.flush();h.flush();assert.equal(h.calls.writes.length,3);h.calls.writes[2].cb('ManualSave3',null,0,true);
 assert.equal(h.calls.session.boss.training,true);assert.equal(h.calls.session.run.hits,66);assert.equal(h.calls.session.runFailureReturn.returnAttempts,2);assert.equal(h.calls.session.runFailureReturn.inFlight,false);assert.equal(h.calls.session.runFailureReturn.returned,true);
});

test('failed automatic return stops after three attempts and exposes manual recovery instead of looping',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);Object.assign(h.calls.session.run,{phase:'failed',hits:66});
 class Death{BP_OnActivated(){}Tick(){}Destruct(){}}h.api.patchDeathMenu(Death);const death=new Death();death.valid=true;death.BP_OnActivated();h.flush();
 for(let i=1;i<=3;i++){assert.equal(h.calls.writes.length,i+1);h.calls.writes[i].cb('ManualSave3',null,0,false);if(i<3){h.flush();h.flush();}}
 assert.equal(h.calls.session.runFailureReturn.error,true);assert.equal(h.calls.session.runFailureReturn.returnAttempts,3);assert.equal(h.calls.dialogs.length,1);assert.match(h.calls.dialogs[0].args[2],/trois tentatives.*F8/s);
 death.BP_OnActivated();h.flush();assert.equal(h.calls.writes.length,4);assert.equal(h.calls.session.run.phase,'failed');
 assert.equal(h.api.openTraining(h.instance),true);h.calls.writes[4].cb('ManualSave3',null,0,true);assert.equal(h.calls.session.boss.training,true);assert.equal(h.calls.session.run.hits,66);
});

test('a deliberately new run invalidates a scheduled failed-return retry',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);Object.assign(h.calls.session.run,{phase:'failed',hits:66});
 class Death{BP_OnActivated(){}Tick(){}Destruct(){}}h.api.patchDeathMenu(Death);const death=new Death();death.valid=true;death.BP_OnActivated();h.flush();h.calls.writes[1].cb('ManualSave3',null,0,false);
 h.api.chooseDifficulty(h.instance);const widget={'Change Difficult Delegate':delegate(),BP_OnWidgetDeactivated:delegate(),codexHits66:true,codexTimerMode:'series',codexAutoNext:true};h.calls.pushes[0].AfterPush.emit(widget);widget['Change Difficult Delegate'].emit(2);h.calls.writes[2].cb('ManualSave3',null,0,true);
 assert.equal(h.calls.session.run.hits,0);assert.equal(h.calls.session.run.phase,'waiting');assert.equal(h.calls.session.runFailureReturn,undefined);h.flush();h.flush();assert.equal(h.calls.writes.length,3);assert.equal(h.calls.session.boss.training,undefined);
});

test('synchronous native write errors are claimed by the same bounded return attempt',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);Object.assign(h.calls.session.run,{phase:'failed',hits:66});
 h.UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem=()=>({ReplaceSaveString(){throw Error('native save temporarily unavailable');}});
 class Death{BP_OnActivated(){}Tick(){}Destruct(){}}h.api.patchDeathMenu(Death);const death=new Death();death.valid=true;death.BP_OnActivated();h.flush();
 assert.equal(h.calls.session.runFailureReturn.returnAttempts,1);assert.equal(h.calls.session.runFailureReturn.inFlight,false);assert.equal(h.calls.session.runFailureReturn.requested,false);assert.equal(h.calls.dialogs.length,0);
 h.flush();h.flush();h.flush();h.flush();assert.equal(h.calls.session.runFailureReturn.returnAttempts,3);assert.equal(h.calls.session.runFailureReturn.error,true);assert.equal(h.calls.dialogs.length,1);
});
test('death captures fresh gear before resetting encounter; native death stays untouched outside lab',()=>{
 const h=harness();class Death{BP_OnActivated(){h.calls.original.push('death');}Tick(){}Destruct(){}}
 h.api.patchDeathMenu(Death);new Death().BP_OnActivated();assert.equal(h.calls.original.length,1);
 h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}}h.api.patchGameMode(Mode);const m=new Mode();m.valid=true;m.bindSaveTipExtension();
 h.calls.nextGear.Inventory.CurrentMainWeaponID='NewLoadout';
 const d=new Death();d.valid=true;d.BP_OnActivated();assert.equal(h.calls.captures.length,1);assert.equal(h.calls.writes.length,1);
 const fresh=structuredClone(pristine);fresh.Inventory.CurrentMainWeaponID='NewLoadout';h.calls.captures[0].cb('ManualSave3',fresh,0,true);
 assert.equal(JSON.parse(h.calls.writes[1].json).Inventory.CurrentMainWeaponID,'NewLoadout');assert.equal(h.calls.original.length,1);m.ReceiveEndPlay();assert.equal(h.calls.intervals.size,0);
});
function arsenalHarness(fail=false){
 const map=entries=>Object.assign(new Map(entries),{Get(id){return this.get(id);},Remove(id){this.delete(id);}});
 const pack={MainWeaponInfos:map([['W',{WeaponLevel:1}]]),ShaqiWeaponInfos:map([['E',{ShaChiWeaponLevel:2}]]),Accessories:map([['A',{CurrentLevel:0}]]),MedicineInfos:map([['M',{CurrentLevel:0}]]),GetAllWeaponsByDataTable(){if(fail)throw Error('native failure');},PushMedicineToInventory(){},GetMainWeaponTableData:()=>({WeaponName:{Key:'weapon'},RenderIcon:'render',White:'white'}),GetShaqiWeaponTableData:()=>({WeaponName:{Key:'edge'},RenderIcon:'render',WhiteIcon:'white'}),GetWeaponMaxLevel:()=>60,UpgradeWeapon(id,main,n){const m=main?this.MainWeaponInfos:this.ShaqiWeaponInfos,k=main?'WeaponLevel':'ShaChiWeaponLevel';m.Get(id)[k]+=n;},SnapSoulWeapon(id,main){(main?this.MainWeaponInfos:this.ShaqiWeaponInfos).Get(id).forged=true;(main?this.MainWeaponInfos:this.ShaqiWeaponInfos).Get(id).bAlreadySnapSoul=true;},GetAccessoryMaxRefineLevel:()=>12,UpgradeAccessory(id,n){this.Accessories.Get(id).CurrentLevel+=n;},GetMedicineMaxLevel:()=>6,UpgradeMedicine(id,n){this.MedicineInfos.Get(id).CurrentLevel+=n;},RestoreQuickItems(){}};
 const cycles=[],system={GetCycleCount:()=>0,SetCycleCount:c=>cycles.push(c)};
 const UE={SubsystemBlueprintLibrary:{GetWorldSubsystem:(_,type)=>type===1?pack:system},PBZBackPackSubsystem:{StaticClass:()=>1},PBZGameSystem:{StaticClass:()=>2},KismetSystemLibrary:{ExecuteConsoleCommand(){},IsValidSoftObjectReference:x=>!!x,Conv_SoftObjectReferenceToString:x=>x},KismetTextLibrary:{Conv_TextToString:x=>x},PBZBlueprintFunctionLibrary:{MakeTextByKey:x=>x},DataTable:{Load:()=>({})},NewArray:()=>[],DataTableFunctionLibrary:{GetDataTableRowNames:(_,r)=>r.value={Num:()=>0}}};const exports={};
 vm.runInNewContext(fs.readFileSync(__dirname+'/arsenal.js','utf8'),{exports,require:n=>n==='ue'?UE:n==='./acquisition'?{collect:()=>({main:{W:[{map:'Campaign'}]},edges:{E:[{map:'Campaign'}]}})}:{$ref:value=>({value}),$unref:r=>r.value}});return {api:exports,pack,cycles};
}
test('arsenal uses native limits and forging, then restores encounter cycle',()=>{
 const h=arsenalHarness();const counts=h.api.initialize({});assert.equal(counts.missed,0);assert.equal(h.pack.MainWeaponInfos.Get('W').WeaponLevel,30);assert.equal(h.pack.ShaqiWeaponInfos.Get('E').forged,true);assert.equal(h.pack.Accessories.Get('A').CurrentLevel,12);assert.deepEqual(h.cycles,[0]);
});
test('native arsenal error always restores encounter cycle',()=>{const h=arsenalHarness(true);assert.throws(()=>h.api.initialize({}));assert.deepEqual(h.cycles,[0]);});

test('weapon admission follows possible campaign acquisition, not art or player ownership',()=>{
 const h=arsenalHarness();const possible={main:{NeverCollected:[{map:'SecretReward'}]},edges:{SecretEdge:[{map:'SecretMap'}]}};
 assert.equal(h.api.describeWeapon(h.pack,'NeverCollected',true,possible).accepted,true);
 assert.equal(h.api.describeWeapon(h.pack,'SecretEdge',false,possible).accepted,true);
 assert.equal(h.api.describeWeapon(h.pack,'Unobtainable',true,possible).reason,'no-campaign-acquisition');
 for(const id of ['WoodenSword','TangPrologue','HeiMoShangPrologue','Tang_HorseCartCombat'])assert.equal(h.api.describeWeapon(h.pack,id,true,possible).accepted,false);
});
test('prologue auto-close is scoped to the exact question in the lab difficulty flow',()=>{
 const h=harness();let closes=0;class Confirm{constructor(){this.valid=true;}OnDialogSetup(){}BP_OnActivated(){}SetRenderOpacity(){}CloseWindowByConfirmation(){closes++;}}
 h.api.patchConfirmation(Confirm);const outside=new Confirm();outside.OnDialogSetup({Body:'skip-prologue'});outside.BP_OnActivated();h.flush();assert.equal(closes,0);
 h.api.chooseDifficulty(h.instance);const unrelated=new Confirm();unrelated.OnDialogSetup({Body:'quit game?'});unrelated.BP_OnActivated();h.flush();assert.equal(closes,0);
 const prologue=new Confirm();prologue.OnDialogSetup({Body:'skip-prologue'});prologue.BP_OnActivated();h.flush();assert.equal(closes,1);
});

test('death during equipment capture waits for fresh gear and queues one retry',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}}h.api.patchGameMode(Mode);const m=new Mode();m.valid=true;m.bindSaveTipExtension();
 h.calls.nextGear.Inventory.CurrentMainWeaponID='Latest';
 h.api.captureCheckpoint(h.instance);
 class Death{BP_OnActivated(){}Tick(){}Destruct(){}}h.api.patchDeathMenu(Death);const d=new Death();d.valid=true;d.BP_OnActivated();d.BP_OnActivated();assert.equal(h.calls.captures.length,1);
 const current=structuredClone(pristine);current.Inventory.CurrentMainWeaponID='Latest';h.calls.captures[0].cb('ManualSave3',current,0,true);
 assert.equal(h.calls.writes.length,2);assert.equal(JSON.parse(h.calls.writes[1].json).Inventory.CurrentMainWeaponID,'Latest');m.ReceiveEndPlay();
});

test('global collection source includes secret maps, ignores test map and never reads player acquisitions',()=>{
 const arr=ids=>({Num:()=>ids.length,GetRef:i=>({WeaponID:ids[i]})});
 const items={XiGu:{WeaponItemDatas:arr(['Normal']),ShaChiWeaponItemDatas:arr(['NormalEdge'])},Secret:{WeaponItemDatas:arr(['NeverCollected']),ShaChiWeaponItemDatas:arr(['SecretEdge'])},Test:{WeaponItemDatas:arr(['Prototype']),ShaChiWeaponItemDatas:arr(['DebugEdge'])}};
 const names=Object.keys(items), map={GetMaxIndex:()=>names.length,IsValidIndex:()=>true,GetKey:i=>names[i],GetRef:k=>items[k]};const exports={};
 vm.runInNewContext(fs.readFileSync(__dirname+'/acquisition.js','utf8'),{exports,require:n=>n==='./campaign-proof'?{source:'native-policy',activeMaps:{XiGu:1,Secret:1},initialMain:{Tang:[{policy:'native-start'}]},initialEdges:{}}:({getPlayerMapItemDataAsset:()=>({MapItemDatas:map})})});
 const r=exports.collect({});assert.deepEqual(Object.keys(r.main),['Tang','Normal','NeverCollected']);assert.deepEqual(Object.keys(r.edges),['NormalEdge','SecretEdge']);assert.deepEqual([...r.excludedMaps],['Test']);
});

test('results wait for the terminal phase and duplicate native kill signals open one screen',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 h.calls.onVictory(h.instance,{row:'FinalBoss',path:'phase1'});assert.equal(h.calls.session.completed,false);
 h.calls.onVictory(h.instance,{row:'FinalBoss',path:'phase2'});h.calls.onVictory(h.instance,{row:'FinalBoss',path:'phase2'});h.flush();
 assert.equal(h.calls.pushes.length,1);const w={};h.calls.pushes[0].BeforePush.emit(w);assert.equal(w.codexScreen,'victory');
});
test('an authoritative native completion tag accepts the aggregate codex row',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);h.calls.session.boss.unlockTag='native.final-completion';
 h.calls.onVictory(h.instance,{row:'FinalBoss',path:'phase1'});h.flush();assert.equal(h.calls.pushes.length,1);
});
test('opening selection cancels the pending victory transition',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 h.calls.onVictory(h.instance,{row:'FinalBoss',path:'phase2'});h.api.showMenu(h.instance);h.calls.pushes[0].AfterPush.emit({});h.flush();assert.equal(h.calls.pushes.length,1);assert.equal(h.calls.writes.length,1);
});
test('equipment is prepared separately and the native system host captures it on close',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);h.calls.session.initialized=true;
 let initialized=null;h.UE.GameplayStatics.GetPlayerCharacter=()=>({valid:true,K2_GetActorLocation:()=>({X:0,Y:0,Z:62152}),BeforePushSystemV1:(widget,touchpad)=>{initialized={widget,touchpad};}});
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}}h.api.patchGameMode(Mode);const m=new Mode();m.valid=true;m.bindSaveTipExtension();
 const tick=[...h.calls.intervals.values()][0];for(let i=0;i<95;i++)tick();
 assert.equal(h.calls.pushes.length,0,'direct combat does not reopen equipment at arrival');
 h.calls.session.boss.training=true;h.api.openTraining(h.instance);
 assert.equal(h.calls.pushes.length,1);const widget={valid:true,BP_OnWidgetDeactivated:delegate()};h.calls.pushes[0].BeforePush.emit(widget);assert.deepEqual(initialized,{widget,touchpad:false});
 h.calls.paused=true;h.calls.pushes[0].AfterPush.emit(widget);assert.deepEqual(h.calls.pauses,[],'the native host owns pause');
 h.calls.paused=false;widget.BP_OnWidgetDeactivated.emit();widget.BP_OnWidgetDeactivated.emit();assert.equal(h.calls.captures.length,1);assert.deepEqual(h.calls.pauses,[]);m.ReceiveEndPlay();
});
test('lab encounters do not start the native platform achievement progression listener',()=>{
 const h=harness();let calls=0;class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}startAchievementProgression(){calls++;}}
 h.api.patchGameMode(Mode);new Mode().startAchievementProgression();assert.equal(calls,1);
 h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);new Mode().startAchievementProgression();assert.equal(calls,1);
});

test('returning from training to a title screen reloads the refuge before opening inventory',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}}h.api.patchGameMode(Mode);const mode=new Mode();mode.valid=true;mode.bindSaveTipExtension();
 h.calls.session.boss.training=true;h.UE.GameplayStatics.GetPlayerCharacter=()=>null;
 h.api.openTraining(h.instance);assert.equal(h.calls.pushes.length,0);assert.equal(h.calls.writes.length,2);assert.equal(h.calls.captures.length,0);mode.ReceiveEndPlay();
});

test('training equipment waits for the native loading screen to end before pausing the world',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 h.calls.session.initialized=true;h.calls.session.boss.training=true;h.calls.session.prepareOnArrival=true;
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}}h.api.patchGameMode(Mode);const mode=new Mode();mode.valid=true;mode.bindSaveTipExtension();
 const tick=[...h.calls.intervals.values()][0];for(let i=0;i<100;i++)tick();
 assert.equal(h.calls.pushes.length,0,'a stable pawn does not prove that the loading screen has ended');
 h.instance.OnEndLoadingScreen.emit();tick();assert.equal(h.calls.pushes.length,1);tick();assert.equal(h.calls.pushes.length,1);
 mode.ReceiveEndPlay();
});

test('the in-combat selector pauses safely while the main-menu selector leaves world pause untouched',()=>{
 const h=harness();h.api.showMenu(h.instance);const menu={valid:true,BP_OnWidgetDeactivated:delegate()};h.calls.pushes[0].AfterPush.emit(menu);assert.equal(h.calls.pauses.length,0);
 h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}}h.api.patchGameMode(Mode);const mode=new Mode();mode.valid=true;mode.bindSaveTipExtension();
 h.api.showMenu(h.instance);const selector={valid:true,BP_OnWidgetDeactivated:delegate()};h.calls.pushes[1].AfterPush.emit(selector);assert.equal(h.calls.paused,true);
 selector.BP_OnWidgetDeactivated.emit();h.flush();assert.equal(h.calls.paused,false);assert.deepEqual(h.calls.pauses,[true,false]);mode.ReceiveEndPlay();
});

test('selector and difficulty keep a shared pause across CommonUI deactivation and Back',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}}h.api.patchGameMode(Mode);const mode=new Mode();mode.valid=true;mode.bindSaveTipExtension();
 const makeWidget=()=>({valid:true,active:true,BP_OnWidgetActivated:delegate(),BP_OnWidgetDeactivated:delegate(),IsActivated(){return this.active;}});
 h.api.showMenu(h.instance);const selector=makeWidget();h.calls.pushes[0].AfterPush.emit(selector);
 h.api.chooseDifficulty(h.instance);selector.active=false;selector.BP_OnWidgetDeactivated.emit();h.flush();assert.equal(h.calls.paused,true,'the asynchronous difficulty push retains pause');
 const difficulty=Object.assign(makeWidget(),{'Change Difficult Delegate':delegate()});h.calls.pushes[1].AfterPush.emit(difficulty);h.calls.paused=false; // Native widget may alter pause during activation.
 selector.active=true;selector.BP_OnWidgetActivated.emit();difficulty.active=false;difficulty.BP_OnWidgetDeactivated.emit();h.flush();assert.equal(h.calls.paused,true,'Back returns to a paused selector');
 selector.active=false;selector.BP_OnWidgetDeactivated.emit();h.flush();assert.equal(h.calls.paused,false);mode.ReceiveEndPlay();
});

test('closing mod menus preserves a pause owned by another native screen',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}}h.api.patchGameMode(Mode);const mode=new Mode();mode.valid=true;mode.bindSaveTipExtension();
 h.calls.paused=true;h.api.showMenu(h.instance);const widget={valid:true,BP_OnWidgetDeactivated:delegate()};h.calls.pushes[0].AfterPush.emit(widget);widget.BP_OnWidgetDeactivated.emit();h.flush();assert.equal(h.calls.paused,true);mode.ReceiveEndPlay();
});



test('old world wrappers are released only after destination validation and before native OpenLevel',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 const s=h.calls.session,widget={valid:true,codexSelectBoss(){},DeactivateWidget:()=>assert.fail('native handoff must remain intact')};
 s.selectorWidget=widget;s.directArrival={controller:{},action:{}};s.introPresentation={widget:{}};s.launchUI={widget};s.entranceOwner={};s.inanisInteraction={};
 class Mode{bindSaveTipExtension(){}ReceiveEndPlay(){}}h.api.patchGameMode(Mode);const mode=new Mode();mode.valid=true;mode.bindSaveTipExtension();
 const load=h.instance.LoadGame;h.instance.LoadGame=(...args)=>{assert.equal(s.selectorWidget,widget,'read/validate keeps current-world recovery available');return load(...args);};
 let opened=false;h.UE.GameplayStatics.OpenLevel=()=>{opened=true;assert.equal(h.calls.intervals.size,0);for(const key of ['selectorWidget','directArrival','introPresentation','launchUI','entranceOwner','inanisInteraction'])assert.equal(s[key],null,key);assert.equal(widget.codexSelectBoss(),false);};
 h.api.replay(h.instance);assert.equal(s.selectorWidget,widget,'save callbacks remain valid until commit');h.calls.captures.at(-1).cb('ManualSave3',null,0,true);h.calls.writes.at(-1).cb('ManualSave3',null,0,true);assert.equal(opened,true);assert(h.calls.worldRefDrops>=2);
});
test('failed destination validation preserves current-world references for recovery',()=>{
 const options={},h=harness(options);h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 const s=h.calls.session,widget={valid:true,codexSelectBoss(){}};s.selectorWidget=widget;s.directArrival={controller:{}};s.launchUI={widget};const drops=h.calls.worldRefDrops;
 options.loadFails=true;h.api.replay(h.instance);h.calls.writes.at(-1).cb('ManualSave3',null,0,true);
 assert.equal(s.selectorWidget,widget);assert(s.directArrival.controller);assert.equal(s.launchUI.widget,widget);assert.equal(h.calls.worldRefDrops,drops);assert.equal(h.calls.travel.length,1);
});




test('a committed new encounter clears previous native entrance instance claims',()=>{
 const h=harness();h.api.replay(h.instance,2);h.calls.writes[0].cb('ManualSave3',null,0,true);
 h.calls.session.entranceSignalSent=true;h.calls.session.entranceSignalInstances=['OldMap:OldGraph:OldFlow'];
 h.calls.session.ux.nativeEntranceSignalInstances=['OldMap:OldGraph:OldFlow'];h.calls.session.ux.entranceInstanceDispatchLimit=true;
 h.calls.session.ux.nativeEntryPoseCommitted=true;h.calls.session.ux.nativeEntryPoseCommitError='old encounter';
 h.api.replay(h.instance,2);h.calls.writes[1].cb('ManualSave3',null,0,true);
 assert.equal(h.calls.session.entranceSignalSent,false);assert.deepEqual(Array.from(h.calls.session.entranceSignalInstances),[]);
 assert.equal(h.calls.session.ux.nativeEntranceSignalInstances,undefined);assert.equal(h.calls.session.ux.entranceInstanceDispatchLimit,undefined);
 assert.equal(h.calls.session.ux.nativeEntryPoseCommitted,undefined);assert.equal(h.calls.session.ux.nativeEntryPoseCommitError,undefined);
});
