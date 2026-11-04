"use strict";
const UE=require("ue"),puerts=require("puerts");
const path="/Game/PBZContent/Blueprint/FlowGraph/UI/WBP_FlowSequencer.WBP_FlowSequencer_C";
function tick(context,session){
    if(!session.active)return false;
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
            session.cinemaSource="sequence";
            // Use the game's own skip action: it advances to an authored skip
            // marker, waits for the media frame, then restores gameplay state.
            // Non-skippable sequences and QTE segments keep their native rules.
            if(widget.CanSkip&&!widget.IsAnyAnimationPlaying()&&Date.now()-(session.lastCinematicSkip||0)>1500){
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
                if(dialogue.CanSkip&&Date.now()-(session.lastDialogueSkip||0)>1500){session.lastDialogueSkip=Date.now();dialogue.SkipCurrentLine();}
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
