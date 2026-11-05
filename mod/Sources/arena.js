"use strict";
const UE=require("ue"),puerts=require("puerts");
const path="/Game/PBZContent/Blueprint/Item/BP_MelodiousBell.BP_MelodiousBell_C";
function tick(context,session){
    if(!session.active||session.boss.training||!session.boss.profile.arena)return;
    const cls=UE.Class.Find(path);if(!cls)return;
    const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);
    const bells=puerts.$unref(out),center=session.boss.profile.arena,managed=[];
    for(let i=0;i<bells.Num();i++){
        const bell=bells.Get(i);if(!UE.KismetSystemLibrary.IsValid(bell))continue;
        const at=bell.K2_GetActorLocation();
        if(Math.hypot(at.X-center.X,at.Y-center.Y,at.Z-center.Z)>10000)continue;
        // Keep the native checkpoint actor registered, but remove campaign
        // scenery, interaction and effects from the standalone fight.
        bell.SetActorHiddenInGame(true);bell.SetActorEnableCollision(false);
        for(const key of ["InteractionComp","SoundCollisionComp","CollisionBox"]){
            const component=bell[key];if(component)component.SetGenerateOverlapEvents(false);
        }
        if(bell.WidgetComp)bell.WidgetComp.SetVisibility(false,true);
        if(bell.NiagaraComponent){bell.NiagaraComponent.SetVisibility(false,true);bell.NiagaraComponent.Deactivate();}
        const children=[];
        const component=bell.ChildActor;
        if(component){
            if(typeof component.SetVisibility==="function")component.SetVisibility(false,true);
            // GetChildActor is an inline C++ accessor, absent from this build's
            // reflected JS API. Read the reflected property or enumerate the
            // owner's child actors, including children whose attachment failed.
            const child=component.ChildActor;
            if(child&&UE.KismetSystemLibrary.IsValid(child))children.push(child);
        }
        if(typeof bell.GetAllChildActors==="function"){
            const childRef=puerts.$ref(UE.NewArray(UE.Actor));bell.GetAllChildActors(childRef,true);
            const found=puerts.$unref(childRef);
            for(let j=0;j<found.Num();j++){const child=found.Get(j);if(child&&UE.KismetSystemLibrary.IsValid(child)&&!children.includes(child))children.push(child);}
        }
        for(const child of children){child.SetActorHiddenInGame(true);child.SetActorEnableCollision(false);}
        // Native CreateFXStringsActor creates these outside the bell's actor
        // hierarchy, so hiding the bell alone leaves floating red strings.
        for(const key of ["FXGuideLine_01","FXGuideLine_02"]){
            const guide=bell[key];if(!guide||!UE.KismetSystemLibrary.IsValid(guide))continue;
            guide.SetActorHiddenInGame(true);guide.SetActorEnableCollision(false);
            if(guide.Niagara){guide.Niagara.SetVisibility(false,true);guide.Niagara.Deactivate();}
        }
        managed.push({name:bell.GetName(),id:String(bell.BellID||""),hidden:!!bell.bHidden,childrenHidden:children.length});
    }
    session.ux={...session.ux,arenaBellsSuppressed:managed};
}
exports.tick=tick;
