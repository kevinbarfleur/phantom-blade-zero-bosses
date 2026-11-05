"use strict";
const UE=require("ue"),puerts=require("puerts");
const cinema=require("./cinema");
function valid(object){return !!object&&UE.KismetSystemLibrary.IsValid(object);}
function event(session,name){
    session.ux={...session.ux,arrivalEvents:[...(session.ux?.arrivalEvents||[]),{name,time:Date.now()}].slice(-16)};
}
function yieldToIntroduction(context,session,state){
    const active=cinema.tick(context,session);
    const pending=cinema.pending(context);
    if(!active&&!pending&&!state.introPending)return false;
    if(!state.introPending){
        state.introPending=true;state.introWait=0;state.superseded=true;
        session.arrivalAnchorPending=false;event(session,"native-intro-owns-arrival");
        if(valid(state.widget))state.widget.DeactivateWidget();
    }
    session.cinematicActive=active;
    if(active){session.ux={...session.ux,directIntroObserved:true,directReady:true};release(session);}
    // Native preparation can take longer than ten seconds. A still-activated
    // sequence retains ownership; elapsed time must never restart placement.
    else if(!pending&&++state.introWait>=3){session.ux={...session.ux,introPreparationCancelled:true,directReady:true};release(session);}
    return true;
}
function release(session){
    const state=session.directArrival;if(!state||state.released)return;
    state.released=true;
    if(valid(state.controller)){
        state.controller.SetIgnoreMoveInput(false);state.controller.SetIgnoreLookInput(false);
        if(state.controller.PlayerCameraManager)state.controller.PlayerCameraManager.StartCameraFade(1,0,0.3,new UE.LinearColor(0,0,0,1),false,false);
    }
}
function begin(context,session){
    release(session);
    const entry=session.boss.profile.directEntry;
    if(!entry||session.boss.training){session.directArrival=null;return;}
    const controller=UE.GameplayStatics.GetPlayerController(context,0);
    if(!valid(controller))return;
    session.directArrival={controller,ticks:0,entry,placed:false,released:false,waypoint:0,coverRequested:false};
    controller.SetIgnoreMoveInput(true);controller.SetIgnoreLookInput(true);
    if(controller.PlayerCameraManager)controller.PlayerCameraManager.StartCameraFade(1,1,0,new UE.LinearColor(0,0,0,1),false,true);
}
function move(player,point){
    const hit=puerts.$ref(new UE.HitResult());
    player.CharacterMovement?.StopMovementImmediately();
    player.K2_SetActorLocation(new UE.Vector(point.X,point.Y,point.Z),false,hit,true);
}
function cover(context,session,state,player){
    if(yieldToIntroduction(context,session,state))return;
    state.coverRequested=true;
    event(session,"streaming-cover-requested");
    const path=UE.KismetSystemLibrary.MakeSoftClassPath("/Game/PBZContent/UI/Hud/WB_TempLoadingScreen.WB_TempLoadingScreen_C");
    const klass=UE.KismetSystemLibrary.Conv_SoftClassPathToSoftClassRef(path),tag=new UE.GameplayTag();tag.TagName="UI.Layer.Menu";
    const action=UE.AsyncAction_PushContentToLayerForPlayer.PushContentToLayerForPlayer(state.controller,klass,tag,true);
    state.action=action;
    action.BeforePush.Add(widget=>{
        if(session.directArrival!==state||state.released)return;
        state.widget=widget;
        if(yieldToIntroduction(context,session,state))return;
        const load=state.entry.crossing||state.target;
        widget['Target Location']=new UE.Vector(load.X,load.Y,load.Z);
        widget.BP_OnWidgetDeactivated.Add(()=>{
            if(session.directArrival!==state||state.released||state.superseded)return;
            session.ux={...session.ux,nativeArrivalLoaded:true};
            event(session,"streaming-cover-finished");
            if(state.entry.crossing&&!session.cinematicActive){state.streamingReady=true;state.crossingTicks=0;return;}
            session.ux.directReady=true;
            release(session);
        });
    });
    action.AfterPush.Add(widget=>{
        if(session.directArrival!==state||state.released||!valid(player)){
            if(valid(widget))widget.DeactivateWidget();return;
        }
        if(state.superseded||yieldToIntroduction(context,session,state)){
            if(valid(widget||state.widget))(widget||state.widget).DeactivateWidget();return;
        }
        // Reuse the native streaming/landing cover, without invoking a second
        // gameplay teleport that can replace an already initialized boss pawn.
        player.CharacterMovement.StopMovementImmediately();
        player.CharacterMovement.SetMovementMode(UE.EMovementMode.MOVE_Flying);
        const rotation=new UE.Rotator(0,state.yaw,0);
        move(player,state.entry.crossing||state.target);
        state.controller.SetControlRotation(rotation);
    });
    action.Activate();
}
function tick(context,session){
    const state=session.directArrival;if(!state||state.released)return false;
    const player=UE.GameplayStatics.GetPlayerCharacter(context,0);if(!valid(player))return true;
    state.ticks++;
    // Check the live native state on every arrival tick and again in async
    // widget callbacks; the slower general cinematic poll is insufficient here.
    if(yieldToIntroduction(context,session,state))return true;
    if(state.streamingReady){
        if(session.cinematicActive){session.ux={...session.ux,directReady:true,directIntroObserved:true};release(session);return true;}
        state.crossingTicks++;
        // An entry delegate registered while the pawn was already inside can
        // miss its first overlap. Cross its authored boundary after landing,
        // while our fade and input lock still cover both moves.
        if(state.crossingTicks===3)move(player,state.entry.crossing);
        if(state.crossingTicks===4){move(player,state.target);session.ux={...session.ux,nativeEntryCrossed:true};event(session,"native-entry-crossed");}
        if(state.crossingTicks>=65){session.ux={...session.ux,directReady:true};release(session);}
        return true;
    }
    if(!session.cinematicActive&&!state.coverRequested){
        player.CharacterMovement.StopMovementImmediately();
        player.CharacterMovement.SetMovementMode(UE.EMovementMode.MOVE_Flying);
    }
    // The initial world save already requests this transform. A single placement
    // covers native bell-spawn correction; never pull the player out of a movie.
    if(!state.placed){
        if(session.cinematicActive){session.arrivalAnchorPending=false;session.ux={...session.ux,directIntroObserved:true};release(session);return true;}
        if(state.ticks<15)return true;
        // Load cinematic encounters just outside the authored entry volume.
        // The native streaming cover performs the first entry only after the
        // map is ready; an early introduction must not be lost to a second load.
        move(player,state.entry.crossing||state.entry.transform.Location);
        state.target=state.entry.transform.Location;
        const r=state.entry.transform.Rotation;state.yaw=r.Yaw;state.controller.SetControlRotation(new UE.Rotator(0,state.yaw,0));
        state.placed=true;session.arrivalAnchorPending=false;session.ux={...session.ux,directPlacement:true,directKind:state.entry.kind};
        return true;
    }
    if(session.cinematicActive&&!state.coverRequested){session.ux={...session.ux,directIntroObserved:true};release(session);return true;}
    const points=state.entry.waypoints||[];
    if(state.waypoint<points.length){
        if(state.ticks%15===0){
            const point=points[state.waypoint++];move(player,point);
            state.target=point;
            const arena=session.boss.profile.arena;
            if(arena){state.yaw=Math.atan2(arena.Y-point.Y,arena.X-point.X)*180/Math.PI;state.controller.SetControlRotation(new UE.Rotator(0,state.yaw,0));}
        }
        return true;
    }
    if(state.ticks>=60&&session.worldLoadingComplete&&!state.coverRequested)cover(context,session,state,player);
    return true;
}
exports.begin=begin;exports.tick=tick;exports.release=release;
