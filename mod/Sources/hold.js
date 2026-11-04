"use strict";
const UE=require("ue"),cpp=require("cpp"),puerts=require("puerts");
const text=s=>cpp.FText.FromString(s);
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
    let completed=false,closed=false,timer=null;
    const bindings=[],qaTimeouts=[];let qaProgress=null;
    const label='MAINTENEZ <UIRowName id="UpgradeHold" height="24" LeftPadding="0" RightPadding="0"/> POUR AFFRONTER';
    const select=value=>{
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
        if(require("./validation").ui)require("./validation").ui(widget,"hold-completed",session,{difficulty:widget.codexDifficulty});
        widget["Change Difficult Delegate"].Broadcast(widget.codexDifficulty,false);
        widget.DeactivateWidget();
    };
    const cleanup=()=>{
        closed=true;
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
    session.ux={holdSeconds:button.GetRequiredHoldTime(),nativeHold:true};
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
    if(["ux","flow","review"].includes(require("./qa-config").mode)){
        // Exercise the same native progress handler as real CommonUI input:
        // release at half progress, then complete one full 1.5 second hold.
        qaTimeouts.push(setTimeout(()=>{if(!closed){button.OnActionProgress(0.5);session.ux.cancelCheck="half-progress";}},6000));
        qaTimeouts.push(setTimeout(()=>{if(!closed){button.ButtonResetHoldPercentage();session.ux.cancelCheck="released-without-launch";}},11000));
        qaTimeouts.push(setTimeout(()=>{
            if(closed)return;
            const started=Date.now(),duration=button.GetRequiredHoldTime()*1000;
            qaProgress=setInterval(()=>{if(closed){clearInterval(qaProgress);return;}const progress=Math.min(1,(Date.now()-started)/duration);if(progress===1)session.ux.nativeProgressCompleted=true;button.OnActionProgress(progress);},33);
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
