const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 const moves=[],fades=[],modes=[],teleports=[],actions=[],rotations=[],facingCalls=[];let ignore=1,facingReady=true,nativeAuditReady=false,commitFailure=null,commitCalls=0;
 const player={K2_GetActorRotation:()=>({Yaw:0}),K2_SetActorLocation:p=>moves.push(p),CharacterMovement:{StopMovementImmediately(){},SetMovementMode:m=>modes.push(m)}};
 const controller={IsMoveInputIgnored:()=>ignore>1,IsLookInputIgnored:()=>true,GetControlRotation:()=>({Yaw:0}),SetIgnoreMoveInput:v=>ignore+=v?1:-1,SetIgnoreLookInput(){},SetControlRotation:r=>rotations.push(r),PlayerCameraManager:{GetCameraRotation:()=>({Yaw:0}),StartCameraFade:(...a)=>fades.push(a)}};
 const delegate=()=>{const h=new Set();return {Add:f=>h.add(f),Remove:f=>h.delete(f),get size(){return h.size;},emit:(...a)=>[...h].forEach(f=>f(...a))};};
 const UE={KismetSystemLibrary:{IsValid:()=>true,MakeSoftClassPath:x=>x,Conv_SoftClassPathToSoftClassRef:x=>x},GameplayStatics:{GetPlayerController:()=>controller,GetPlayerCharacter:()=>player},EMovementMode:{MOVE_Flying:5},GameplayTag:class{},PBZBlueprintFunctionLibrary:{PBZActorTeleportTo:(...a)=>teleports.push(a)},AsyncAction_PushContentToLayerForPlayer:{PushContentToLayerForPlayer(){const action={BeforePush:delegate(),AfterPush:delegate(),Activate(){}};actions.push(action);return action;}},HitResult:class{},Vector:class{constructor(X,Y,Z){Object.assign(this,{X,Y,Z});}},Rotator:class{constructor(Pitch,Yaw,Roll){Object.assign(this,{Pitch,Yaw,Roll});}},LinearColor:class{}};
 const session={arrivalAnchorPending:true,boss:{profile:{directEntry:{kind:'native-entry-volume',sequences:['/Movie'],transform:{Location:{X:50,Y:60,Z:70},Rotation:{Yaw:90}},waypoints:[]}}}};
 let pending=false,introductionReady=true;
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/arrival.js','utf8'),{exports,require:n=>n==='./entry-facing'?{commit(){commitCalls++;if(commitFailure instanceof Error)throw commitFailure;return commitFailure!==false;},audit(){return {opponentVisible:nativeAuditReady};},observe(){return {};},apply(){facingCalls.push(1);return facingReady;}}:n==='./entry-policy'?require('./entry-policy'):n==='ue'?UE:n==='./cinema'?{tick:()=>!!session.cinematicActive,pending:()=>pending,introductionReady:()=>introductionReady}:{$ref:v=>({value:v})}});
 return {UE,api:exports,session,moves,fades,modes,teleports,actions,rotations,widget:()=>({BP_OnWidgetDeactivated:delegate(),DeactivateWidget(){this.deactivated=true;this.BP_OnWidgetDeactivated.emit();}}),set pending(v){pending=v;},set introductionReady(v){introductionReady=v;},set facingReady(v){facingReady=v;},set nativeAuditReady(v){nativeAuditReady=v;},facingCalls,set commitFailure(v){commitFailure=v;},get commitCalls(){return commitCalls;},get ignore(){return ignore;}};
}
test('arrival holds gravity and input until the native streaming cover confirms the destination',()=>{
 const h=harness();h.api.begin({},h.session);assert.equal(h.ignore,2);
 for(let i=0;i<400;i++)h.api.tick({},h.session);
 assert.equal(h.moves.length,1);assert.equal(h.moves[0].X,50);assert.equal(h.ignore,2);assert.equal(h.actions.length,0,'initial map loading must finish first');
 h.session.worldLoadingComplete=true;h.api.tick({},h.session);assert.equal(h.actions.length,1);
 const widget=h.widget();h.actions[0].BeforePush.emit(widget);h.actions[0].AfterPush.emit();assert.equal(h.teleports.length,0,'do not reinitialize the encounter through a second gameplay teleport');assert.equal(h.moves.at(-1).X,50);assert.equal(h.ignore,2);
 widget.BP_OnWidgetDeactivated.emit();assert.equal(h.ignore,1);assert.equal(h.session.ux.nativeArrivalLoaded,true);assert.equal(h.session.arrivalAnchorPending,false);
 h.api.release(h.session);assert.equal(h.ignore,1,'native cinematic input lock remains intact');
});
test('a running introduction owns player placement; no teleport interrupts it',()=>{
 const h=harness();h.api.begin({},h.session);h.session.cinematicActive=true;
 h.api.tick({},h.session);assert.equal(h.moves.length,0);assert.equal(h.ignore,1);assert.equal(h.session.arrivalAnchorPending,false);
});
test('ordinary encounters stay at the safe checkpoint until the native cover owns arena placement',()=>{
 const h=harness(),p=h.session.boss.profile;p.directEntry.sequences=[];p.directEntry.kind='native-arena-approach';p.transform={Location:{X:-5000,Y:0,Z:70},Rotation:{Yaw:180}};
 h.api.begin({},h.session);h.session.worldLoadingComplete=true;for(let i=0;i<60;i++)h.api.tick({},h.session);
 assert.equal(h.moves[0].X,-5000);const widget=h.widget();h.actions[0].BeforePush.emit(widget);h.actions[0].AfterPush.emit(widget);assert.equal(h.moves.at(-1).X,50);assert.equal(h.ignore,2);
 widget.BP_OnWidgetDeactivated.emit();assert.equal(h.session.directArrival.released,false);
 for(let i=0;i<5;i++)h.api.tick({},h.session);assert.equal(h.facingCalls.length,3);assert.equal(h.commitCalls,1);assert.equal(h.session.directArrival.released,false,'native pose needs its animation update before revealing');
 h.api.tick({},h.session);assert.equal(h.session.directArrival.released,false);
 h.api.tick({},h.session);assert.equal(h.session.directArrival.released,true);assert.equal(h.ignore,1);
 for(let i=0;i<15;i++)h.api.tick({},h.session);assert.equal(h.facingCalls.length,3,'player camera input is never overwritten after release');assert.equal(h.commitCalls,1,'native pose commit happens once');
});
test('controls are not released while the real opponent is still unavailable',()=>{
 const h=harness(),p=h.session.boss.profile;p.directEntry.sequences=[];p.transform={Location:{X:-5000,Y:0,Z:70},Rotation:{Yaw:180}};h.facingReady=false;
 h.api.begin({},h.session);h.session.worldLoadingComplete=true;for(let i=0;i<60;i++)h.api.tick({},h.session);const widget=h.widget();h.actions[0].BeforePush.emit(widget);h.actions[0].AfterPush.emit(widget);widget.BP_OnWidgetDeactivated.emit();
 for(let i=0;i<20;i++)h.api.tick({},h.session);assert.equal(h.session.directArrival.released,false);assert.equal(h.ignore,2);
 h.facingReady=true;for(let i=0;i<5;i++)h.api.tick({},h.session);assert.equal(h.session.directArrival.released,true);assert.equal(h.ignore,1);
});
test('failed native pose commit never retries a gameplay teleport or releases controls before watchdog recovery',()=>{
 for(const failure of [false,Error('native failure')]){
  const h=harness(),p=h.session.boss.profile;p.directEntry.sequences=[];p.transform={Location:{X:-5000,Y:0,Z:70},Rotation:{Yaw:180}};h.commitFailure=failure;
  h.api.begin({},h.session);h.session.worldLoadingComplete=true;for(let i=0;i<60;i++)h.api.tick({},h.session);
  const widget=h.widget();h.actions[0].BeforePush.emit(widget);h.actions[0].AfterPush.emit(widget);widget.BP_OnWidgetDeactivated.emit();
  for(let i=0;i<100;i++)h.api.tick({},h.session);
  assert.equal(h.commitCalls,1);assert.equal(h.facingCalls.length,3);assert.equal(h.session.directArrival.released,false);assert.equal(h.ignore,2);assert(h.session.ux.nativeEntryPoseCommitError);
  h.api.abort(h.session);assert.equal(h.ignore,1);
 }
});
test('an identified scripted entrance waits outside and lets its native introduction place the player',()=>{
 const h=harness(),entry=h.session.boss.profile.directEntry;Object.assign(entry,{graph:'/Game/Intro',node:'9860EF90-4BA16232-D05FB7BA-54DB496D',sequences:['/Seq'],crossing:{X:1,Y:2,Z:3}});h.session.boss.profile.attachedEntranceFlows=[entry.graph];
 h.api.begin({},h.session);h.session.worldLoadingComplete=true;for(let i=0;i<60;i++)h.api.tick({},h.session);
 const widget=h.widget();h.actions[0].BeforePush.emit(widget);h.actions[0].AfterPush.emit(widget);widget.BP_OnWidgetDeactivated.emit();const before=h.moves.length;
 for(let i=0;i<200;i++)h.api.tick({},h.session);assert.equal(h.moves.length,before);assert.equal(h.session.ux.nativeEntryCrossed,undefined);assert.equal(h.session.directArrival.released,false);
 h.session.cinematicActive=true;h.api.tick({},h.session);assert.equal(h.session.directArrival.released,true);assert.equal(h.session.ux.directIntroObserved,true);
});

