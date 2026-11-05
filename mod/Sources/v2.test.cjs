const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const model = require('./model');
const pristine = {PBZGameSystem:{CurrentLevelName:'PBZ_Duanhun_WP',LastSaveActorID:'Bell_DH_007',CycleCount:0,PlayerTransform:{Location:{X:0,Y:0,Z:62152}}},BellManager:{SaveBellID:'Bell_DH_007',ActivateBellIDs:[]},AISystem:{SpawnerSaveData:{}},BossRecord:{earlier:1},EventPipeline:{trigger:0},Player:{RemainingDays:65},Inventory:{CurrentMapID:'Duanhun',MainWeaponInfos:{Tang:{WeaponLevel:30}},CurrentMainWeaponID:'Tang',MedicineInfos:{Hulu:{CurrentTime:0,MaxTime:4}}}};
function delegate(){const handlers=new Set();return {Add:h=>handlers.add(h),Remove:h=>handlers.delete(h),emit:(...a)=>[...handlers].forEach(h=>h(...a))};}
function harness(options={}) {
 const calls={writes:[],captures:[],loads:[],travel:[],dialogs:[],pushes:[],intervals:new Map(),timeouts:new Map(),original:[],pauses:[],nextGear:structuredClone(pristine)};let serial=0,gearRequest=false;
 const instance={valid:true,OnEndLoadingScreen:delegate(),LoadGame(slot,ref){calls.loads.push(slot);ref.value={ResultType:options.loadFails?0:1,LevelName:options.level||'PBZ_Duanhun_WP',GameModeOptions:'test'};},SetLoadingScreen(){}};
 const save={ReplaceSaveString(param,cb,json){(gearRequest?calls.captures:calls.writes).push({param,cb,json});gearRequest=false;return {ResultType:options.writeFails?0:1};},SaveObjectData(){},ForceSave(){throw Error('Full-world save must not be used');}};
 const UE={EDifficultMode:{Easy:1,Handicapped:0,Normal:2,Hard:3,NightMare:4},JsonObjectWrapper:class{},KismetTextLibrary:{Conv_TextToString:x=>x},KismetSystemLibrary:{IsValid:x=>!!x?.valid,MakeSoftClassPath:x=>x,Conv_SoftClassPathToSoftClassRef:x=>x},SubsystemBlueprintLibrary:{GetGameInstanceSubsystem:()=>save},PBZSaveLoadSubsystem:{StaticClass:()=>0},SaveGameParam:class{},LoadGameResultParam:class{},GameplayTag:class{},Key:class{},ESaveLoadResultType:{Success:1,Failed:0},ESlateVisibility:{Collapsed:8},ECommonMessagingResult:{Confirmed:1},GameplayStatics:{GetGameInstance:()=>instance,GetPlayerController:()=>({valid:true,IsInputKeyDown:()=>false}),GetPlayerCharacter:()=>({valid:true,K2_GetActorLocation:()=>({X:0,Y:0,Z:62152})}),IsGamePaused:()=>calls.paused||false,SetGamePaused:(_,value)=>{calls.paused=value;calls.pauses.push(value);},OpenLevel:(...a)=>calls.travel.push(a)},JSONUtility:{ParseStringToJson(str,ok,out){ok.value=true;out.value=JSON.parse(str);},JsonToString(json,ok,str){ok.value=true;str.value=JSON.stringify(json);}},AsyncAction_ShowConfirmation:{},AsyncAction_PushContentToLayerForPlayer:{PushContentToLayerForPlayer(){const a={BeforePush:delegate(),AfterPush:delegate(),Activate(){}};calls.pushes.push(a);return a;}}};
 for(const kind of ['ShowConfirmationYesNo','ShowConfirmationOk'])UE.AsyncAction_ShowConfirmation[kind]=(...args)=>{const a={args,OnResult:delegate(),Activate(){}};calls.dialogs.push(a);return a;};
 const runDriver={};vm.runInNewContext(fs.readFileSync(__dirname+'/run-driver.js','utf8'),{exports:runDriver,require:n=>({'ue':UE,'puerts':{$ref:value=>({value}),$unref:r=>r.value},'./run-model':require('./run-model'),'./run-hud':{stop(){},update(){}},'./cinema':{pending:()=>false}}[n])});
 const exports={};
 vm.runInNewContext(fs.readFileSync(__dirname+'/runtime-v2.js','utf8'),{exports,console:{log(){}},JSON,String,Error,setTimeout:fn=>{const id=++serial;calls.timeouts.set(id,fn);return id;},clearTimeout:id=>calls.timeouts.delete(id),setInterval:fn=>{const id=++serial;calls.intervals.set(id,fn);return id;},clearInterval:id=>calls.intervals.delete(id),require(name){if(name==='./run-driver')return runDriver;return {'ue':UE,'cpp':{FText:{FromString:x=>x}},'puerts':{$ref:value=>({value}),$unref:r=>r.value,toDelegate:(_,h)=>h},'./snapshot':pristine,'./validation':{tick(){}},'./battle':{install(session,onVictory){calls.session=session;calls.onVictory=onVictory;},patchRecorder(){}},'./hold':{configure(){},beginLaunch(widget){widget.codexRetainOnConfirm=true;calls.launches=(calls.launches||0)+1;},endLaunch(){}},'./cinema':{tick:()=>false},'./selector':{bosses:[{id:'BP_Monster_ZuoShang_Ending',profile:{},classes:['phase1','phase2'],members:['FinalBoss']}]},'../Library/UIHelper':{default:{GetTextByID:()=> 'skip-prologue'}},'./gear':{capture(){gearRequest=true;return structuredClone(calls.nextGear);}},'./arrival':{begin(){},tick(){},release(){}},'./training':{destination:{id:'Codex_Training',training:true,members:[],classes:[],map:'Duanhun',profile:{level:'PBZ_Duanhun_WP',bell:'Bell_DH_007',transform:pristine.PBZGameSystem.PlayerTransform,camera:{},clearActors:[],clearTags:[],nodeIDs:[]}},tick(){}},'./inanis':{configure(){}},'./arena':{tick(){}},'./model':model,'./arsenal':{initialize:()=>({weapons:30,edges:25,accessories:40,medicines:15})}}[name]||(()=>{throw Error(name)})();}});
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
test('travel waits for write; duplicate and late callbacks do not load twice',()=>{
 const h=harness();h.api.replay(h.instance,2);assert.equal(h.api.replay(h.instance),false);const w=h.calls.writes[0];assert.equal(h.calls.travel.length,0);
 w.cb('wrong',null,0,true);assert.equal(h.calls.travel.length,0);w.cb('ManualSave3',null,0,true);w.cb('ManualSave3',null,0,true);assert.equal(h.calls.travel.length,1);
 h.api.replay(h.instance,3);w.cb('ManualSave3',null,0,true);assert.equal(h.calls.travel.length,1);assert.equal(h.calls.writes[1].param.SaveSlotName,'ManualSave3');
});
test('save/read failure and unexpected map fail before world travel',()=>{
 for(const opts of [{writeFails:true},{loadFails:true},{level:'Wrong'}]){const h=harness(opts);h.api.replay(h.instance);if(!opts.writeFails)h.calls.writes[0].cb('ManualSave3',null,0,true);else h.flush();assert.equal(h.calls.travel.length,0);assert.equal(h.calls.dialogs.length,1);}
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
test('the 66th-hit death opens failure actions once and cannot silently auto-retry',()=>{
 const h=harness();h.api.replay(h.instance);h.calls.writes[0].cb('ManualSave3',null,0,true);
 h.calls.session.run=require('./run-model').create({hits66:true,timer:'series'},h.calls.session.boss.id);h.calls.session.run.phase='failed';h.calls.session.run.hits=66;
 class Death{BP_OnActivated(){}Tick(){}Destruct(){}}h.api.patchDeathMenu(Death);const death=new Death();death.valid=true;death.BP_OnActivated();death.BP_OnActivated();h.flush();
 assert.equal(h.calls.writes.length,1);assert.equal(h.calls.pushes.length,1);const menu={};h.calls.pushes[0].BeforePush.emit(menu);assert.equal(menu.codexScreen,'failure');assert.match(menu.codexRunSummary,/66 \/ 66/);
 menu.DeactivateWidget=()=>{};menu.codexSelectBoss({action:'restart-run'},menu);h.flush();assert.equal(h.calls.writes.length,2);h.calls.writes[1].cb('ManualSave3',null,0,true);assert.equal(h.calls.session.run.hits,0);assert.equal(h.calls.session.run.totalMs,0);
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
