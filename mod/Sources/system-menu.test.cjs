const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function delegate(){const handlers=[];return{Add:f=>handlers.push(f),emit:v=>handlers.forEach(f=>f(v))};}
function harness(){
 const session={active:true,boss:{id:'boss'},difficulty:3},calls=[],actions=[],timers=[];let current=session;
 const UE={KismetSystemLibrary:{IsValid:o=>o?.valid!==false},ECommonMessagingResult:{Confirmed:1},AsyncAction_ShowConfirmation:{ShowConfirmationYesNo(...args){const a={args,OnResult:delegate(),Activate(){calls.push('confirm');}};actions.push(a);return a;}}};
 const api={replay:(...args)=>calls.push(['retry',...args]),openTraining:(...args)=>calls.push(['training',...args])},exports={};
 vm.runInNewContext(fs.readFileSync(__dirname+'/system-menu.js','utf8'),{exports,setTimeout(fn){timers.push(fn);},require:n=>({'ue':UE,'cpp':{FText:{FromString:x=>x}},'./validation':{mode:'manual',ui(){}}}[n])});
 const panel={valid:true};return{exports,UE,session,panel,calls,actions,timers,getSession:()=>current,api,confirm:kind=>exports.confirm(panel,kind,()=>current,api),setCurrent:s=>current=s};
}
test('system restart requires confirmation, retains loadout and uses skip-intro retry',()=>{
 const h=harness();h.confirm('retry');h.confirm('retry');assert.equal(h.actions.length,1);assert.equal(h.calls.length,1);
 h.actions[0].OnResult.emit(1);h.actions[0].OnResult.emit(1);assert.equal(h.calls.length,2);const [kind,panel,difficulty,boss,prepare,skip]=h.calls[1];assert.equal(kind,'retry');assert.equal(panel,h.panel);assert.equal(difficulty,3);assert.equal(boss,h.session.boss);assert.equal(prepare,false);assert.equal(skip,true);
});
test('system training action delegates to the normal equipment-preserving travel',()=>{
 const h=harness();h.confirm('training');h.actions[0].OnResult.emit(1);assert.deepEqual(h.calls[1],['training',h.panel]);
});
test('cancel, closed panel, inactive lab and changed encounter cannot launch a stale confirmation',()=>{
 for(const change of [h=>h.actions[0].OnResult.emit(0),h=>{h.panel.valid=false;h.actions[0].OnResult.emit(1);},h=>{h.session.active=false;h.actions[0].OnResult.emit(1);},h=>{h.session.boss={id:'other'};h.actions[0].OnResult.emit(1);},h=>{h.setCurrent({...h.session});h.actions[0].OnResult.emit(1);}]){const h=harness();h.confirm('retry');change(h);assert.deepEqual(h.calls,['confirm']);assert.equal(h.panel.codexLabConfirm,null);}
});
test('ordinary campaign and refuge never expose a destructive combat transition',()=>{
 for(const change of [s=>s.active=false,s=>s.boss.training=true]){const h=harness();change(h.session);h.confirm('retry');h.confirm('training');assert.equal(h.actions.length,0);}
});
test('deferred native focus and cancel restore the lab action without stealing another tab',()=>{
 const h=harness(),native=[];
 class Panel{BP_InitWidget(){}applyTabSwitch(){}SettingsSeletionChanged(){}SettingInitEntry(){}selectFirstSettingDeferred(){native.push('deferred');}SelectWidgetToFocus(){native.push('focus');}}
 h.exports.patch(Panel,h.getSession,h.api);
 const exit={},panel=new Panel();panel.CurrentCollection=exit;panel.getCollectionByTabId=()=>exit;panel.IsEnterSecond=true;
 panel.codexLabActions={focused:'retry',rows:[{kind:'retry',button:{SetFocus(){h.calls.push('focused');}}}]};
 panel.selectFirstSettingDeferred();panel.SelectWidgetToFocus();assert.equal(h.timers.length,2);
 h.timers.splice(0).forEach(fn=>fn());assert.deepEqual(h.calls,['focused','focused']);assert.equal(panel.IsEnterSecond,true);
 panel.CurrentCollection={};panel.selectFirstSettingDeferred();panel.SelectWidgetToFocus();assert.deepEqual(native,['deferred','focus']);
});