test('an invisible native introduction blocks placement before its first visible frame',()=>{
 const h=harness();h.api.begin({},h.session);h.pending=true;
 for(let i=0;i<400;i++)h.api.tick({},h.session);
 assert.equal(h.moves.length,0);assert.equal(h.actions.length,0);assert.equal(h.ignore,2);
 h.session.cinematicActive=true;h.api.tick({},h.session);
 assert.equal(h.ignore,1);assert.equal(h.session.ux.directIntroObserved,true);
});

test('a sequence queued after a cover request cancels its late teleport callback',()=>{
 const h=harness();h.api.begin({},h.session);h.session.worldLoadingComplete=true;
 for(let i=0;i<60;i++)h.api.tick({},h.session);
 assert.equal(h.actions.length,1);const previous=h.moves.length;
 h.pending=true;const widget=h.widget();h.actions[0].BeforePush.emit(widget);h.actions[0].AfterPush.emit(widget);
 assert.equal(widget.deactivated,true);assert.equal(h.moves.length,previous);assert.equal(h.session.ux.nativeArrivalLoaded,undefined);
 h.session.cinematicActive=true;h.api.tick({},h.session);assert.equal(h.ignore,1);
});

test('a sequence appearing while the streaming cover is active prevents re-entry and a second introduction',()=>{
 const h=harness();h.api.begin({},h.session);h.session.worldLoadingComplete=true;
 for(let i=0;i<60;i++)h.api.tick({},h.session);
 const widget=h.widget();h.actions[0].BeforePush.emit(widget);h.actions[0].AfterPush.emit(widget);
 const previous=h.moves.length;h.pending=true;h.api.tick({},h.session);
 assert.equal(widget.deactivated,true);h.session.cinematicActive=true;h.api.tick({},h.session);
 for(let i=0;i<100;i++)h.api.tick({},h.session);
 assert.equal(h.moves.length,previous);assert.equal(h.actions.length,1);assert.equal(h.session.ux.nativeEntryCrossed,undefined);
});

