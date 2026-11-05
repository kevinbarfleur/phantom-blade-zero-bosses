"use strict";
const UE=require("ue"),puerts=require("puerts");
const inanis=require("./inanis");
// Native DA_JhsyBellDataAsset: this is the existing Inanis sanctuary, with
// its native streaming anchor, geometry and camera orientation. No bell is added.
const location={X:-147150,Y:-12900.74,Z:5000830};
const destination={id:"Codex_Training",label:"ENTRAÎNEMENT",training:true,members:[],classes:[],map:"DuanHunYa",balance:{weaponLevel:30},
    profile:{level:"PBZ_Duanhun_WP",bell:"Bell_JYG_001",broken:false,transform:{Location:location,Rotation:{Roll:0,Pitch:0,Yaw:0}},camera:{Roll:0,Pitch:0,Yaw:0},arena:location,
    clearActors:[],clearTags:[],nodeIDs:[],graphs:[],loadLayers:[],unloadLayers:[]}};
function tick(context,session){
    if(!session.boss.training)return;
    const player=UE.GameplayStatics.GetPlayerCharacter(context,0);
    if(!player)return;
    const at=player.K2_GetActorLocation();
    session.trainingTicks=(session.trainingTicks||0)+1;
    if(!session.trainingInteractionsDisabled||session.trainingTicks%300===0){
        const out=puerts.$ref(UE.NewArray(UE.Actor));
        UE.GameplayStatics.GetAllActorsOfClass(context,UE.Actor.StaticClass(),out);const actors=puerts.$unref(out);
        let hidden=0,disabled=0,hiddenEffects=0;const managed=[];
        for(let i=0;i<actors.Num();i++){
            const actor=actors.Get(i);if(actor===session.inanisInteraction)continue;
            const p=actor.K2_GetActorLocation();
            if(Math.hypot(p.X-location.X,p.Y-location.Y,p.Z-location.Z)>10000)continue;
            const name=actor.GetName(),classPath=UE.KismetSystemLibrary.GetPathName(actor.GetClass());
            const portal=/1586733046$/.test(name)||/portal|teleport|magicdoor|chuansong/i.test(name+' '+classPath);
            const bell=/bell|savepoint/i.test(name+' '+classPath);
            const npc=/NPCSpawner|BP_NPC_|FlowInteractActor/i.test(name+' '+classPath);
            // The return doorway's Niagara system can be spawned independently
            // of its interaction actor. Keep the blue flower and ambient FX.
            if(UE.NiagaraComponent&&typeof actor.GetComponentsByClass==='function'){
                const particles=actor.GetComponentsByClass(UE.NiagaraComponent.StaticClass());
                for(let j=0;j<particles.Num();j++){
                    const component=particles.Get(j),asset=component.GetAsset();
                    if(!asset||!/\/NS_MCHJ_MagicDoor_JHSY(?:_ROQS)?\./.test(UE.KismetSystemLibrary.GetPathName(asset)))continue;
                    component.SetVisibility(false,true);component.SetHiddenInGame(true,true);
                    component.DeactivateImmediate();hiddenEffects++;
                }
            }
            if(!portal&&!bell&&!npc)continue;
            // NPC spawners need their spawn overlap to keep the visual NPC alive.
            if(!/NPCSpawner/i.test(classPath))actor.SetActorEnableCollision(false);
            disabled++;
            if(actor.InteractSphere)actor.InteractSphere.SetGenerateOverlapEvents(false);
            for(const key of ['InteractWidget','Widget'])if(actor[key])actor[key].SetVisibility(false);
            if(portal||bell){actor.SetActorHiddenInGame(true);hidden++;if(actor.Niagara)actor.Niagara.Deactivate();}
            managed.push({name,classPath,portal,bell,npc});
        }
        session.trainingInteractionsDisabled=true;session.ux={...session.ux,trainingExitBlocked:true,trainingHiddenActors:hidden,trainingDisabledActors:disabled,trainingHiddenEffects:hiddenEffects};
        session.trainingManagedActors=managed;
    }
    inanis.tick(context,session);
    // Keep the laboratory inside the sanctuary even if an exit interaction or
    // a fall would otherwise return the pawn to the campaign below it.
    if(!session.arrivalAnchorPending&&(Math.hypot(at.X-location.X,at.Y-location.Y)>6500||Math.abs(at.Z-location.Z)>2000)){
        const hit=puerts.$ref(new UE.HitResult());player.K2_SetActorLocation(new UE.Vector(location.X,location.Y,location.Z),false,hit,true);
        session.ux={...session.ux,trainingBoundaryReturns:(session.ux?.trainingBoundaryReturns||0)+1};
    }
}
function patchTeleport(Type,isTraining,onExit){
    const p=Type.prototype,native=p.TeleportToBellFromJhsy;
    p.TeleportToBellFromJhsy=function(...args){if(isTraining()){onExit(this);return false;}return native.apply(this,args);};
}
exports.destination=destination;exports.tick=tick;exports.patchTeleport=patchTeleport;
