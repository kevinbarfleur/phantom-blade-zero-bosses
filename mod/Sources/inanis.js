"use strict";
const UE=require("ue"),puerts=require("puerts"),cpp=require("cpp");
let current=()=>null,select=()=>false,interactionClass=null;
const spawnerSuffix="2031038963";
function valid(object){return !!object&&UE.KismetSystemLibrary.IsValid(object);}
function configure(getSession,onSelect){current=getSession;select=onSelect;}
function active(){const session=current();return !!session?.active&&!!session.boss?.training;}
function interact(actor){
    const session=current();if(!active()||!valid(actor))return false;
    const now=Date.now();if(now-(session.lastInanisInteraction||0)<750)return false;
    session.lastInanisInteraction=now;
    // Native interaction dispatch must finish before opening a paused menu.
    setTimeout(()=>{
        if(!active()||current()!==session||!valid(actor))return;
        const player=UE.GameplayStatics.GetPlayerCharacter(actor,0);
        const component=player&&UE.PBZInteractComponent.GetInteractComponent(player);
        if(component)component.EndInteract(actor);
        session.ux={...session.ux,inanisSelections:(session.ux?.inanisSelections||0)+1};
        select(actor);
    },0);
    return false; // Same immediate-return convention as BP_FlowInteractActor.
}
function getClass(){
    if(interactionClass)return interactionClass;
    const native=puerts.blueprint.tojs(UE.Class.Load("/Game/PBZContent/Blueprint/FlowGraph/FlowActor/BP_FlowInteractActor.BP_FlowInteractActor_C"));
    const nativeValid=native.prototype.IsValidInteract;
    class CodexInanisInteraction{
        IsValidInteract(withActor){return active()&&nativeValid.call(this,withActor);}
        OnInteract(){return interact(this);}
    }
    // A private subclass leaves every native campaign interaction unchanged.
    interactionClass=puerts.blueprint.mixin(native,CodexInanisInteraction,{inherit:true,objectTakeByNative:true}).StaticClass();
    return interactionClass;
}
function tick(context,session){
    if(!session.boss.training||!session.worldLoadingComplete||session.arrivalAnchorPending)return;
    if((session.trainingTicks||0)%30!==0)return;
    const out=puerts.$ref(UE.NewArray(UE.Actor));
    const klass=UE.Class.Load("/Game/PBZContent/Blueprint/FlowGraph/FlowActor/BP_NPCSpawner.BP_NPCSpawner_C");
    UE.GameplayStatics.GetAllActorsOfClass(context,klass,out);const actors=puerts.$unref(out);
    for(let i=0;i<actors.Num();i++){
        const spawner=actors.Get(i);if(!spawner.GetName().endsWith(spawnerSuffix))continue;
        // Preserve SpawnSphere: disabling the whole spawner also removes the NPC.
        spawner.SetActorEnableCollision(true);
        if(spawner.InteractSphere){spawner.InteractSphere.SetGenerateOverlapEvents(false);spawner.InteractSphere.SetCollisionEnabled(UE.ECollisionEnabled.NoCollision);}
        if(spawner.InteractWidget)spawner.InteractWidget.SetVisibility(false);
        let npc=spawner.GetSpawnedNPCActor();
        if(!valid(npc)&&Date.now()-(session.inanisSpawnRequested||0)>4000){session.inanisSpawnRequested=Date.now();spawner.Spawn(true);npc=spawner.GetSpawnedNPCActor();}
        if(valid(npc)){
            npc.SetActorHiddenInGame(false);npc.SetActorEnableCollision(false);
            session.ux={...session.ux,inanisVisible:true};
        }
        if(valid(session.inanisInteraction))return;
        const transform=spawner.GetTransform(),player=UE.GameplayStatics.GetPlayerCharacter(context,0);
        const actor=UE.GameplayStatics.BeginDeferredActorSpawnFromClass(context,getClass(),transform,UE.ESpawnActorCollisionHandlingMethod.AlwaysSpawn,player);
        if(!valid(actor))throw Error("The Inanis interaction could not be created");
        actor.InteractText=new UE.FlowLocText("","",cpp.FText.FromString("BOSSES"));actor.SimpleInteract=true;
        actor.DisplayPointDistance=650;actor.StrafeDistance=0;
        UE.GameplayStatics.FinishSpawningActor(actor,transform);
        actor.SetActorEnableCollision(true);actor.InteractSphere.SetSphereRadius(450,true);
        actor.InteractSphere.SetGenerateOverlapEvents(true);actor.InteractSphere.SetCollisionEnabled(UE.ECollisionEnabled.QueryOnly);
        // This actor supplies only the native interaction prompt; Inanis herself
        // remains the game's animated NPC, at her authored position.
        for(const key of ["StaticMesh","SkeletalMesh","Niagara"])if(actor[key])actor[key].SetVisibility(false);
        session.inanisInteraction=actor;
        session.ux={...session.ux,inanisInteractionReady:true};
        return;
    }
}
exports.configure=configure;exports.tick=tick;exports.interact=interact;