test('a late after-push callback cannot move a player whose streaming cover has already closed',()=>{
 const h=harness();h.api.begin({},h.session);h.session.worldLoadingComplete=true;
 for(let i=0;i<60;i++)h.api.tick({},h.session);
 const widget=h.widget();h.actions[0].BeforePush.emit(widget);widget.BP_OnWidgetDeactivated.emit();
 const previous=h.moves.length,modes=h.modes.length;
 h.actions[0].AfterPush.emit(widget);
 assert.equal(h.moves.length,previous);assert.equal(h.modes.length,modes);assert.equal(h.ignore,1);
});

test('callbacks from an earlier world cannot place a player in the next encounter',()=>{
 const h=harness();h.api.begin({},h.session);h.session.worldLoadingComplete=true;
 for(let i=0;i<60;i++)h.api.tick({},h.session);
 const old=h.actions[0],previous=h.moves.length;h.api.begin({},h.session);
 const widget=h.widget();old.BeforePush.emit(widget);old.AfterPush.emit(widget);
 assert.equal(h.moves.length,previous);assert.equal(old.BeforePush.size,0);assert.equal(old.AfterPush.size,0);assert.equal(widget.deactivated,undefined,'obsolete callbacks have been removed, native new-world widgets are untouched');assert.equal(h.ignore,2);
});

