const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 const actors=[],actor=(name,path,position)=>({GetName:()=>name,GetClass:()=>path,K2_GetActorLocation:()=>position}),turns=[],views=[];
 const player={K2_GetActorLocation:()=>({X:0,Y:0,Z:0}),CharacterMovement:{StopMovementImmediately(){}},K2_SetActorRotation:r=>turns.push(r)},controller={SetControlRotation:r=>views.push(r)};
 let authored=null;
 const UE={KismetSystemLibrary:{IsValid:()=>true,GetPathName:p=>p},SGameAIWorldSubsystem:{StaticClass:()=>1},SubsystemBlueprintLibrary:{GetWorldSubsystem:()=>({GetSpawner:()=>({GetPawn:()=>authored})})},Class:{Find:p=>p},Actor:{},NewArray:()=>null,GameplayTag:class{},GameplayStatics:{GetAllActorsOfClass(_,path,out){const found=actors.filter(a=>a.GetClass()===path);out.value={Num:()=>found.length,Get:i=>found[i]};}},AbilitySystemBlueprintLibrary:{GetAbilitySystemComponent:a=>({HasMatchingGameplayTag:()=>!!a.dead})},Rotator:class{constructor(Pitch,Yaw,Roll){Object.assign(this,{Pitch,Yaw,Roll});}}};
 const api={};vm.runInNewContext(fs.readFileSync(__dirname+'/entry-facing.js','utf8'),{exports:api,require:n=>n==='ue'?UE:{$ref:value=>({value}),$unref:r=>r.value}});
 const session={boss:{classes:['/Boss_C'],supportClasses:['/Guard_C'],profile:{primarySpawnerID:'Primary'}}};
 return {UE,api,face(){let result;for(let i=0;i<4;i++)result=api.apply({},session,player,controller);return result;},session,actor,actors,player,controller,turns,views,set authored(value){authored=value;}};
}
test('the pawn and camera turn toward the actual registered opponent, including across negative coordinates',()=>{
 const h=harness();h.authored=h.actor('Authored','/Boss_C',{X:-650,Y:-650,Z:0});assert.equal(h.face(),true);assert.equal(h.turns[0].Yaw,-135);assert.equal(h.views[0].Yaw,-135);assert.equal(h.session.ux.entryFacing.actor,'Authored');
});
test('same-class pooled stand-ins, nearby guards and hidden or dead phases do not steal the view',()=>{
 const h=harness();h.authored=h.actor('Authored','/Boss_C',{X:650,Y:0,Z:0});h.actors.push(h.actor('Pooled','/Boss_C',{X:0,Y:-100,Z:0}),h.actor('Guard','/Guard_C',{X:0,Y:50,Z:0}));
 h.face();assert.equal(h.views[0].Yaw,0);
 h.authored=null;h.actors[0].bHidden=true;h.actors[1].dead=true;assert.equal(h.face(),false);
});
test('a missing, distant or coincident target leaves control locked for the arrival recovery path',()=>{
 for(const position of [{X:0,Y:0,Z:0},{X:20000,Y:0,Z:0},{X:100,Y:0,Z:10000}]){const h=harness();h.authored=h.actor('Unavailable','/Boss_C',position);assert.equal(h.face(),false);assert.equal(h.turns.length,0);assert.equal(h.views.length,0);}
});

test('an expired spawner wrapper is ignored in favor of a current live opponent',()=>{
 const h=harness();h.authored={expired:true};h.UE.KismetSystemLibrary.IsValid=object=>{if(object.expired)throw Error('passing a invalid object');return true;};
 h.actors.push(h.actor('LiveOpponent','/Boss_C',{X:650,Y:0,Z:0}));assert.equal(h.face(),true);assert.equal(h.session.ux.entryFacing.actor,'LiveOpponent');
});

function navigation(h,project){
 let position={X:0,Y:0,Z:0};const moves=[];
 h.UE.Vector=class{constructor(X=0,Y=0,Z=0){Object.assign(this,{X,Y,Z});}};
 h.player.K2_GetActorLocation=()=>position;
 h.player.K2_TeleportTo=point=>{position=point;moves.push(point);return true;};
 h.UE.NavigationSystemV1={K2_ProjectPointToNavigation(context,wanted,out,nav,filter,extent){assert.equal(extent.Z,140);const p=project(wanted);if(!p)return false;out.value=p;return true;}};
 return moves;
}

