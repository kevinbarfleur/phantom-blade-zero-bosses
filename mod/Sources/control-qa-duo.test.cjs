const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(mode='flow'){
 const calls=[],named=name=>({GetName:()=>name}),pos={X:1,Y:2,Z:3},rot={Pitch:0,Yaw:248,Roll:0};
 const pawn={...named('native-pawn'),bHidden:false,GetClass:()=>'/NativeClass',K2_GetActorLocation:()=>pos,K2_GetActorRotation:()=>rot};
 const group={...named('MobGroup_2'),IsActivating:true};
 const aliases={'Yuu_Seq046-1':{...named('Yuu-spawner'),MobGroup:group,GetPawn:()=>pawn},'TieGui_Seq046-1':{...named('TieGui-spawner'),MobGroup:group,GetPawn:()=>({...pawn,GetName:()=> 'TieGui-pawn'})}};
 const controller={GetControlRotation:()=>rot,PlayerCameraManager:{GetCameraLocation:()=>pos,GetCameraRotation:()=>rot}};
 const UE={KismetSystemLibrary:{IsValid:x=>!!x,GetPathName:x=>x},SGameAIWorldSubsystem:{StaticClass:()=>1},
  SubsystemBlueprintLibrary:{GetWorldSubsystem:()=>({GetSpawner(alias){calls.push(alias);return aliases[alias];}})},
  GameplayStatics:{GetPlayerCharacter:()=>pawn,GetPlayerController:()=>controller,GetAllActorsOfClass(){assert.fail('Exact alias probe must not enumerate actors');}},
  BasicAttributeSet:{StaticClass:()=>1},PBZBlueprintFunctionLibrary:{MakeAttribute:x=>x,GetAttributeFromCharacter:()=>150}};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/control-qa.js','utf8'),{exports,Date:{now:()=>10000},require:n=>({ue:UE,puerts:{},'./qa-config':{mode}})[n]});
 const session={active:true,boss:{id:'BP_Monster_Yuu',profile:{nativeController:true}},worldLoadingComplete:true,directArrival:{released:true},ux:{}};
 return {calls,aliases,pawn,controller,session,capture:()=>exports.captureDuo({},session)};
}
test('phase-three probe records the native alias mismatch and both real pawns without changing them',()=>{
 const h=setup(),r=h.capture();assert.deepEqual(h.calls,['Yuu_Seq046-1','TieGu_Seq046-1','TieGui_Seq046-1']);
 assert.equal(r.status,'observed');assert.equal(r.nativeController,true);assert.equal(r.phase,'playable');
 assert.equal(r.aliases[0].pawn,'native-pawn');assert.equal(r.aliases[1].spawner,null);assert.equal(r.aliases[2].pawn,'TieGui-pawn');
 assert.equal(r.aliases[2].group,'MobGroup_2');assert.equal(r.aliases[2].groupActive,true);assert.equal(r.aliases[2].health,150);
 assert.equal(r.camera.rotation.Yaw,248);assert.equal(r.player.position.Z,3);assert.equal(h.session.ux.duoPhase3Diagnostic,r);
});
test('destroyed alias pawn and unavailable camera return explicit unknown evidence while other alias remains readable',()=>{
 const h=setup();h.aliases['Yuu_Seq046-1'].GetPawn=()=>{throw Error('destroyed wrapper');};
 h.controller.PlayerCameraManager.GetCameraRotation=()=>{throw Error('camera not ready');};const r=h.capture();
 assert.equal(r.status,'unknown');assert.equal(r.aliases[2].pawn,'TieGui-pawn');assert.equal(r.camera.rotation,null);
 assert(r.errors.some(e=>e.field==='Yuu_Seq046-1.pawn'));assert(r.errors.some(e=>e.field==='camera.rotation'));
});
test('duo alias diagnostic is inert in manual mode, inactive sessions and unrelated encounters',()=>{
 for(const change of [h=>h.session.active=false,h=>h.session.boss.id='BP_Monster_TieGui']){
  const h=setup();change(h);assert.equal(h.capture(),null);assert.deepEqual(h.calls,[]);
 }
 const h=setup('manual');assert.equal(h.capture(),null);assert.deepEqual(h.calls,[]);
});