function menuHarness(){
 const h=harness(),{UE}=h;let focused=null,clears=0;const nativeEntries=[];
 const slot=()=>({SetHorizontalAlignment(){},SetVerticalAlignment(){},SetSize(){}});
 const panelWidget=()=>({children:[],AddChild(w){this.children.push(w);return slot();},AddChildToOverlay(w){return this.AddChild(w);},AddChildToVerticalBox(w){return this.AddChild(w);},RemoveFromParent(){},SetVisibility(v){this.visibility=v;}});
 const button=()=>({OnButtonBaseClicked:delegate(),OnButtonBaseFocused:delegate(),OnButtonBaseUnfocused:delegate(),OnButtonBaseHovered:delegate(),OnButtonBaseUnhovered:delegate(),SetIsFocusable(){},SetNavigationRuleExplicit(){},SetFocus(){if(focused===this)return;const prior=focused;focused=this;prior?.OnButtonBaseUnfocused.emit();this.OnButtonBaseFocused.emit();}});
 const templates=[];
 Object.assign(UE,{VerticalBox:{StaticClass:()=>1},NewObject:panelWidget,Class:{Load:()=>2},GameplayStatics:{GetPlayerController:()=>({})},Widget:{Find:(name,tree)=>tree[name]},EHorizontalAlignment:{HAlign_Fill:1},EVerticalAlignment:{VAlign_Fill:1},EUINavigation:{Up:1,Down:2},ESlateVisibility:{Collapsed:0,SelfHitTestInvisible:1},SlateChildSize:class{},ESlateSizeRule:{Fill:1},WidgetBlueprintLibrary:{Create(p,cls){if(cls===3)return button();const overlay=panelWidget(),entry={...panelWidget(),OnSelected(){this.selected=true;},'Not Selected'(){this.selected=false;}},title={SetPBZFormatText(){},OverrideTextColor(){},SetOutlineOverrideEnabled(){}},original={GetParent:()=>overlay,RemoveFromParent(){},GetClass:()=>3};const t={WidgetTree:{Background:entry},Text_SettingName:title,Button_Action:original};templates.push(t);return t;}}});
 class Panel{
  BP_InitWidget(){}applyTabSwitch(id){this.CurrentCollection=this.getCollectionByTabId(id);this.ListView_Settings.BP_ClearSelection();this.selectFirstSettingDeferred(this.IsEnterSecond);}
  SettingsSeletionChanged(item,selected){if(selected){this.SelectedSettings=item;focused?.OnButtonBaseUnfocused.emit();focused=null;this.SelectWidgetToFocus();}}
  SettingInitEntry(){}selectFirstSettingDeferred(){h.calls.push('native-first');}SelectWidgetToFocus(){h.calls.push('native-focus');}FinishCurrentWidget(){h.calls.push('native-close');}BackInput(){this.IsEnterSecond=false;this.ListView_Settings.BP_ClearSelection();}
 }
 h.exports.patch(Panel,h.getSession,h.api);
 const panel=new Panel(),exit={},other={};panel.getCollectionByTabId=id=>id==='Exit'?exit:other;panel.CurrentCollection=other;panel.IsEnterSecond=true;panel.Details_Settings=panelWidget();
 panel.ListView_Settings={GetParent:()=>panelWidget(),RemoveFromParent(){},GetDisplayedEntryWidgets:()=>({Num:()=>nativeEntries.length,Get:i=>nativeEntries[i]}),BP_ClearSelection(){clears++;const old=panel.SelectedSettings;panel.SelectedSettings=null;panel.SettingsSeletionChanged(old,false);}};
 panel.BP_InitWidget();panel.applyTabSwitch('Exit');h.timers.splice(0).forEach(fn=>fn());
 return {...h,panel,nativeEntries,rows:panel.codexLabActions.rows,get focused(){return focused;},get clears(){return clears;},flush(){h.timers.splice(0).forEach(fn=>fn());}};
}

test('mouse hover moves actual focus and gives exactly one custom row the native selected appearance',()=>{
 const h=menuHarness(),[retry,training]=h.rows;
 assert.equal(h.focused,retry.button);assert(retry.entry.selected);
 training.button.OnButtonBaseHovered.emit();
 assert.equal(h.focused,training.button);assert.equal(h.panel.codexLabActions.focused,'training');
 assert(!retry.entry.selected);assert(training.entry.selected);assert.equal(h.panel.SelectedSettings,null);assert.equal(h.panel.Details_Settings.visibility,0);
 // Late callbacks from the row just left cannot erase the new owner.
 retry.button.OnButtonBaseUnhovered.emit();training.button.OnButtonBaseUnhovered.emit();
 assert(training.entry.selected);assert(!retry.entry.selected);assert(h.clears<10,'no focus/deselection recursion');
});

