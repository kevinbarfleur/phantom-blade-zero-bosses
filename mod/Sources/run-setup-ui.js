"use strict";
const UE=require('ue'),cpp=require('cpp'),puerts=require('puerts'),setup=require('./run-setup-model');
const text=value=>cpp.FText.FromString(value);
function valid(w){try{return !!w&&UE.KismetSystemLibrary.IsValid(w);}catch(_){return false;}}
function configure(widget,session,boss){
    const root=UE.Widget.Find('Overlay_61',widget.WidgetTree),controller=UE.GameplayStatics.GetPlayerController(widget,0),draft=setup.create(session);
    const owned=[],bindings=[],loads=[],feedback={playing:0,holding:false},rows=[];
    let closed=false,submitted=false,navApplied=false,updating=false;
    const bind=(delegate,handler)=>{delegate.Add(handler);bindings.push([delegate,handler]);};
    const panel=(object,left,top,width,height)=>{
        let host=object;if(width||height){host=UE.NewObject(UE.SizeBox.StaticClass(),widget);if(width)host.SetWidthOverride(width);if(height)host.SetHeightOverride(height);host.AddChild(object);}
        const slot=root.AddChildToOverlay(host),padding=new UE.Margin();padding.Left=left;padding.Top=top;
        slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);slot.SetPadding(padding);owned.push(host);return host;
    };
    const label=(value,left,top,width)=>{
        const object=UE.NewObject(UE.TextBlock.StaticClass(),widget);object.SetText(text(value));if(widget.Desc1)object.SetFont(widget.Desc1.Font);object.SetAutoWrapText(true);object.SetVisibility(UE.ESlateVisibility.HitTestInvisible);panel(object,left,top,width);return object;
    };
    const soundSystem=()=>UE.SubsystemBlueprintLibrary.GetWorldSubsystem(widget,UE.PBZSoundFXSubsystem.StaticClass());
    const stopFeedback=()=>{feedback.holding=false;if(feedback.playing){try{soundSystem()?.PBZStopPlayingID(feedback.playing,0);}catch(_){}feedback.playing=0;}};
    const button=UE.WidgetBlueprintLibrary.Create(widget,UE.Class.Load('/Game/PBZContent/UI/UINew/HUD/W_LongPressButton.W_LongPressButton_C'),controller);
    widget.codexHoldButton=button;widget.codexRunRows=rows;widget.codexRunDraft=draft;
    let help,hint;
    const sync=()=>{const value=setup.values(draft);widget.codexDifficulty=value.difficulty;widget.codexHits66=value.hits66;widget.codexAutoNext=value.autoNext;widget.codexTimerMode=value.timer;};
    const focus=id=>{
        if(closed||submitted)return;
        draft.focus=id;widget.codexRunFocus=id;sync();
        for(const row of rows){const selected=row.id===id;if(selected)row.background.OnSelected();else row.background['Not Selected']();row.title.OverrideTextColor(selected?row.template.SelectedColor:row.template.DefaultColor);row.title.SetOutlineOverrideEnabled(selected);row.rotator.SetSelectedAppearance(selected);for(const overlay of row.arrows)overlay.SetVisibility(selected?UE.ESlateVisibility.SelfHitTestInvisible:UE.ESlateVisibility.Hidden);}
        button.ButtonResetHoldPercentage();stopFeedback();
        const start=id==='start';button.Init(start,text(start?'MAINTENEZ POUR COMMENCER':'COMMENCER'),1);
        button.SetTriggeringInputAction(start?require('../Library/UIHelper').default.MakePBZInputDataTableHandle('UpgradeHold'):new UE.DataTableRowHandle());
        if(help)help.SetText(text(setup.description(draft,id)));
        if(hint)hint.SetText(text(start?'Maintenir · Commencer     Retour · Annuler':'Haut / Bas · Choisir     Gauche / Droite · Modifier     Retour · Annuler'));
    };
    const cleanup=()=>{
        if(closed)return;closed=true;stopFeedback();
        for(const [delegate,handler]of bindings)try{delegate.Remove(handler);}catch(_){}
        try{button.ButtonResetHoldPercentage();button.SetTriggeringInputAction(new UE.DataTableRowHandle());}catch(_){}
        if(navApplied)try{UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(widget,UE.PBZUIManagerSubsystem.StaticClass()).SetDefaultNavigationConfig();}catch(_){}
        for(const object of owned)try{if(valid(object))object.RemoveFromParent();}catch(_){}
        widget.codexHoldButton=null;widget.codexRunRows=null;
    };
    bind(widget.BP_OnWidgetDeactivated,cleanup);
    try{
        for(const id of ['Easy','Normal','Hard','Nightmare','Desc1','Desc2'])if(widget[id])widget[id].SetVisibility(UE.ESlateVisibility.Collapsed);
        for(const id of ['Easy','Normal','Hard','Nightmare'])if(widget[id]){widget[id].OnButtonBaseClicked.Clear();widget[id].SetIsFocusable(false);}
        label('CONFIGURATION DE LA RUN',145,110,850);
        const list=UE.NewObject(UE.VerticalBox.StaticClass(),widget);panel(list,120,230,860);
        const specs=[
            {id:'format',label:'PARCOURS',values:['fight','series'],labels:['COMBAT UNIQUE','SÉRIE DE BOSS']},
            {id:'difficulty',label:'DIFFICULTÉ',values:[1,2,3,4],labels:['VOYAGEUR','PIONNIER','EXPLORATEUR DES ENFERS','66 HITS']},
            {id:'timer',label:'CHRONOMÈTRE',values:[false,true],labels:['DÉSACTIVÉ','ACTIVÉ']}
        ];
        const replace=(original,fresh)=>{const parent=original.GetParent();original.RemoveFromParent();const slot=parent.AddChildToOverlay(fresh);slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);};
        for(const spec of specs){
            const template=UE.WidgetBlueprintLibrary.Create(widget,UE.Class.Load('/Game/PBZContent/UI/Settings/Editors/W_SettingsListEntry_Discrete.W_SettingsListEntry_Discrete_C'),controller);
            const find=name=>template[name]||UE.Widget.Find(name,template.WidgetTree),background=find('Background'),title=find('Text_SettingName'),original=find('Rotator_SettingValue');
            if(!background||!title||!original)throw Error('Structure de la ligne de réglage inconnue');
            const rotator=UE.WidgetBlueprintLibrary.Create(widget,original.GetClass(),controller);replace(original,rotator);rotator.SetIsFocusable(true);
            const labels=UE.NewArray(UE.BuiltinText);for(const value of spec.labels)labels.Add(text(value));rotator.PopulateTextLabels(labels);rotator.SetSelectedItem(spec.values.indexOf(draft[spec.id]));
            title.SetPBZFormatText(text(spec.label));background.RemoveFromParent();const slot=list.AddChildToVerticalBox(background),padding=new UE.Margin();padding.Bottom=26;slot.SetPadding(padding);
            const row={...spec,template,background,title,rotator,arrows:[find('DecreaseOverlay'),find('IncreaseOverlay')]};rows.push(row);
            bind(rotator.OnButtonBaseFocused,()=>focus(spec.id));bind(rotator.OnButtonBaseHovered,()=>{rotator.SetFocus();focus(spec.id);});
            bind(rotator.OnRotated,index=>{if(closed||submitted||updating||!Number.isInteger(index)||index<0||index>=spec.values.length)return;setup.set(draft,spec.id,spec.values[index]);focus(spec.id);});
            for(const [name,step]of [['Button_Decrease',-1],['Button_Increase',1]]){
                const original=find(name);if(!original)throw Error('Flèche de réglage indisponible');
                const arrow=UE.WidgetBlueprintLibrary.Create(widget,original.GetClass(),controller);replace(original,arrow);arrow.SetIsFocusable(false);
                bind(arrow.OnButtonBaseClicked,()=>{if(closed||submitted)return;rotator.SetFocus();focus(spec.id);if(step<0)rotator.ShiftTextLeft();else rotator.ShiftTextRight();});
            }
        }
        panel(button,145,650,790);button.SetIsFocusable(true);button.InputPriority=100;
        bind(button.OnButtonBaseFocused,()=>focus('start'));bind(button.OnButtonBaseHovered,()=>{button.SetFocus();focus('start');});
        bind(button.ButtonPressed,()=>{if(closed||submitted||draft.focus!=='start')return;feedback.holding=true;if(!feedback.playing&&feedback.charge)try{feedback.playing=soundSystem()?.PBZPostEventGlobal(feedback.charge,undefined)||0;}catch(_){}});
        bind(button.ButtonReleased,stopFeedback);bind(button.OnHoldReset,stopFeedback);
        bind(button.CompleteHold,()=>{
            if(closed||submitted||draft.focus!=='start')return;submitted=true;sync();stopFeedback();
            if(feedback.finish)try{soundSystem()?.PBZPostEventGlobal(feedback.finish,undefined);}catch(_){}
            require('./validation').ui?.(widget,'run-configuration-confirmed',session,{...setup.values(draft)});
            widget['Change Difficult Delegate'].Broadcast(widget.codexDifficulty,false);
            if(!widget.codexRetainOnConfirm)widget.DeactivateWidget();
        });
        const focusables=[...rows.map(row=>row.rotator),button];
        for(let i=0;i<focusables.length;i++){focusables[i].SetNavigationRuleExplicit(UE.EUINavigation.Up,focusables[Math.max(0,i-1)]);focusables[i].SetNavigationRuleExplicit(UE.EUINavigation.Down,focusables[Math.min(focusables.length-1,i+1)]);}
        const name=boss?.label||UE.KismetTextLibrary.Conv_TextToString(require('../Library/UIHelper').default.GetTextByID(boss?.nameKey));
        label(((name||'BOSSES')+(boss?.variant?' · '+boss.variant:'')).toLocaleUpperCase('fr-FR'),1080,710,650);
        help=label('',1080,790,650);hint=label('',145,910,1600);
        if(boss?.portrait){const image=UE.NewObject(UE.Image.StaticClass(),widget);image.SetVisibility(UE.ESlateVisibility.HitTestInvisible);const path=UE.KismetSystemLibrary.MakeSoftObjectPath(boss.halfPortrait||boss.portrait);image.SetBrushFromSoftTexture(UE.KismetSystemLibrary.Conv_SoftObjPathToSoftObjRef(path),false);panel(image,1100,90,560,560);}
        focus('format');rows[0].rotator.SetFocus();
        session.ux={...session.ux,runConfiguration:true,holdSeconds:button.GetRequiredHoldTime(),nativeHold:true};
        const nav=UE.KismetSystemLibrary.MakeSoftObjectPath('/Game/PBZContent/UI/Config/DA_PickupNavigationConfig.DA_PickupNavigationConfig');
        UE.PBZAssetManager.AsyncLoadObject(widget,nav,puerts.toDelegate(widget,config=>{if(closed||!config||!widget.IsActivated())return;UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(widget,UE.PBZUIManagerSubsystem.StaticClass()).SetNavigationConfig(config);navApplied=true;}));
        for(const [key,event]of [['charge','SFX_UI_Int_LevelUp_Weapon_Charge'],['finish','SFX_UI_Int_LevelUp_Weapon_Success']])UE.PBZAssetManager.AsyncLoadObject(widget,UE.KismetSystemLibrary.MakeSoftObjectPath('/Game/Wwise/Events/UI/UI_Int/UI_LevelUp/'+event+'.'+event),puerts.toDelegate(widget,asset=>{if(!closed)feedback[key]=asset;}));
        require('./validation').runSetup?.(widget,session);
    }catch(error){cleanup();throw error;}
}
exports.configure=configure;
