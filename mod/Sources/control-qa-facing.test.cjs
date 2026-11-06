const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const exports={},UE={KismetSystemLibrary:{GetPathName:x=>x}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/control-qa.js','utf8'),{exports,require:n=>({ue:UE,puerts:{},'./qa-config':{mode:'flow'}})[n]});
 const rotation={Pitch:0,Yaw:20,Roll:0},meshRotation={Pitch:0,Yaw:-70,Roll:0};
 const driver={GetClass:()=>'/NativeDriver',GetCurrentMoveInputRaw:()=>({X:0,Y:0,Z:0}),SetFacingRotation(){assert.fail('read-only diagnostic must not rotate');}};
 const mesh={GetName:()=> 'CharacterMesh0',K2_GetComponentRotation:()=>meshRotation,RelativeRotation:{Pitch:0,Yaw:-90,Roll:0},bAbsoluteRotation:false};
 const player={K2_GetActorRotation:()=>rotation,GetMesh:()=>mesh,GetLocomotionDriverComponent:()=>driver,CharacterMovement:{MovementMode:1},bUseControllerRotationYaw:false};
 const controller={GetControlRotation:()=>rotation,PlayerCameraManager:{GetCameraRotation:()=>rotation}};
 return {api:exports,UE,player,controller,mesh,driver,rotation,meshRotation};
}
test('facing diagnostic distinguishes rendered mesh rotation from actor/control and retains primitive copies only',()=>{
 const h=setup(),r=h.api.captureFacing(h.player,h.controller);
 assert.equal(r.actor.Yaw,20);assert.equal(r.meshWorld.Yaw,-70);assert.equal(r.meshRelative.Yaw,-90);assert.equal(r.meshAbsoluteRotation,false);
 assert(r.driverRotationMembers.includes('SetFacingRotation'));assert.equal(r.driverClass,'/NativeDriver');assert.equal(r.errors.length,0);
 h.rotation.Yaw=180;h.meshRotation.Yaw=90;h.mesh.RelativeRotation.Yaw=12;assert.equal(r.actor.Yaw,20);assert.equal(r.meshWorld.Yaw,-70);assert.equal(r.meshRelative.Yaw,-90);
 assert.doesNotThrow(()=>JSON.stringify(r));
});
test('destroyed mesh and driver reads are unknown evidence without suppressing actor/control samples',()=>{
 const h=setup();h.player.GetMesh=()=>{throw Error('destroyed mesh');};h.player.GetLocomotionDriverComponent=()=>{throw Error('driver unavailable');};
 const r=h.api.captureFacing(h.player,h.controller);assert.equal(r.actor.Yaw,20);assert.equal(r.meshWorld,null);assert.equal(r.rawMoveInput,null);assert(r.errors.some(x=>x.field==='mesh'));assert(r.errors.some(x=>x.field==='driver'));
});
test('subsequent facing samples omit reflection metadata while retaining live rotations',()=>{
 const h=setup(),r=h.api.captureFacing(h.player,h.controller,false);assert.equal(r.meshWorld.Yaw,-70);assert.equal(r.driverRotationMembers,undefined);assert.equal(r.meshRotationMembers,undefined);assert.equal(r.animRotationMembers,undefined);
});
test('Renewal player wrapper exposes native CharacterMesh0 through Mesh without GetMesh',()=>{
 const h=setup();delete h.player.GetMesh;h.player.Mesh=h.mesh;
 const r=h.api.captureFacing(h.player,h.controller);
 assert.equal(r.meshName,'CharacterMesh0');assert.equal(r.meshWorld.Yaw,-70);assert.equal(r.meshRelative.Yaw,-90);assert.equal(r.errors.length,0);
});
test('read-only anim root yaw and narrative camera target distinguish pose and camera ownership',()=>{
 const h=setup(),anim={GetClass:()=>'/NativeAnim','Last Root Yaw':180,'Origin Root Yaw Target':170,WorldRotation:{Pitch:0,Yaw:20,Roll:0},GetTurnTargetYaw(){assert.fail('do not invoke unknown native signature');}};
 h.mesh.GetAnimInstance=()=>anim;h.player.NBCamera={GetCameraLockOnTargetObject:()=>({GetTargetActor:group=>{assert.equal(group,'LockView');return {GetName:()=> 'NarrativeTarget',GetClass:()=>'/Target',K2_GetActorLocation:()=>({X:1,Y:2,Z:3})};}})};
 const r=h.api.captureFacing(h.player,h.controller,false);
 assert.equal(r.animClass,'/NativeAnim');assert.equal(r.animYaw['Last Root Yaw'],180);assert.equal(r.animWorldRotation.Yaw,20);assert.equal(r.nativeCameraLockView.name,'NarrativeTarget');
 anim.WorldRotation.Yaw=90;assert.equal(r.animWorldRotation.Yaw,20);
});
test('rendered bone probe reads existing bones only and copies world transform',()=>{
 const h=setup();h.UE.ERelativeTransformSpace={RTS_World:0};h.mesh.DoesSocketExist=bone=>bone==='root';
 h.mesh.GetSocketTransform=(bone,space)=>{assert.equal(bone,'root');assert.equal(space,0);return {Rotator:()=>({Pitch:0,Yaw:110,Roll:0}),GetLocation:()=>({X:1,Y:2,Z:3})};};
 const r=h.api.captureFacing(h.player,h.controller,false);assert.equal(r.boneWorld.root.rotation.Yaw,110);assert.equal(r.boneWorld.pelvis,null);assert.equal(r.meshWorld.Yaw,-70);
});