test('hover and keyboard selection hand ownership to native settings before native focus restoration',()=>{
 const h=menuHarness();h.rows[1].button.OnButtonBaseHovered.emit();h.panel.SelectWidgetToFocus();
 const nativeItem={id:'exit-title'};h.panel.SettingsSeletionChanged(nativeItem,true);h.flush();
 assert.equal(h.panel.codexLabActions.focused,null);assert(h.rows.every(row=>!row.entry.selected));assert.equal(h.panel.SelectedSettings,nativeItem);assert.equal(h.focused,null);assert.equal(h.panel.Details_Settings.visibility,1);
 h.rows[0].button.SetFocus();assert(h.rows[0].entry.selected);assert.equal(h.panel.SelectedSettings,null);
});

test('deferred custom focus cannot follow a newer hover, leave and reenter a tab, or a closed panel',()=>{
 for(const takeOver of [h=>h.rows[1].button.OnButtonBaseHovered.emit(),h=>{h.panel.applyTabSwitch('Game');h.panel.applyTabSwitch('Exit');h.panel.IsEnterSecond=false;},h=>h.panel.FinishCurrentWidget()]){
  const h=menuHarness();h.panel.SelectWidgetToFocus();const stale=h.timers.splice(0);
  takeOver(h);const focusAfter=h.focused,revision=h.panel.codexLabActions.focusRevision;
  stale.forEach(fn=>fn());assert.equal(h.focused,focusAfter);assert.equal(h.panel.codexLabActions.focusRevision,revision);
 }
});

test('mouse browsing of category tabs does not force entry focus',()=>{
 const h=menuHarness();h.panel.IsEnterSecond=false;h.panel.applyTabSwitch('Game');h.panel.applyTabSwitch('Exit');
 assert.equal(h.timers.length,0);h.panel.SelectWidgetToFocus();assert.equal(h.timers.length,0);assert.equal(h.panel.IsEnterSecond,false);
});

test('native enter-list requests can precede IsEnterSecond, while Back cancels pending custom focus',()=>{
 const h=menuHarness();h.panel.IsEnterSecond=false;h.panel.selectFirstSettingDeferred(true);assert.equal(h.timers.length,1);
 h.panel.IsEnterSecond=true;h.flush();assert.equal(h.focused,h.rows[0].button);
 h.panel.SelectWidgetToFocus();h.panel.BackInput();h.flush();assert.equal(h.panel.IsEnterSecond,false);assert.equal(h.panel.codexLabActions.focused,null);assert(h.rows.every(row=>!row.entry.selected));
});

test('clicking the hovered action opens the matching confirmation; a modal cannot lose focus to hover',()=>{
 const h=menuHarness(),[retry,training]=h.rows;training.button.OnButtonBaseHovered.emit();training.button.OnButtonBaseClicked.emit();
 assert.match(h.actions[0].args[2],/Return/);retry.button.OnButtonBaseHovered.emit();assert.equal(h.focused,training.button);
 h.actions[0].OnResult.emit(0);retry.button.OnButtonBaseHovered.emit();h.flush();assert.equal(h.focused,retry.button);assert.equal(h.actions.length,1);
 training.button.OnButtonBaseClicked.emit();h.actions[1].OnResult.emit(1);assert(h.calls.some(call=>Array.isArray(call)&&call[0]==='training'));
});

test('custom focus clears native entry ink independently from native list deselection',()=>{
 const h=menuHarness(),native={selected:true,SetSelected(value){this.selected=value;}};
 h.nativeEntries.push(native);h.panel.SelectedSettings={id:'return-title'};
 // The native deselected callback intentionally does not clear its button.
 h.panel.ListView_Settings.BP_ClearSelection();assert.equal(native.selected,true);
 h.rows[1].button.OnButtonBaseHovered.emit();assert.equal(native.selected,false);
 assert.equal(h.panel.SelectedSettings,null);assert.equal(h.focused,h.rows[1].button);
 assert.equal(h.rows[1].entry.selected,true);assert.equal(h.rows[0].entry.selected,false);
 h.rows[1].button.OnButtonBaseClicked.emit();assert.equal(h.actions.length,1);assert.equal(native.selected,false);
});
