"use strict";
const UE=require('ue'),puerts=require('puerts');
const valid=actor=>{try{return !!actor&&UE.KismetSystemLibrary.IsValid(actor);}catch(_){return false;}};
function angle(from,to){
    const dx=to.X-from.X,dy=to.Y-from.Y;
    if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)<1)return null;
    return {yaw:Math.atan2(dy,dx)*180/Math.PI,distance:Math.hypot(dx,dy)};
}
function target(context,session,player){
    const boss=session.boss,profile=boss.profile,paths=[...(boss.classes||[]),...(boss.supportClasses||[])],known=paths.map(p=>p.toLowerCase()),candidates=[];
    let authored=null;
    const id=profile.nativeSpawnerID||profile.primarySpawnerID;
    if(id&&id!=='None'&&UE.SGameAIWorldSubsystem){const system=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.SGameAIWorldSubsystem.StaticClass());authored=system?.GetSpawner(id)?.GetPawn();if(valid(authored))candidates.push(authored);}
    for(const path of paths){const cls=UE.Class.Find(path);if(!cls)continue;const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);const actors=puerts.$unref(out);for(let i=0;i<actors.Num();i++)if(!candidates.includes(actors.Get(i)))candidates.push(actors.Get(i));}
    const from=player.K2_GetActorLocation(),dead=new UE.GameplayTag();dead.TagName='CharacterState.Dead';
    const choices=[];
    for(const actor of candidates){
        if(!valid(actor)||actor.bHidden)continue;
        const path=UE.KismetSystemLibrary.GetPathName(actor.GetClass()).toLowerCase();if(!known.includes(path))continue;
        if(UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor)?.HasMatchingGameplayTag(dead))continue;
        const at=actor.K2_GetActorLocation(),heading=angle(from,at);if(!heading||Math.abs(at.Z-from.Z)>3000||heading.distance>15000)continue;
        choices.push({actor,name:actor.GetName(),position:{X:at.X,Y:at.Y,Z:at.Z},...heading,authored:actor===authored,primary:(boss.classes||[]).some(p=>p.toLowerCase()===path)});
    }
    choices.sort((a,b)=>Number(b.authored)-Number(a.authored)||Number(b.primary)-Number(a.primary)||a.distance-b.distance);return choices[0]||null;
}
function height(actor){try{return actor.CapsuleComponent?.GetScaledCapsuleHalfHeight?.()||98;}catch(_){return 98;}}
function settle(session,opponent){
    const movement=opponent.actor.CharacterMovement;
    if(movement&&UE.EMovementMode?.MOVE_Falling!==undefined&&movement.MovementMode===UE.EMovementMode.MOVE_Falling)return false;
    const previous=session.entryFacingSample,at=opponent.position;
    const stable=previous?.actor===opponent.name&&Math.hypot(at.X-previous.X,at.Y-previous.Y,at.Z-previous.Z)<=2;
    session.entryFacingSample={actor:opponent.name,...at,ticks:stable?previous.ticks+1:0};
    return session.entryFacingSample.ticks>=3;
}
function clearance(context,session,player,opponent){
    const from=player.K2_GetActorLocation(),feet=opponent.position.Z-height(opponent.actor),playerHeight=height(player);
    if(opponent.distance>=500&&(Math.abs(from.Z-playerHeight-feet)<=180||session.boss.profile.directEntry?.nativeElevatedApproach))return true;
    if(!UE.NavigationSystemV1?.K2_ProjectPointToNavigation||!player.K2_TeleportTo)return false;
    const base=opponent.yaw+180;
    for(const radius of [650,500,400])for(const offset of [0,45,-45,90,-90,135,-135,180]){
        const angle=(base+offset)*Math.PI/180,wanted=new UE.Vector(opponent.position.X+Math.cos(angle)*radius,opponent.position.Y+Math.sin(angle)*radius,feet),projected=puerts.$ref(new UE.Vector());
        if(!UE.NavigationSystemV1.K2_ProjectPointToNavigation(context,wanted,projected,null,null,new UE.Vector(80,80,140)))continue;
        const point=puerts.$unref(projected);
        if(Math.abs(point.Z-feet)>180||Math.hypot(point.X-wanted.X,point.Y-wanted.Y)>120)continue;
        // Fit the actual player capsule on the boss's walkable floor. This is
        // a local collision-checked move, without another gameplay teleport,
        // loading screen or encounter initialization.
        const destination=new UE.Vector(point.X,point.Y,point.Z+playerHeight+8);
        if(!player.K2_TeleportTo(destination,new UE.Rotator(0,opponent.yaw,0)))continue;
        session.ux={...session.ux,entryClearance:{actor:opponent.name,reason:opponent.distance<500?'distance':'floor',from:{X:from.X,Y:from.Y,Z:from.Z},to:{X:destination.X,Y:destination.Y,Z:destination.Z},radius}};
        return true;
    }
    return false;
}
function apply(context,session,player,controller){
    let opponent=target(context,session,player);if(!opponent||!settle(session,opponent))return false;
    if(!clearance(context,session,player,opponent))return false;
    opponent=target(context,session,player);if(!opponent)return false;
    const rotation=new UE.Rotator(0,opponent.yaw,0);
    player.CharacterMovement?.StopMovementImmediately();
    if(player.K2_SetActorRotation(rotation,true)===false)return false;
    let view=rotation;
    if(session.boss.profile.directEntry?.nativeElevatedApproach){
        const from=controller.PlayerCameraManager?.GetCameraLocation?.()||player.K2_GetActorLocation(),at=opponent.position;
        const pitch=Math.atan2(at.Z+80-from.Z,Math.hypot(at.X-from.X,at.Y-from.Y))*180/Math.PI;
        view=new UE.Rotator(Math.max(-45,Math.min(45,pitch)),opponent.yaw,0);
    }
    controller.SetControlRotation(view);
    session.ux={...session.ux,entryFacing:{actor:opponent.name,target:opponent.position,yaw:opponent.yaw,distance:opponent.distance}};
    return true;
}
function observe(session,player,controller){
    const result={pawnYaw:player.K2_GetActorRotation().Yaw,controlYaw:controller.GetControlRotation().Yaw,controlPitch:controller.GetControlRotation().Pitch,cameraYaw:controller.PlayerCameraManager?.GetCameraRotation?.().Yaw,cameraPitch:controller.PlayerCameraManager?.GetCameraRotation?.().Pitch};
    const at=session.ux?.entryFacing?.target;
    if(at&&typeof controller.ProjectWorldLocationToScreen==='function'&&typeof controller.GetViewportSize==='function')try{
        const point=puerts.$ref(new UE.Vector2D()),width=puerts.$ref(0),height=puerts.$ref(0);
        const front=controller.ProjectWorldLocationToScreen(new UE.Vector(at.X,at.Y,at.Z+80),point,true);controller.GetViewportSize(width,height);
        const screen=puerts.$unref(point),w=puerts.$unref(width),h=puerts.$unref(height);
        if(w>0&&h>0){result.screenX=screen.X/w;result.screenY=screen.Y/h;result.opponentVisible=!!front&&screen.X>=0&&screen.X<=w&&screen.Y>=0&&screen.Y<=h;}
    }catch(error){result.projectionError=String(error);}
    return result;
}
exports.angle=angle;exports.apply=apply;exports.observe=observe;
exports.audit=(context,session,player,controller)=>{
    const opponent=target(context,session,player);if(!opponent)return null;
    return {actor:opponent.name,target:opponent.position,distance:opponent.distance,...observe({ux:{entryFacing:{target:opponent.position}}},player,controller)};
};
