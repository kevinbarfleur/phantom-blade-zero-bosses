"use strict";
const UE=require("ue"),cpp=require("cpp"),puerts=require("puerts");
const text=s=>cpp.FText.FromString(s);
function valid(object){try{return !!object&&UE.KismetSystemLibrary.IsValid(object);}catch(_){return false;}}
function configure(widget,session,boss){
    const root=UE.Widget.Find("Overlay_61",widget.WidgetTree);
    const cls=UE.Class.Load("/Game/PBZContent/UI/UINew/HUD/W_LongPressButton.W_LongPressButton_C");
    const button=UE.WidgetBlueprintLibrary.Create(widget,cls,UE.GameplayStatics.GetPlayerController(widget,0));
    widget.codexHoldButton=button;
    const slot=root.AddChildToOverlay(button),padding=new UE.Margin();
    slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Right);
    slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Bottom);
    padding.Right=180;padding.Bottom=170;slot.SetPadding(padding);
    widget.codexDifficulty=session.difficulty||2;
    widget.codexAutoNext=!!session.autoNext;
    let completed=false,closed=false,timer=null;
    const bindings=[],qaTimeouts=[];let qaProgress=null;
    const feedback={holding:false,playing:0,lastProgress:0,charge:null,finish:null};
    const soundSystem=()=>UE.SubsystemBlueprintLibrary.GetWorldSubsystem(widget,UE.PBZSoundFXSubsystem.StaticClass());
    const stopFeedback=()=>{
        feedback.holding=false;
        if(feedback.playing){try{soundSystem()?.PBZStopPlayingID(feedback.playing,0);}catch(_){}feedback.playing=0;}
    };
    const startFeedback=()=>{
        if(closed||completed)return;feedback.holding=true;
        if(feedback.playing||!feedback.charge)return;
        try{feedback.playing=soundSystem()?.PBZPostEventGlobal(feedback.charge,undefined)||0;session.ux={...session.ux,nativeHoldFeedbackStarted:!!feedback.playing};}
        catch(error){session.ux={...session.ux,holdFeedbackError:String(error)};}
    };
    const progressFeedback=progress=>{
        if(progress>feedback.lastProgress&&progress>0&&progress<1)startFeedback();
        else if(progress<feedback.lastProgress||progress===0)stopFeedback();
        feedback.lastProgress=progress;
    };
    const feedbackBindings=[[button.UpdateHoldPercent,progressFeedback],[button.ButtonPressed,startFeedback],[button.ButtonReleased,stopFeedback],[button.OnHoldReset,stopFeedback]];
    for(const [delegate,handler]of feedbackBindings)delegate?.Add(handler);
    const label='MAINTENEZ <UIRowName id="UpgradeHold" height="24" LeftPadding="0" RightPadding="0"/> POUR AFFRONTER';
    const select=value=>{
        if(completed||closed)return;
        if(widget.codexDifficulty===value)return;
        widget.codexDifficulty=value;
        const entry=widget[["Easy","Normal","Hard"][value-1]];
        if(entry.SetIsSelected)entry.SetIsSelected(true,false);
        if(widget.SelectedButton)widget.SelectedButton(value-1);
        button.ButtonResetHoldPercentage();button.Init(true,text(label),1);
    };
    for(const [id,value] of [["Easy",1],["Normal",2],["Hard",3]]){
        const entry=widget[id];
        entry.OnButtonBaseClicked.Clear();
        const handler=()=>select(value);bindings.push({id,handler});
        entry.OnButtonBaseClicked.Add(handler);
        entry.OnButtonBaseFocused.Add(handler);
    }
    button.Init(true,text(label),1);
    const helper=require("../Library/UIHelper").default;
    button.InputPriority=100;
    button.SetTriggeringInputAction(helper.MakePBZInputDataTableHandle("UpgradeHold"));
    // The game uses this navigation config for the same reason on equipment
    // pickups: Slate's short Space accept must not consume a held action.
    let navApplied=false;
    const path=UE.KismetSystemLibrary.MakeSoftObjectPath("/Game/PBZContent/UI/Config/DA_PickupNavigationConfig.DA_PickupNavigationConfig");
    UE.PBZAssetManager.AsyncLoadObject(widget,path,puerts.toDelegate(widget,config=>{
        if(closed||!config||!widget.IsActivated())return;
        const manager=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(widget,UE.PBZUIManagerSubsystem.StaticClass());
        manager.SetNavigationConfig(config);navApplied=true;
    }));
    const complete=()=>{
        if(completed||closed)return;completed=true;
        stopFeedback();
        if(feedback.finish)try{soundSystem()?.PBZPostEventGlobal(feedback.finish,undefined);}catch(_){}
        if(require("./validation").ui)require("./validation").ui(widget,"hold-completed",session,{difficulty:widget.codexDifficulty});
        widget["Change Difficult Delegate"].Broadcast(widget.codexDifficulty,false);
        // The launch owner keeps this screen covering the selector while the
        // loadout and encounter checkpoint are written. Back still closes it.
        if(!widget.codexRetainOnConfirm)widget.DeactivateWidget();
    };
    const cleanup=()=>{
        closed=true;
        stopFeedback();
        for(const [delegate,handler]of feedbackBindings)delegate?.Remove(handler);
        if(timer!==null)clearInterval(timer);
        for(const id of qaTimeouts)clearTimeout(id);
        if(qaProgress!==null)clearInterval(qaProgress);
        widget.BP_OnWidgetDeactivated.Remove(cleanup);
        button.CompleteHold.Remove(complete);
        for(const {id,handler}of bindings){widget[id].OnButtonBaseClicked.Remove(handler);widget[id].OnButtonBaseFocused.Remove(handler);}
        button.ButtonResetHoldPercentage();
        if(navApplied){const manager=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(widget,UE.PBZUIManagerSubsystem.StaticClass());manager.SetDefaultNavigationConfig();navApplied=false;}
        button.RemoveFromParent();widget.codexHoldButton=null;
    };
    widget.BP_OnWidgetDeactivated.Add(cleanup);
    button.CompleteHold.Add(complete);
    session.ux={...session.ux,holdSeconds:button.GetRequiredHoldTime(),nativeHold:true};
    if(boss){
        const heading=UE.NewObject(UE.TextBlock.StaticClass(),widget),headingSlot=root.AddChildToOverlay(heading),hp=new UE.Margin();hp.Left=155;hp.Top=475;
        headingSlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);headingSlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);headingSlot.SetPadding(hp);
        heading.SetText(text("ENCHAÎNEMENT AUTOMATIQUE"));if(widget.Desc1)heading.SetFont(widget.Desc1.Font);heading.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
        const line=UE.NewObject(UE.Image.StaticClass(),widget),lineSlot=root.AddChildToOverlay(line),lp=new UE.Margin();lp.Left=155;lp.Top=450;
        line.SetDesiredSizeOverride(new UE.Vector2D(650,1));line.SetColorAndOpacity(new UE.LinearColor(1,1,1,0.25));line.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
        lineSlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);lineSlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);lineSlot.SetPadding(lp);
        const toggle=UE.WidgetBlueprintLibrary.Create(widget,widget.Normal.GetClass(),UE.GameplayStatics.GetPlayerController(widget,0));
        const size=UE.NewObject(UE.SizeBox.StaticClass(),widget);size.SetWidthOverride(650);size.AddChild(toggle);
        const toggleSlot=root.AddChildToOverlay(size),tp=new UE.Margin();tp.Left=130;tp.Top=525;
        toggleSlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);toggleSlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);toggleSlot.SetPadding(tp);
        const refresh=()=>{toggle.SetButtonText(text(widget.codexAutoNext?"OUI · COMBAT SUIVANT":"NON · RETOUR À LA SÉLECTION"));toggle.SetIsSelected(widget.codexAutoNext,false);};
        const clicked=()=>{if(closed||completed)return;widget.codexAutoNext=!widget.codexAutoNext;refresh();};
        toggle.OnButtonBaseClicked.Add(clicked);refresh();widget.codexAutoNextButton=toggle;
        if(toggle.SetNavigationRuleExplicit&&widget.Hard.SetNavigationRuleExplicit){widget.Hard.SetNavigationRuleExplicit(UE.EUINavigation.Down,toggle);toggle.SetNavigationRuleExplicit(UE.EUINavigation.Up,widget.Hard);}
        const dispose=()=>{widget.BP_OnWidgetDeactivated.Remove(dispose);if(valid(toggle))toggle.OnButtonBaseClicked.Remove(clicked);for(const object of [size,heading,line])try{if(valid(object))object.RemoveFromParent();}catch(_){}widget.codexAutoNextButton=null;};
        widget.BP_OnWidgetDeactivated.Add(dispose);
    }
    // Same charge/success Wwise events and sound subsystem as native weapon
    // upgrades, including the game's existing motion/haptics routing/settings.
    for(const [key,name]of [["charge","SFX_UI_Int_LevelUp_Weapon_Charge"],["finish","SFX_UI_Int_LevelUp_Weapon_Success"]]){
        const asset=UE.KismetSystemLibrary.MakeSoftObjectPath("/Game/Wwise/Events/UI/UI_Int/UI_LevelUp/"+name+"."+name);
        UE.PBZAssetManager.AsyncLoadObject(widget,asset,puerts.toDelegate(widget,value=>{
            if(closed)return;feedback[key]=value;if(key==="charge"&&feedback.holding)startFeedback();
        }));
    }
    if(boss)try{
        const image=UE.NewObject(UE.Image.StaticClass(),widget);
        const imageSlot=root.AddChildToOverlay(image),m=new UE.Margin();m.Top=70;m.Right=145;
        imageSlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Right);imageSlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);imageSlot.SetPadding(m);
        image.SetDesiredSizeOverride(new UE.Vector2D(600,600));image.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
        const softPath=UE.KismetSystemLibrary.MakeSoftObjectPath(boss.halfPortrait||boss.portrait);
        image.SetBrushFromSoftTexture(UE.KismetSystemLibrary.Conv_SoftObjPathToSoftObjRef(softPath),false);
        const title=UE.NewObject(UE.TextBlock.StaticClass(),widget),titleSlot=root.AddChildToOverlay(title),p=new UE.Margin();p.Left=1020;p.Top=710;p.Right=120;
        titleSlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);titleSlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);titleSlot.SetPadding(p);
        const helper=require("../Library/UIHelper").default;
        const name=boss.label||UE.KismetTextLibrary.Conv_TextToString(helper.GetTextByID(boss.nameKey));
        title.SetText(text((name.split(",")[0]+(boss.variant?" · "+boss.variant:"")).toLocaleUpperCase("fr-FR")));
        if(widget.Desc1)title.SetFont(widget.Desc1.Font);
        title.SetJustification(UE.ETextJustify.Center);title.SetAutoWrapText(true);title.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
        if(widget.Desc2)widget.Desc2.SetAutoWrapText(true);
        const heading=UE.NewObject(UE.TextBlock.StaticClass(),widget),headingSlot=root.AddChildToOverlay(heading),hp=new UE.Margin();hp.Left=95;hp.Top=70;
        headingSlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);headingSlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);headingSlot.SetPadding(hp);
        heading.SetText(text("DIFFICULTÉ"));if(widget.Desc1)heading.SetFont(widget.Desc1.Font);heading.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
        session.ux.difficultyPortrait=true;
    }catch(error){session.ux.portraitError=String(error);}
    if(["flow","review","training"].includes(require("./qa-config").mode)){
        // Exercise the same native progress handler as real CommonUI input:
        // release at half progress, then complete one full 1.5 second hold.
        qaTimeouts.push(setTimeout(()=>{if(!closed){button.OnActionProgress(0.5);session.ux.cancelCheck="half-progress";}},6000));
        qaTimeouts.push(setTimeout(()=>{if(!closed){button.ButtonResetHoldPercentage();session.ux.cancelCheck="released-without-launch";}},11000));
        qaTimeouts.push(setTimeout(()=>{
            if(closed)return;
            const started=Date.now(),duration=button.GetRequiredHoldTime()*1000;
            qaProgress=setInterval(()=>{if(closed){clearInterval(qaProgress);return;}const progress=Math.min(1,(Date.now()-started)/duration);if(progress===1)session.ux.nativeProgressCompleted=true;button.UpdateHoldPercent.Broadcast(progress);button.OnActionProgress(progress);},33);
        },15000));
    }
    if(require("./validation").enabled){
        timer=setInterval(()=>{
            if(!UE.KismetSystemLibrary.IsValid(widget)){clearInterval(timer);return;}
            const pc=UE.GameplayStatics.GetPlayerController(widget,0);
            if(pc.IsInputKeyDown(new UE.Key("F10")))button.CompleteHold.Broadcast();
        },33);
    }
}
exports.configure=configure;
exports.beginLaunch=(widget,session)=>{
    widget.codexRetainOnConfirm=true;
    const root=UE.Widget.Find("Overlay_61",widget.WidgetTree),image=UE.NewObject(UE.Image.StaticClass(),widget),slot=root.AddChildToOverlay(image);
    slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);
    image.SetColorAndOpacity(new UE.LinearColor(0,0,0,1));image.SetVisibility(UE.ESlateVisibility.Visible);
    const controller=UE.GameplayStatics.GetPlayerController(widget,0);
    controller.PlayerCameraManager?.StartCameraFade(1,1,0,new UE.LinearColor(0,0,0,1),false,true);
    const selector=session.selectorWidget;
    const opacity=selector?.GetRenderOpacity?.()??1;
    if(selector&&UE.KismetSystemLibrary.IsValid(selector))selector.SetRenderOpacity(0);
    session.launchUI={widget,image,controller,selector,opacity};
    session.ux={...session.ux,launchScreenRetained:true};
};
exports.endLaunch=(session,failed=false)=>{
    const launch=session.launchUI;if(!launch)return;session.launchUI=null;
    // Old-world wrappers can already be released when the next GameMode starts.
    // Each cleanup is independent; a dead camera must not abort arrival setup.
    const cleanups=[
        [launch.image,image=>image.RemoveFromParent()],
        [launch.controller,controller=>{const camera=controller.PlayerCameraManager;if(valid(camera))camera.StartCameraFade(1,0,0.15,new UE.LinearColor(0,0,0,1),false,false);}],
        [launch.selector,selector=>selector.SetRenderOpacity(launch.opacity)],
        ...(failed?[[launch.widget,widget=>widget.DeactivateWidget()]]:[])
    ];
    for(const [object,cleanup]of cleanups)try{if(valid(object))cleanup(object);}catch(_){}
};
