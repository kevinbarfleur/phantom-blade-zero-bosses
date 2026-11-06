"use strict";
const UE=require("ue"),puerts=require("puerts");
const path="/Game/PBZContent/Blueprint/FlowGraph/UI/WBP_FlowSequencer.WBP_FlowSequencer_C";
function prepareIntroduction(widget,session){
    if(!session.active||session.completed||session.boss?.training||session.mode!=="direct-fight")return;
    const expected=[...(session.boss?.profile?.directEntry?.sequences||[]),...(session.boss?.profile?.automaticIntroduction||[])];
    const sequence=widget.InLevelSeq,node=widget["In Level Sequence Node"]||widget.InLevelSequenceNode;
    if(!sequence)return;
    const sequencePath=UE.KismetSystemLibrary.GetPathName(sequence);
    session.ux={...session.ux,observedIntroduction:sequencePath};
    if(!node||!UE.KismetSystemLibrary.IsValid(node))return;
    if(!expected.length)return;
    if(!expected.some(p=>p.toLowerCase()===sequencePath.toLowerCase()))return;
    const owner=UE.KismetSystemLibrary.GetPathName(widget);
    if(session.introPresentation?.owner!==owner)session.introPresentation={owner,widget,node,boss:session.boss,started:false,released:false};
    // The authored finish function resumes input and fires the combat output
    // immediately, then optionally pushes a timed story black screen. Disable
    // only that option on this runtime intro node, never its loading cover.
    if(node.BlackAfterFinish===true){
        const duration=node.BlackDuration;node.BlackAfterFinish=false;
        session.ux={...session.ux,introExitBlackSuppressed:true,introExitBlackDuration:duration,introExitSequence:sequencePath};
    }
}
function outgoingSequence(queued,state,source){
    const node=queued?.['In Level Sequence Node']||queued?.InLevelSequenceNode;
    return source==='intro'&&state.released&&state.sequence&&state.node&&queued===state.widget&&queued.InLevelSeq===state.sequence&&node===state.node&&!queued.InLevelSeqPlayer?.IsPlaying();
}
function activeTemporaryLoading(context){
    const cls=UE.Class.Find('/Game/PBZContent/UI/Hud/WB_TempLoadingScreen.WB_TempLoadingScreen_C');if(!cls)return null;
    const manager=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZUIManagerSubsystem.StaticClass()),tag=new UE.GameplayTag();tag.TagName='UI.Layer.Menu';
    const widget=manager?.GetActivateWidgetByLayer(tag,cls);
    return widget&&UE.KismetSystemLibrary.IsValid(widget)&&widget.IsA?.(cls)&&widget.IsActivated()?widget:null;
}
function entryLoadingActive(context,session){
    if(!session.active||session.completed||session.mode!=='direct-fight'||session.boss?.training||!session.boss?.profile?.directEntry)return false;
    const now=Date.now(),intro=session.introPresentation;
    const states=[session.directArrival,intro?.boss===session.boss?intro:null];
    for(const state of states){
        if(!state||state.loadingFollowupCancelled||state.additional)continue;
        const source=state===intro?'intro':'arrival',followup=state.loadingFollowup;
        const age=now-state.releasedAt;
        const initial=state.released?Number.isFinite(age)&&age>=0&&age<2000:source==='intro'?state.started:state.coverRequested;
        const tracked=followup&&now-followup.startedAt<=90000&&(!followup.finishedAt||now-followup.finishedAt<2000);
        if(!initial&&!tracked)continue;
        const queued=activeSequenceWidget(context);
        if(state.released&&queued&&!outgoingSequence(queued,state,source))continue;
        const temporary=activeTemporaryLoading(context);
        if(temporary&&(!followup||temporary===followup.widget))return true;
        // A transparent activated loading widget still owns native input.
        // Never treat pause, equipment, QTE or hit-reaction input as loading.
        let previousActive=false;
        try{previousActive=!!followup&&UE.KismetSystemLibrary.IsValid(followup.widget)&&followup.widget.IsActivated();}catch(_){}
        if(!temporary&&!previousActive){
            const cls=UE.Class.Find('/Game/PBZContent/UI/Hud/WB_AdditionalLoading.WB_AdditionalLoading_C');
            const manager=cls&&UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZUIManagerSubsystem.StaticClass()),tag=new UE.GameplayTag();tag.TagName='UI.Layer.Menu';
            const widget=manager?.GetActivateWidgetByLayer(tag,cls);
            if(widget&&UE.KismetSystemLibrary.IsValid(widget)&&widget.IsA?.(cls)&&widget.IsActivated())return true;
        }
    }
    return false;
}
function releaseTransitionLoading(context,session,state,source){
    if(state.additional||state.loadingFollowupCancelled||!Number.isFinite(state.releasedAt)||!UE.PBZLevelSequenceManager||!UE.PBZTeleportCoverSubsystem)return;
    const now=Date.now(),followup=state.loadingFollowup;
    if(followup?.finishedAt&&now-followup.finishedAt>=2000)return;
    if(!followup&&(now-state.releasedAt<0||now-state.releasedAt>=2000))return;
    const queued=activeSequenceWidget(context);
    const manager=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.PBZLevelSequenceManager.StaticClass()),player=UE.GameplayStatics.GetPlayerCharacter(context,0);
    const tag=new UE.GameplayTag();tag.TagName='CharacterState.InLevelSequence';
    if((queued&&!outgoingSequence(queued,state,source))||manager?.IsInSequence()||UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(player)?.HasMatchingGameplayTag(tag)){
        if(state.loadingFollowup)state.loadingFollowupCancelled=true;return;
    }
    if(followup){
        if(now-followup.startedAt>90000){state.loadingFollowupCancelled=true;return;}
        if(!followup.finishedAt){
            const active=activeTemporaryLoading(context);
            // Follow only the exact cover seen at this arrival/intro boundary.
            // Never deactivate it, skip native loading, or adopt another cover.
            if(active&&active!==followup.widget){state.loadingFollowupCancelled=true;return;}
            let stillActive=false;try{stillActive=UE.KismetSystemLibrary.IsValid(followup.widget)&&followup.widget.IsActivated();}catch(_){}
            if(active===followup.widget||stillActive)return;
            followup.finishedAt=now;
            session.ux={...session.ux,[source+'NativeLoadingFinished']:true};
        }
        if(now-followup.finishedAt>=2000)return;
    }else{
        const elapsed=now-state.releasedAt;if(elapsed<0||elapsed>=2000)return;
        const widget=activeTemporaryLoading(context);
        if(widget){
            state.loadingFollowup={widget,startedAt:now};
            session.ux={...session.ux,[source+'NativeLoadingObserved']:true};
            return;
        }
    }
    releaseAdditionalLoading(context,session,state,source);
}
function releaseAdditionalLoading(context,session,state,source){
    if(state.additional||!UE.PBZLevelSequenceManager||!session.worldLoadingComplete||session.arrivalAnchorPending||!session.ux?.directReady||!UE.PBZTeleportCoverSubsystem||UE.PBZTeleportCoverSubsystem.IsAnyTeleportCoverActive(context))return;
    // A later phase may begin during this short post-intro window. Its native
    // input/streaming ownership must not be released by the previous intro.
    const sequences=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.PBZLevelSequenceManager.StaticClass()),player=UE.GameplayStatics.GetPlayerCharacter(context,0);
    if(!sequences||!player||sequences.IsInSequence())return;
    const sequenceTag=new UE.GameplayTag();sequenceTag.TagName='CharacterState.InLevelSequence';
    if(UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(player)?.HasMatchingGameplayTag(sequenceTag))return;
    const queued=activeSequenceWidget(context);
    if(queued){
        // The just-finished outgoing widget may still be active until native
        // cleanup returns. It is safe only while both its sequence and flow
        // node still identify this intro and its player has stopped. A pooled
        // widget reused for a queued next phase must retain that phase's cover.
        if(!outgoingSequence(queued,state,source))return;
    }
    const cls=UE.Class.Find('/Game/PBZContent/UI/Hud/WB_AdditionalLoading.WB_AdditionalLoading_C');if(!cls)return;
    const manager=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZUIManagerSubsystem.StaticClass()),tag=new UE.GameplayTag();tag.TagName='UI.Layer.Menu';
    const widget=manager?.GetActivateWidgetByLayer(tag,cls);
    if(!widget||!UE.KismetSystemLibrary.IsValid(widget)||!widget.IsActivated())return;
    // WB_AdditionalLoading has only a ten-second presentation timer whose
    // completion calls DeactivateWidget. Making it transparent leaves its
    // modal input routing alive for those ten seconds. Complete that exact
    // native lifecycle once real loading and cinematic ownership have ended;
    // do not reset controller locks, sequence tags or global input routing.
    state.additional={widget,totalTime:widget.TotalTime,maxLoadTime:widget.MaxLoadTime};
    widget.DeactivateWidget();
    session.ux={...session.ux,[source+'AdditionalLoadingReleased']:true,[source+'AdditionalLoadingTimer']:state.additional.totalTime};
}
function releaseArrivalLoading(context,session){
    const state=session.directArrival;
    if(!session.active||session.completed||session.boss?.training||session.mode!=='direct-fight'||!state?.released||!Number.isFinite(state.releasedAt))return;
    if(session.cinematicActive||pending(context)){state.loadingFollowupCancelled=true;return;}
    releaseTransitionLoading(context,session,state,'arrival');
}
function releaseIntroduction(context,session){
    const state=session.introPresentation;
    if(state?.released){
        // A pooled widget must be usable by a later scene. Restore its own
        // opacity only once the outgoing surface is natively hidden, or when
        // the game has assigned a different sequence to that widget.
        const widget=state.widget;
        if(!state.opacityRestored&&UE.KismetSystemLibrary.IsValid(widget)&&((!widget.IsActivated()&&!widget.IsVisible())||(widget.InLevelSeq&&widget.InLevelSeq!==state.sequence))){
            if(widget.GetRenderOpacity()===0)widget.SetRenderOpacity(state.opacity);
            state.opacityRestored=true;
        }
        if(session.active&&!session.completed&&session.mode==='direct-fight'&&state.boss===session.boss)releaseTransitionLoading(context,session,state,'intro');
        return;
    }
    if(!state||state.released||!session.active||session.completed||state.boss!==session.boss||session.mode!=="direct-fight"||!UE.PBZLevelSequenceManager)return;
    const manager=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.PBZLevelSequenceManager.StaticClass()),player=UE.GameplayStatics.GetPlayerCharacter(context,0);
    if(!manager||!player)return;
    const tag=new UE.GameplayTag();tag.TagName="CharacterState.InLevelSequence";
    const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(player),native=manager.IsInSequence()||!!asc?.HasMatchingGameplayTag(tag);
    if(native){state.started=true;return;}
    if(!state.started)return;
    // The flow has restored gameplay, including its own native input tag.
    // Remove only the outgoing intro surface and its residual camera fade.
    // Keep the native deactivation/streaming/media cleanup running normally.
    if(UE.KismetSystemLibrary.IsValid(state.widget)){
        if(state.widget.InLevelSeqPlayer?.IsPlaying())return;
        state.opacity=state.widget.GetRenderOpacity?.()??1;state.sequence=state.widget.InLevelSeq;
        state.widget.SetRenderOpacity(0);
    }
    UE.GameplayStatics.GetPlayerController(context,0)?.PlayerCameraManager?.StopCameraFade();
    state.released=true;state.releasedAt=Date.now();session.ux={...session.ux,introPresentationReleased:true};
    releaseTransitionLoading(context,session,state,'intro');
}
// An activated sequencer can still be transparent while its assets arrive.
// Arrival must already yield ownership then, before its first visible frame.
function activeSequenceWidget(context){
    const cls=UE.Class.Find(path);if(!cls)return null;
    const manager=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZUIManagerSubsystem.StaticClass());
    const tag=new UE.GameplayTag();tag.TagName="UI.Layer.Sequence";
    const widget=manager&&manager.GetActivateWidgetByLayer(tag,cls);
    return widget&&UE.KismetSystemLibrary.IsValid(widget)&&widget.IsActivated()?widget:null;
}
function pending(context){return !!activeSequenceWidget(context);}
// A queued/activated sequence widget does not prove that the native camera
// has its first shot. Arrival may yield placement immediately, but must keep
// its reveal covered until actual playback. Dialogue and tag-only native
// presentations keep their existing ownership and are not forced or skipped.
function introductionReady(context,session){
    if(session.cinemaSource!=='sequence')return true;
    const cls=UE.Class.Find(path);if(!cls)return false;
    const manager=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZUIManagerSubsystem.StaticClass()),tag=new UE.GameplayTag();tag.TagName='UI.Layer.Sequence';
    const widget=manager?.GetActivateWidgetByLayer(tag,cls);
    if(!widget||!UE.KismetSystemLibrary.IsValid(widget)||!widget.IsActivated())return false;
    if(!widget.InLevelSeqPlayer?.IsPlaying()||!UE.PBZLevelSequenceManager)return false;
    return !!UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.PBZLevelSequenceManager.StaticClass())?.IsInSequence();
}
function tick(context,session){
    if(!session.active)return false;
    releaseIntroduction(context,session);
    if(session.completed&&UE.WidgetBlueprintLibrary?.GetAllWidgetsOfClass){
        const videoClass=UE.Class.Find("/Game/PBZContent/Blueprint/FlowGraph/UI/WBP_FlowVideo.WBP_FlowVideo_C");
        if(videoClass){
            const out=puerts.$ref(UE.NewArray(UE.UserWidget));UE.WidgetBlueprintLibrary.GetAllWidgetsOfClass(context,out,videoClass,false);
            const widgets=puerts.$unref(out);
            for(let i=0;i<widgets.Num();i++){
                const video=widgets.Get(i);
                if(!UE.KismetSystemLibrary.IsValid(video)||!video.IsActivated()||!video.IsVisible())continue;
                session.cinemaSource="video";
                // The native hold handler ends the movie, broadcasts its flow
                // completion and deactivates the widget. Press Skip is a
                // different function that returns to the campaign main menu.
                if(video.LevelSequencePlayer&&!video.IsAnyAnimationPlaying()&&Date.now()-(session.lastVideoSkip||0)>1500){
                    session.lastVideoSkip=Date.now();video["Action Progress_Event"](1);
                    session.videosSkipped=(session.videosSkipped||0)+1;
                }
                return true;
            }
        }
    }
    const cls=UE.Class.Find(path);
    if(cls){
        const manager=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZUIManagerSubsystem.StaticClass());
        const tag=new UE.GameplayTag();tag.TagName="UI.Layer.Sequence";
        const widget=manager&&manager.GetActivateWidgetByLayer(tag,cls);
        if(widget&&UE.KismetSystemLibrary.IsValid(widget)&&widget.IsActivated()&&(!widget.GetRenderOpacity||widget.GetRenderOpacity()>0.01)){
            prepareIntroduction(widget,session);
            session.cinemaSource="sequence";
            // Use the game's own skip action: it advances to an authored skip
            // marker, waits for the media frame, then restores gameplay state.
            // Non-skippable sequences and QTE segments keep their native rules.
            if((session.completed||session.skipIntroduction)&&widget.CanSkip&&!widget.IsAnyAnimationPlaying()&&Date.now()-(session.lastCinematicSkip||0)>1500){
                session.lastCinematicSkip=Date.now();widget.ActionProgress(1);
                session.cinematicsSkipped=(session.cinematicsSkipped||0)+1;
            }
            return true;
        }
    }
    const dialogueClass=UE.Class.Find("/Game/PBZContent/Blueprint/FlowGraph/UI/WBP_FlowDialog.WBP_FlowDialog_C");
    if(dialogueClass){
        const pipeline=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.EventPipelineManager.StaticClass());
        const dialogue=pipeline&&pipeline.DialogueWidget;
        if(dialogue&&UE.KismetSystemLibrary.IsValid(dialogue)&&dialogue.IsA(dialogueClass)&&dialogue.IsActivated()&&dialogue.IsVisible()&&(!dialogue.GetRenderOpacity||dialogue.GetRenderOpacity()>0.01)){
            const content=puerts.$ref(false);dialogue.HasContent(dialogue.DialogueFlowContentData,content);
            if(puerts.$unref(content)){
                session.cinemaSource="dialogue";
                if((session.completed||session.skipIntroduction||session.mode==="direct-fight")&&dialogue.CanSkip&&Date.now()-(session.lastDialogueSkip||0)>1500){session.lastDialogueSkip=Date.now();dialogue.SkipCurrentLine();}
                return true;
            }
        }
    }
    const player=UE.GameplayStatics.GetPlayerCharacter(context,0);
    if(!player)return true;
    const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(player),tag=new UE.GameplayTag();tag.TagName="CharacterState.InLevelSequence";
    const active=!!asc&&asc.HasMatchingGameplayTag(tag);session.cinemaSource=active?"player-state":null;return active;
}
exports.tick=tick;
exports.pending=pending;
exports.introductionReady=introductionReady;
exports.prepareIntroduction=prepareIntroduction;
exports.releaseIntroduction=releaseIntroduction;
exports.releaseArrivalLoading=releaseArrivalLoading;
exports.entryLoadingActive=entryLoadingActive;
exports.presentationActive=context=>{
    if(!UE.WidgetBlueprintLibrary?.GetAllWidgetsOfClass)return false;
    for(const name of ["W_BossDead","W_BossDead_Red"]){
        const cls=UE.Class.Find("/Game/PBZContent/UI/InGame/Dead/"+name+"."+name+"_C");if(!cls)continue;
        const out=puerts.$ref(UE.NewArray(UE.UserWidget));UE.WidgetBlueprintLibrary.GetAllWidgetsOfClass(context,out,cls,false);
        const widgets=puerts.$unref(out);
        for(let i=0;i<widgets.Num();i++){const w=widgets.Get(i);if(w.IsVisible()&&w.GetRenderOpacity()>0.01)return true;}
    }
    return false;
};