test('aborting an arrival closes its native cover and cancels delayed placement',()=>{
 const h=harness();h.api.begin({},h.session);h.session.worldLoadingComplete=true;
 for(let i=0;i<60;i++)h.api.tick({},h.session);
 const widget=h.widget(),action=h.actions[0];action.BeforePush.emit(widget);const moves=h.moves.length;
 h.api.abort(h.session);action.AfterPush.emit(widget);
 assert.equal(widget.deactivated,true);assert.equal(h.session.directArrival.released,true);assert.equal(h.moves.length,moves);assert.equal(h.ignore,1);
});

test('an expired native cover wrapper cannot prevent releasing the owned input lock',()=>{
 const h=harness();h.api.begin({},h.session);h.session.directArrival.widget={expired:true};
 h.UE.KismetSystemLibrary.IsValid=object=>{if(object.expired)throw Error('passing a invalid object');return true;};
 h.api.abort(h.session);assert.equal(h.session.directArrival.released,true);assert.equal(h.ignore,1);
});

test('a native automatic introduction retains placement while its outgoing camera and preview pawn settle',()=>{
 const h=harness();h.session.boss.profile.directEntry.sequences=[];h.api.begin({},h.session);h.session.cinematicActive=true;h.api.tick({},h.session);
 assert.equal(h.session.directArrival.released,true);h.session.cinematicActive=false;
 for(let i=0;i<5;i++)h.api.tick({},h.session);assert.equal(h.session.ux.nativeEntryFacingObserved.opponentVisible,false);assert.equal(h.session.directArrival.nativeFacingAudited,undefined);
 h.nativeAuditReady=true;h.api.tick({},h.session);assert.equal(h.session.ux.nativeEntryFacingObserved.opponentVisible,true);assert.equal(h.session.ux.nativeEntryFacingInitial.opponentVisible,false);assert.equal(h.session.directArrival.nativeFacingAudited,true);
 assert.equal(h.moves.length,0);assert.equal(h.facingCalls.length,0);
});

test('native cover retains the final approach facing instead of the remote trigger heading',()=>{
 const h=harness();h.session.boss.profile.arena={X:200,Y:60,Z:70};h.session.boss.profile.directEntry.waypoints=[{X:100,Y:60,Z:70}];
 h.api.begin({},h.session);h.session.worldLoadingComplete=true;
 for(let i=0;i<70;i++)h.api.tick({},h.session);
 const widget=h.widget();h.actions[0].BeforePush.emit(widget);h.actions[0].AfterPush.emit();
 assert.equal(h.moves.at(-1).X,100);assert.equal(h.rotations.at(-1).Yaw,0);
});

test('a cinematic entry crosses its native boundary after landing while remaining covered',()=>{
 const h=harness(),entry=h.session.boss.profile.directEntry;entry.sequences=['/Intro'];entry.crossing={X:900,Y:60,Z:70};
 h.api.begin({},h.session);h.session.worldLoadingComplete=true;
 for(let i=0;i<70;i++)h.api.tick({},h.session);
 assert.equal(h.moves[0].X,900,'load outside before the first native covered entry');
 const widget=h.widget();h.actions[0].BeforePush.emit(widget);h.actions[0].AfterPush.emit();widget.BP_OnWidgetDeactivated.emit();
 assert.equal(h.ignore,2,'keep the owned input lock until the entry has fired');
 for(let i=0;i<4;i++)h.api.tick({},h.session);
 assert.equal(h.moves.at(-2).X,900);assert.equal(h.moves.at(-1).X,50);assert.equal(h.ignore,2);
 assert.equal(h.session.ux.nativeEntryCrossed,true);
 h.session.cinematicActive=true;h.api.tick({},h.session);assert.equal(h.ignore,1);assert.equal(h.session.ux.directIntroObserved,true);
});
test('direct checkpoints retain the destination and the chosen gear independently',()=>{
 const model=require('./model'),base={PBZGameSystem:{},BellManager:{ActivateBellIDs:[]},Inventory:{MainWeaponInfos:{Long:{WeaponLevel:30}}},EventPipeline:{},AISystem:{SpawnerSaveData:{}},BossRecord:{},Player:{}};
 const boss=require('./boss-catalog').find(b=>b.id==='BP_Monster_HuaQianXIao');
 const native=model.bossSnapshot(base,boss),direct=model.bossSnapshot(base,boss,{direct:true});
 assert.equal(JSON.stringify(native.PBZGameSystem.PlayerTransform),JSON.stringify(boss.profile.transform));
 const expected={...boss.profile.directEntry.transform,Location:boss.profile.directEntry.crossing};
 assert.deepEqual(direct.PBZGameSystem.PlayerTransform,expected);
 const gear=model.captureGear(base);gear.Inventory.CurrentMainWeaponID='Long';
 const save=model.encounterSave(direct,gear,3,true,false,boss.balance);
 assert.equal(save.Inventory.CurrentMainWeaponID,'Long');assert.equal(save.Inventory.MainWeaponInfos.Long.WeaponLevel,5);
 assert.deepEqual(save.PBZGameSystem.PlayerTransform,expected);
 assert.equal(save.PBZGameSystem.DifficultModeByte,3);
});