test('a boss that moved close during preparation receives a collision-fitted start on its own floor',()=>{
 const h=harness(),moves=navigation(h,p=>({...p,Z:-98}));h.authored=h.actor('MovingNPC','/Boss_C',{X:235,Y:0,Z:0});
 assert.equal(h.face(),true);assert.equal(moves.length,1);assert.equal(h.session.ux.entryClearance.reason,'distance');assert.equal(h.session.ux.entryFacing.distance,650);assert.equal(moves[0].Z,8);
});

test('a lower-floor projection is rejected instead of placing the player below a ledge encounter',()=>{
 const h=harness(),moves=navigation(h,p=>({...p,Z:-98}));h.authored=h.actor('LedgeBoss','/Boss_C',{X:650,Y:0,Z:600});
 assert.equal(h.face(),false);assert.equal(moves.length,0);assert.equal(h.turns.length,0);
 const upper=harness(),placed=navigation(upper,p=>({...p,Z:502}));upper.authored=upper.actor('LedgeBoss','/Boss_C',{X:650,Y:0,Z:600});
 assert.equal(upper.face(),true);assert.equal(placed[0].Z,608);assert.equal(upper.session.ux.entryClearance.reason,'floor');
});

test('an arriving opponent finishes falling before the camera and controls are released',()=>{
 const h=harness(),boss=h.actor('FallingBoss','/Boss_C',{X:650,Y:0,Z:0});h.authored=boss;
 h.UE.EMovementMode={MOVE_Falling:3};boss.CharacterMovement={MovementMode:3};assert.equal(h.face(),false);assert.equal(h.turns.length,0);
 boss.CharacterMovement.MovementMode=1;assert.equal(h.face(),true);
});

test('auditing a native introduction observes its placement without rotating or moving the player',()=>{
 const h=harness();h.authored=h.actor('NativePlacement','/Boss_C',{X:650,Y:0,Z:0});h.player.K2_GetActorRotation=()=>({Yaw:0});h.controller.GetControlRotation=()=>({Yaw:0});
 const observed=h.api.audit({},h.session,h.player,h.controller);assert.equal(observed.actor,'NativePlacement');assert.equal(observed.distance,650);assert.equal(h.turns.length,0);assert.equal(h.views.length,0);
});

test('a verified elevated enemy stays in its native approach while the camera looks up at it',()=>{
 const h=harness();h.session.boss.profile.directEntry={nativeElevatedApproach:true};h.authored=h.actor('ElevatedApproach','/Boss_C',{X:650,Y:0,Z:600});
 h.controller.PlayerCameraManager={GetCameraLocation:()=>({X:-350,Y:0,Z:100})};h.player.K2_TeleportTo=()=>{throw Error('never teleport onto the perch');};
 assert.equal(h.face(),true);assert.equal(h.turns[0].Pitch,0);assert(h.views[0].Pitch>25&&h.views[0].Pitch<35);
});
test('native pose commit keeps the fitted position and camera, without selecting or teleporting to another destination',()=>{
 const h=harness(),calls=[],view={Pitch:12,Yaw:20,Roll:0};h.session.ux={entryFacing:{yaw:20}};h.controller.GetControlRotation=()=>view;
 h.UE.PBZBlueprintFunctionLibrary={PBZActorTeleportTo:(...args)=>{calls.push(args);return true;}};
 assert.equal(h.api.commit({},h.session,h.player,h.controller),true);assert.equal(calls.length,1);assert.equal(calls[0][0],h.player);assert.deepEqual(calls[0][1],{X:0,Y:0,Z:0});assert.equal(calls[0][2].Yaw,20);assert.deepEqual(calls[0].slice(3),[false,true]);assert.equal(h.views.at(-1),view);assert.equal(h.session.ux.nativeEntryPoseCommitted,true);
});
test('native introductions never use the preparatory pose commit and rejected native teleports remain failures',()=>{
 const h=harness();h.session.ux={entryFacing:{yaw:20}};h.controller.GetControlRotation=()=>({Pitch:0,Yaw:20,Roll:0});let calls=0;
 h.UE.PBZBlueprintFunctionLibrary={PBZActorTeleportTo:()=>{calls++;return false;}};h.session.cinematicActive=true;
 assert.equal(h.api.commit({},h.session,h.player,h.controller),false);assert.equal(calls,0);
 h.session.cinematicActive=false;h.session.boss.profile.directEntry={sequences:['/Intro']};assert.equal(h.api.commit({},h.session,h.player,h.controller),false);assert.equal(calls,0);
 h.session.boss.profile.directEntry.sequences=[];assert.equal(h.api.commit({},h.session,h.player,h.controller),false);assert.equal(calls,1);assert.equal(h.session.ux.nativeEntryPoseCommitted,undefined);
});
