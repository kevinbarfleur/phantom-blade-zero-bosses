const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('the sanctuary removes its portal and bell, disables NPC interactions and preserves scenery',()=>{
 const center={X:-150789.97,Y:-12888.51,Z:5000729};
 const actor=name=>({GetName:()=>name,GetClass:()=>name,K2_GetActorLocation:()=>center,SetActorEnableCollision(v){this.collision=v;},SetActorHiddenInGame(v){this.hidden=v;},InteractSphere:{SetGenerateOverlapEvents(v){this.overlaps=v;}},Widget:{SetVisibility(v){this.visible=v;}}});
 const portal=actor('BP_FlowInteractActor_C_1586733046'),bell=actor('BP_MelodiousBell_C_0'),npc=actor('BP_NPC_XuKong_C_0'),scenery=actor('SM_BlueFlower_0'),far=actor('BP_MelodiousBell_C_1');
 far.K2_GetActorLocation=()=>({X:0,Y:0,Z:0});const actors=[portal,bell,npc,scenery,far];
 const UE={Actor:{StaticClass:()=>1},NewArray:()=>({Num:()=>actors.length,Get:i=>actors[i]}),GameplayStatics:{GetPlayerCharacter:()=>({K2_GetActorLocation:()=>center}),GetAllActorsOfClass(){}},KismetSystemLibrary:{GetPathName:x=>x}};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/training.js','utf8'),{exports,require:n=>n==='ue'?UE:n==='./inanis'?{tick(){}}:{$ref:v=>({value:v}),$unref:r=>r.value}});
 const session={boss:{training:true},arrivalAnchorPending:false};exports.tick({},session);
 assert.equal(portal.hidden,true);assert.equal(portal.collision,false);assert.equal(bell.hidden,true);
 assert.equal(npc.collision,false);assert.equal(npc.hidden,undefined);assert.equal(scenery.hidden,undefined);
 assert.equal(npc.InteractSphere.overlaps,false);assert.equal(portal.InteractSphere.overlaps,false);assert.equal(scenery.InteractSphere.overlaps,undefined);
 assert.equal(scenery.collision,undefined);assert.equal(far.hidden,undefined);
 assert.equal(session.ux.trainingHiddenActors,2);assert.equal(session.ux.trainingDisabledActors,3);
});
test('campaign teleport keeps its native behavior outside training',()=>{
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/training.js','utf8'),{exports,require:n=>({})});
 let training=false,native=0,menu=0;class T{TeleportToBellFromJhsy(){native++;return true;}}
 exports.patchTeleport(T,()=>training,()=>menu++);const t=new T();
 assert.equal(t.TeleportToBellFromJhsy(),true);training=true;assert.equal(t.TeleportToBellFromJhsy(),false);
 assert.equal(native,1);assert.equal(menu,1);
});

test('disabling NPC dialogue preserves the spawner overlap that keeps Inanis visible',()=>{
 const center={X:-147150,Y:-12900.74,Z:5000830};
 const npc={GetName:()=> 'BP_NPCSpawner_C_2031038963',GetClass:()=> 'BP_NPCSpawner_C',K2_GetActorLocation:()=>center,SetActorEnableCollision(){throw Error('Must preserve NPC spawn collision');},InteractSphere:{SetGenerateOverlapEvents(v){this.overlap=v;}},SpawnSphere:{SetGenerateOverlapEvents(){throw Error('Must preserve spawn overlap');}}};
 const UE={Actor:{StaticClass:()=>1},NewArray:()=>({Num:()=>1,Get:()=>npc}),GameplayStatics:{GetPlayerCharacter:()=>({K2_GetActorLocation:()=>center}),GetAllActorsOfClass(){}},KismetSystemLibrary:{GetPathName:x=>x}};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/training.js','utf8'),{exports,require:n=>n==='ue'?UE:n==='./inanis'?{tick(){}}:{$ref:v=>({value:v}),$unref:r=>r.value}});
 exports.tick({},{boss:{training:true},arrivalAnchorPending:false});assert.equal(npc.InteractSphere.overlap,false);
});

test('independently spawned doorway effects are hidden without changing the blue flower or player collision',()=>{
 const center={X:-150789.97,Y:-12888.51,Z:5000729},list=values=>({Num:()=>values.length,Get:i=>values[i]});
 const fx=asset=>({GetAsset:()=>asset,SetVisibility(v){this.visible=v;},SetHiddenInGame(v){this.hidden=v;},DeactivateImmediate(){this.stopped=true;}});
 const doorway=fx('/Game/Test/liuzheng/MCHJ/NS_MCHJ_MagicDoor_JHSY.NS_MCHJ_MagicDoor_JHSY'),flower=fx('/Game/Flowers/NS_Flower_JHSY.NS_Flower_JHSY');
 const owner={GetName:()=> 'NiagaraActor_0',GetClass:()=> 'NiagaraActor',K2_GetActorLocation:()=>center,GetComponentsByClass:()=>list([doorway,flower])};
 const UE={Actor:{StaticClass:()=>1},NiagaraComponent:{StaticClass:()=>2},NewArray:()=>list([owner]),GameplayStatics:{GetPlayerCharacter:()=>({K2_GetActorLocation:()=>center}),GetAllActorsOfClass(){}},KismetSystemLibrary:{GetPathName:x=>x}};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/training.js','utf8'),{exports,require:n=>n==='ue'?UE:n==='./inanis'?{tick(){}}:{$ref:v=>({value:v}),$unref:r=>r.value}});
 const session={boss:{training:true},arrivalAnchorPending:false};exports.tick({},session);
 assert.equal(doorway.hidden,true);assert.equal(doorway.stopped,true);assert.equal(flower.hidden,undefined);assert.equal(session.ux.trainingHiddenEffects,1);
});