test('a queued visible intro retains the arrival fade until native playback owns the first shot',()=>{
 const h=harness();h.api.begin({},h.session);h.session.cinematicActive=true;h.pending=true;h.introductionReady=false;
 for(let i=0;i<100;i++)h.api.tick({},h.session);
 assert.equal(h.session.directArrival.released,false);assert.equal(h.ignore,2);assert.equal(h.fades.length,1);assert.equal(h.moves.length,0);assert.equal(h.session.ux.directReady,undefined);
 h.introductionReady=true;h.api.tick({},h.session);
 assert.equal(h.session.directArrival.released,true);assert.equal(h.ignore,1);assert.equal(h.fades.length,2);assert.equal(h.session.ux.introRevealReady,true);assert.equal(h.moves.length,0);
});

test('an intro completed between readiness samples releases after native deactivation instead of retaining an input lock',()=>{
 const h=harness();h.api.begin({},h.session);h.session.cinematicActive=true;h.pending=true;h.introductionReady=false;h.api.tick({},h.session);
 h.session.cinematicActive=false;h.pending=false;
 for(let i=0;i<3;i++)h.api.tick({},h.session);
 assert.equal(h.session.directArrival.released,true);assert.equal(h.ignore,1);assert.equal(h.session.ux.introPreparationCancelled,true);assert.equal(h.moves.length,0);
});


test('a completed arrival detaches only its own delegates and releases its action/widget references',()=>{
 const h=harness();h.api.begin({},h.session);h.session.worldLoadingComplete=true;for(let i=0;i<60;i++)h.api.tick({},h.session);
 const state=h.session.directArrival,action=h.actions[0],widget=h.widget();let native=0;widget.BP_OnWidgetDeactivated.Add(()=>native++);
 action.BeforePush.emit(widget);action.AfterPush.emit(widget);
 assert.equal(action.BeforePush.size,0);assert.equal(action.AfterPush.size,0);assert.equal(state.action,null);assert.equal(widget.BP_OnWidgetDeactivated.size,2);
 widget.BP_OnWidgetDeactivated.emit();assert.equal(widget.BP_OnWidgetDeactivated.size,1);assert.equal(native,1);assert.equal(state.widget,null);assert.equal(state.coverDeactivated,null);
 widget.BP_OnWidgetDeactivated.emit();assert.equal(native,2,'unrelated native listeners survive');
});
test('committed world disposal drops native references without closing the loading cover or disturbing handoff',()=>{
 const h=harness();h.api.begin({},h.session);h.session.worldLoadingComplete=true;for(let i=0;i<60;i++)h.api.tick({},h.session);
 const state=h.session.directArrival,action=h.actions[0],widget=h.widget();action.BeforePush.emit(widget);
 state.loadingFollowup={widget};state.additional={widget};h.api.dispose(h.session);
 assert.equal(h.session.directArrival,null);assert.equal(state.controller,null);assert.equal(state.widget,null);assert.equal(state.action,null);assert.equal(state.loadingFollowup,null);assert.equal(state.additional,null);
 assert.equal(action.BeforePush.size,0);assert.equal(action.AfterPush.size,0);assert.equal(widget.BP_OnWidgetDeactivated.size,0);assert.equal(widget.deactivated,undefined,'native screen must finish its own lifecycle');assert.equal(h.ignore,1);
 h.api.dispose(h.session);assert.equal(h.ignore,1,'dispose releases only one owned lock');
});
