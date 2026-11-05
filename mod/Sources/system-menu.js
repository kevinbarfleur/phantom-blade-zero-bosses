"use strict";
const UE=require("ue"),cpp=require("cpp"),validation=require("./validation");
const text=value=>cpp.FText.FromString(value);
function valid(object){try{return !!object&&UE.KismetSystemLibrary.IsValid(object);}catch(_){return false;}}
function isCombatExit(panel,session){return session.active&&!session.boss.training&&panel.CurrentCollection===panel.getCollectionByTabId('Exit');}
function focusAction(panel,getSession){
    const state=panel.codexLabActions,row=state?.rows.find(row=>row.kind===state.focused);
    if(row&&!panel.codexLabConfirm&&valid(panel)&&isCombatExit(panel,getSession())){panel.IsEnterSecond=true;row.button.SetFocus();}
}
function confirm(panel,kind,getSession,api){
    const session=getSession();if(!session.active||panel.codexLabConfirm)return;
    const boss=session.boss;
    if(boss.training)return;
    const message=kind==="retry"?"Recommencer ce combat avec votre équipement actuel ?":"Retourner à l'entraînement avec votre équipement actuel ?";
    const action=UE.AsyncAction_ShowConfirmation.ShowConfirmationYesNo(panel,text("BOSSES"),text(message));let settled=false;
    validation.ui(panel,'system-action-confirm',session,{action:kind});
    panel.codexLabConfirm=action;
    action.OnResult.Add(result=>{
        if(settled)return;settled=true;
        panel.codexLabConfirm=null;
        validation.ui(panel,'system-action-result',session,{action:kind,result});
        if(result!==UE.ECommonMessagingResult.Confirmed)setTimeout(()=>focusAction(panel,getSession),150);
        if(result!==UE.ECommonMessagingResult.Confirmed||!valid(panel)||getSession()!==session||!session.active||session.boss!==boss)return;
        if(kind==="retry")api.replay(panel,session.difficulty,boss,false,true);
        else api.openTraining(panel);
    });action.Activate();
}
function install(panel,getSession,api){
    if(panel.codexLabActions)return;
    const list=panel.ListView_Settings,parent=list.GetParent();
    const container=UE.NewObject(UE.VerticalBox.StaticClass(),panel),extra=UE.NewObject(UE.VerticalBox.StaticClass(),panel);
    const klass=UE.Class.Load("/Game/PBZContent/UI/Settings/Editors/W_SettingsListEntry_Action.W_SettingsListEntry_Action_C");
    const rows=[];
    for(const [kind,label]of [["retry","Recommencer le combat"],["training","Retourner à l'entraînement"]]){
        const template=UE.WidgetBlueprintLibrary.Create(panel,klass,UE.GameplayStatics.GetPlayerController(panel,0));
        const title=template.Text_SettingName||UE.Widget.Find("Text_SettingName",template.WidgetTree),original=template.Button_Action||UE.Widget.Find("Button_Action",template.WidgetTree);
        const entry=UE.Widget.Find("Background",template.WidgetTree);
        if(!title||!original||!entry)throw Error("Structure de l'action Système inconnue");
        // The native GameSettingListEntry binds its button to a GameSetting
        // pointer. Keep its visual subtree, with a fresh independent button,
        // so no native setting action can dereference an unassigned setting.
        const overlay=original.GetParent();original.RemoveFromParent();
        const button=UE.WidgetBlueprintLibrary.Create(panel,original.GetClass(),UE.GameplayStatics.GetPlayerController(panel,0)),slot=overlay.AddChildToOverlay(button);
        button.SetIsFocusable(true);
        slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);
        entry.RemoveFromParent();
        title.SetPBZFormatText(text(label));
        button.OnButtonBaseClicked.Add(()=>confirm(panel,kind,getSession,api));
        const focus=()=>{panel.ListView_Settings.BP_ClearSelection();panel.SelectedSettings=null;if(panel.codexLabActions)panel.codexLabActions.focused=kind;entry.OnSelected();title.OverrideTextColor(template.SelectedColor);title.SetOutlineOverrideEnabled(true);if(valid(panel.Details_Settings))panel.Details_Settings.SetVisibility(UE.ESlateVisibility.Collapsed);};
        const blur=()=>{entry['Not Selected']();title.OverrideTextColor(template.DefaultColor);title.SetOutlineOverrideEnabled(false);};
        button.OnButtonBaseFocused.Add(focus);button.OnButtonBaseUnfocused.Add(blur);button.OnButtonBaseHovered.Add(focus);button.OnButtonBaseUnhovered.Add(blur);
        extra.AddChildToVerticalBox(entry);rows.push({kind,entry,button,template,blur});
    }
    rows[0].button.SetNavigationRuleExplicit(UE.EUINavigation.Down,rows[1].button);
    rows[1].button.SetNavigationRuleExplicit(UE.EUINavigation.Up,rows[0].button);
    container.AddChildToVerticalBox(extra);
    list.RemoveFromParent();
    try{const slot=container.AddChildToVerticalBox(list);slot.SetSize(new UE.SlateChildSize(1,UE.ESlateSizeRule.Fill));parent.AddChild(container);}
    catch(error){list.RemoveFromParent();parent.AddChild(list);throw error;}
    panel.codexLabActions={container,extra,rows};
}
function refresh(panel,session){
    const state=panel.codexLabActions;if(!state)return;
    const visible=isCombatExit(panel,session);
    state.extra.SetVisibility(visible?UE.ESlateVisibility.SelfHitTestInvisible:UE.ESlateVisibility.Collapsed);
    state.rows[0].entry.SetVisibility(session.boss.training?UE.ESlateVisibility.Collapsed:UE.ESlateVisibility.SelfHitTestInvisible);
    // Keep the native category heading: InitDataByText requires FlowLocText,
    // rather than an FText, and is unrelated to the action rows themselves.
    if(valid(panel.Details_Settings))panel.Details_Settings.SetVisibility(UE.ESlateVisibility.SelfHitTestInvisible);
    session.ux={...session.ux,systemLabActionsReady:true,systemLabActionsVisible:visible};
}
function patch(Type,getSession,api){
    const p=Type.prototype,init=p.BP_InitWidget;
    p.BP_InitWidget=function(...args){
        const result=init.apply(this,args),session=getSession();
        if(session.active)try{install(this,getSession,api);refresh(this,session);}catch(error){console.log('[CodexBossLab] System actions: '+String(error));validation.ui(this,'system-actions-error',session,{error:String(error)});}
        if(session.active&&validation.mode==="settings-probe"){
            const classes={};
            for(const name of ['GameSetting','GameSettingAction','GameSettingCollection','GameSettingRegistry','PBZGameSettingRegistry','GameSettingPanel','PBZSystemScreenWidget'])try{classes[name]=Object.getOwnPropertyNames(UE[name].prototype);}catch(error){classes[name]=String(error);}
            validation.ui(this,"settings-probe",session,{classes,registryClass:this.Registry?.GetClass()?.GetName(),collection:this.CurrentCollection?.GetDevName()});
        }
        return result;
    };
    const switchTab=p.applyTabSwitch;
    p.applyTabSwitch=function(...args){if(this.codexLabActions)this.codexLabActions.focused=args[0]==='Exit'?'retry':null;const result=switchTab.apply(this,args);refresh(this,getSession());return result;};
    const selected=p.SettingsSeletionChanged;
    p.SettingsSeletionChanged=function(...args){const result=selected.apply(this,args);if(this.codexLabActions){if(args[1])this.codexLabActions.focused=null;for(const row of this.codexLabActions.rows)row.blur();if(valid(this.Details_Settings))this.Details_Settings.SetVisibility(UE.ESlateVisibility.SelfHitTestInvisible);}return result;};
    for(const method of ['selectFirstSettingDeferred','SelectWidgetToFocus']){const original=p[method];p[method]=function(...args){if(this.codexLabActions?.focused&&isCombatExit(this,getSession())){if(!this.codexLabConfirm)setTimeout(()=>focusAction(this,getSession),0);return;}return original.apply(this,args);};}
    const entry=p.SettingInitEntry;
    p.SettingInitEntry=function(item,widget){
        const result=entry.call(this,item,widget),state=this.codexLabActions;
        if(state&&getSession().active&&!getSession().boss.training&&this.CurrentCollection===this.getCollectionByTabId('Exit')&&this.ListView_Settings.ListItems.Get(0)===item){
            widget.SetNavigationRuleExplicit(UE.EUINavigation.Up,state.rows[1].button);
            state.rows[1].button.SetNavigationRuleExplicit(UE.EUINavigation.Down,widget.GetPrimaryGamepadFocusWidget?.()||widget);
        }return result;
    };
}
exports.patch=patch;
exports.confirm=confirm;
