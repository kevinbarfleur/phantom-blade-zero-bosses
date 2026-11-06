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
    if(session.introPresentation?.owner!==owner)session.introPresentation={owner,widget,boss:session.boss,started:false,released:false};
    // The authored finish function resumes input and fires the combat output
    // immediately, then optionally pushes a timed story black screen. Disable
    // only that option on this runtime intro node, never its loading cover.
    if(node.BlackAfterFinish===true){
        const duration=node.BlackDuration;node.BlackAfterFinish=false;
        session.ux={...session.ux,introExitBlackSuppressed:true,introExitBlackDuration:duration,introExitSequence:sequencePath};
    }
}
function hideAdditionalIntroLoading(context,session,state){
    if(state.additional||!session.worldLoadingComplete||session.arrivalAnchorPending||!session.ux?.directReady||!UE.PBZTeleportCoverSubsystem||UE.PBZTeleportCoverSubsystem.IsAnyTeleportCoverActive(context))return;
    const cls=UE.Class.Find('/Game/PBZContent/UI/Hud/WB_AdditionalLoading.WB_AdditionalLoading_C');if(!cls)return;
    const manager=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZUIManagerSubsystem.StaticClass()),tag=new UE.GameplayTag();tag.TagName='UI.Layer.Menu';
    const widget=manager?.GetActivateWidgetByLayer(tag,cls);
    if(!widget||!UE.KismetSystemLibrary.IsValid(widget)||!widget.IsActivated())return;
    // This native widget is an optional presentation overlay (the game even
    // provides PBZ.UI.Hide.AdditionLoading). Keep its lifetime and callbacks;
    // suppress only this instance after native intro/input/arrival release.
    state.additional={widget,opacity:widget.GetRenderOpacity()};widget.SetRenderOpacity(0);
    session.ux={...session.ux,introAdditionalLoadingHidden:true};
}
function restoreHiddenSurface(surface){
    const widget=surface?.widget;
    if(!surface||surface.opacityRestored||!UE.KismetSystemLibrary.IsValid(widget))return;
    if(!widget.IsActivated()&&!widget.IsVisible()){
        if(widget.GetRenderOpacity()===0)widget.SetRenderOpacity(surface.opacity);
        surface.opacityRestored=true;
    }
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
        restoreHiddenSurface(state.additional);
        if(session.active&&!session.completed&&session.mode==='direct-fight'&&state.boss===session.boss&&Date.now()-state.releasedAt<2000)hideAdditionalIntroLoading(context,session,state);
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
    hideAdditionalIntroLoading(context,session,state);
}
// An activated sequencer can still be transparent while its assets arrive.
// Arrival must already yield ownership then, before its first visible frame.
function pending(context){
    const cls=UE.Class.Find(path);if(!cls)return false;
    const manager=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZUIManagerSubsystem.StaticClass());
    const tag=new UE.GameplayTag();tag.TagName="UI.Layer.Sequence";
    const widget=manager&&manager.GetActivateWidgetByLayer(tag,cls);
    return !!widget&&UE.KismetSystemLibrary.IsValid(widget)&&widget.IsActivated();
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
exports.prepareIntroduction=prepareIntroduction;
exports.releaseIntroduction=releaseIntroduction;
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
