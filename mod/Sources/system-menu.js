"use strict";
const UE=require("ue"),cpp=require("cpp"),validation=require("./validation");
const text=value=>cpp.FText.FromString(value);
function valid(object){try{return !!object&&UE.KismetSystemLibrary.IsValid(object);}catch(_){return false;}}
function isCombatExit(panel,session){return session.active&&!session.boss.training&&panel.CurrentCollection===panel.getCollectionByTabId('Exit');}
function clearAction(panel){
    const state=panel.codexLabActions;if(!state)return;
    state.focused=null;state.focusRevision=(state.focusRevision||0)+1;
    for(const row of state.rows)row.blur();
}
function selectAction(panel,kind,getSession,moveFocus=false){
    const state=panel.codexLabActions;
    if(!state||state.closed||state.selecting||panel.codexLabConfirm||!valid(panel)||!isCombatExit(panel,getSession()))return;
    const row=state.rows.find(row=>row.kind===kind);if(!row)return;
    state.selecting=true;
    try{
        if(state.focused!==kind){state.focused=kind;state.focusRevision=(state.focusRevision||0)+1;}
        panel.IsEnterSecond=true;
        // Clearing a native selection emits deselection synchronously. It must
        // not erase the custom owner or enqueue an old native focus restore.
        panel.ListView_Settings.BP_ClearSelection();panel.SelectedSettings=null;
        // Native SettingsSeletionChanged(false) only logs; its separate entry
        // buttons retain their ink highlight until SetSelected(false) is called.
        // Match the native selected=true path when our external row takes over.
        const entries=panel.ListView_Settings.GetDisplayedEntryWidgets();
        for(let i=0;i<entries.Num();i++){
            const entry=entries.Get(i);if(valid(entry))entry.SetSelected(false);
        }
        for(const other of state.rows){if(other===row)other.select();else other.blur();}
        if(valid(panel.Details_Settings))panel.Details_Settings.SetVisibility(UE.ESlateVisibility.Collapsed);
        // Match native settings hover: selected appearance AND actual focus.
        // The focus delegate can fire synchronously; selecting guards reentry.
        if(moveFocus)row.button.SetFocus();
    }finally{state.selecting=false;}
}
function focusAction(panel,getSession){
    const state=panel.codexLabActions,row=state?.rows.find(row=>row.kind===state.focused);
    if(row&&!state.closed&&!panel.codexLabConfirm&&valid(panel)&&isCombatExit(panel,getSession())){panel.IsEnterSecond=true;row.button.SetFocus();}
}
function queueFocus(panel,getSession,delay=0){
    const state=panel.codexLabActions,kind=state?.focused,revision=state?.focusRevision,session=getSession(),boss=session.boss;
    if(!kind||state.closed)return;
    setTimeout(()=>{
        if(!valid(panel)||panel.codexLabActions!==state||state.closed||!panel.IsEnterSecond||state.focused!==kind||state.focusRevision!==revision||getSession()!==session||session.boss!==boss)return;
        focusAction(panel,getSession);
    },delay);
}
function confirm(panel,kind,getSession,api){
    const session=getSession();if(!session.active||panel.codexLabConfirm)return;
    const boss=session.boss;
    if(boss.training)return;
    const challenge=session.run?.options.hits66,series=session.run?.options.timer==='series';
    const message=kind==="retry"?"Restart this fight with your current equipment?"+(challenge?"\nYour 66 HITS count will be kept.":series?"\nYour total time will be kept.":""):"Return to Training with your current equipment?"+(challenge||series?"\nThe current series will end.":"");
    const action=UE.AsyncAction_ShowConfirmation.ShowConfirmationYesNo(panel,text("BOSSES"),text(message));let settled=false;
    validation.ui(panel,'system-action-confirm',session,{action:kind});
    panel.codexLabConfirm=action;
    action.OnResult.Add(result=>{
        if(settled)return;settled=true;
        panel.codexLabConfirm=null;
        validation.ui(panel,'system-action-result',session,{action:kind,result});
        if(!valid(panel)||getSession()!==session||!session.active||session.boss!==boss||panel.codexLabActions?.closed)return;
        if(result!==UE.ECommonMessagingResult.Confirmed){queueFocus(panel,getSession,150);return;}
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
    for(const [kind,label]of [["retry","Restart Fight"],["training","Return to Training"]]){
        const template=UE.WidgetBlueprintLibrary.Create(panel,klass,UE.GameplayStatics.GetPlayerController(panel,0));
        const title=template.Text_SettingName||UE.Widget.Find("Text_SettingName",template.WidgetTree),original=template.Button_Action||UE.Widget.Find("Button_Action",template.WidgetTree);
        const entry=UE.Widget.Find("Background",template.WidgetTree);
        if(!title||!original||!entry)throw Error("Unsupported System action layout");
        // The native GameSettingListEntry binds its button to a GameSetting
        // pointer. Keep its visual subtree, with a fresh independent button,
        // so no native setting action can dereference an unassigned setting.
        const overlay=original.GetParent();original.RemoveFromParent();
        const button=UE.WidgetBlueprintLibrary.Create(panel,original.GetClass(),UE.GameplayStatics.GetPlayerController(panel,0)),slot=overlay.AddChildToOverlay(button);
        button.SetIsFocusable(true);
        slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);
        entry.RemoveFromParent();
        title.SetPBZFormatText(text(label));
        button.OnButtonBaseClicked.Add(()=>{const state=panel.codexLabActions;if(!state||state.closed||!isCombatExit(panel,getSession()))return;selectAction(panel,kind,getSession);confirm(panel,kind,getSession,api);});
        const select=()=>{entry.OnSelected();title.OverrideTextColor(template.SelectedColor);title.SetOutlineOverrideEnabled(true);};
        const blur=()=>{entry['Not Selected']();title.OverrideTextColor(template.DefaultColor);title.SetOutlineOverrideEnabled(false);};
        button.OnButtonBaseFocused.Add(()=>selectAction(panel,kind,getSession));
        button.OnButtonBaseHovered.Add(()=>selectAction(panel,kind,getSession,true));
        // Selection persists until another row/tab takes ownership, like the
        // native list. Late Unhover/Unfocus must not erase the current highlight.
        const blurIfNotSelected=()=>{if(panel.codexLabActions?.focused!==kind)blur();};
        button.OnButtonBaseUnfocused.Add(blurIfNotSelected);button.OnButtonBaseUnhovered.Add(blurIfNotSelected);
        extra.AddChildToVerticalBox(entry);rows.push({kind,entry,button,template,select,blur});
    }
    rows[0].button.SetNavigationRuleExplicit(UE.EUINavigation.Down,rows[1].button);
    rows[1].button.SetNavigationRuleExplicit(UE.EUINavigation.Up,rows[0].button);
    container.AddChildToVerticalBox(extra);
    list.RemoveFromParent();
    try{const slot=container.AddChildToVerticalBox(list);slot.SetSize(new UE.SlateChildSize(1,UE.ESlateSizeRule.Fill));parent.AddChild(container);}
    catch(error){list.RemoveFromParent();parent.AddChild(list);throw error;}
    panel.codexLabActions={container,extra,rows,focused:null,focusRevision:0,closed:false};
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
        if(this.codexLabActions){clearAction(this);this.codexLabActions.closed=false;}
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
    p.applyTabSwitch=function(...args){if(this.codexLabActions){clearAction(this);this.codexLabActions.focused=args[0]==='Exit'?'retry':null;}const result=switchTab.apply(this,args);refresh(this,getSession());return result;};
    const selected=p.SettingsSeletionChanged;
    p.SettingsSeletionChanged=function(...args){if(args[1])clearAction(this);const result=selected.apply(this,args);if(args[1]&&this.codexLabActions&&valid(this.Details_Settings))this.Details_Settings.SetVisibility(UE.ESlateVisibility.SelfHitTestInvisible);return result;};
    for(const method of ['selectFirstSettingDeferred','SelectWidgetToFocus']){const original=p[method];p[method]=function(...args){if(this.codexLabActions?.focused&&!this.codexLabActions.closed&&isCombatExit(this,getSession())&&(method==='selectFirstSettingDeferred'||this.IsEnterSecond)){if(!this.codexLabConfirm&&args[0]!==false)queueFocus(this,getSession);return;}return original.apply(this,args);};}
    for(const method of ['BackInput','BackInputFromDirectOpen'])if(typeof p[method]==='function'){const back=p[method];p[method]=function(...args){const result=back.apply(this,args);if(!this.IsEnterSecond)clearAction(this);return result;};}
    if(typeof p.FinishCurrentWidget==='function'){const finish=p.FinishCurrentWidget;p.FinishCurrentWidget=function(...args){if(this.codexLabActions){clearAction(this);this.codexLabActions.closed=true;}return finish.apply(this,args);};}
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
