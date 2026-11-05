"use strict";
const UE = require("ue"), cpp = require("cpp");
const bosses = require("./boss-catalog").filter(b=>b.available!==false);
const helper = () => require("../Library/UIHelper").default;
const text = value => cpp.FText.FromString(value);
const info = item => item && item.codexBossEntry;
let lastSelection=null;
function name(boss) {
    const value=boss.label || UE.KismetTextLibrary.Conv_TextToString(helper().GetTextByID(boss.nameKey));
    return text((value+(boss.variant?" · "+boss.variant:"")).toLocaleUpperCase("fr-FR"));
}
function shortName(boss){
    const full=boss.label||UE.KismetTextLibrary.Conv_TextToString(helper().GetTextByID(boss.nameKey));
    return text((full.split(",")[0]+(boss.variant?" · "+boss.variant:"")).toLocaleUpperCase("fr-FR"));
}
function find(widget, id) { return widget[id] || UE.Widget.Find(id, widget.WidgetTree); }
function hide(widget, names) { for (const id of names) { const w=find(widget,id); if(w)w.SetVisibility(UE.ESlateVisibility.Collapsed); } }
function preview(widget, boss) {
    if(boss?.action==="training"){
        const image=find(widget,"CurrentBellImage");if(image)image.SetVisibility(UE.ESlateVisibility.Collapsed);
        if(widget.QuestName)widget.QuestName.SetPBZFormatText(text("ENTRAÎNEMENT"));
        if(widget.QuestDesc)widget.QuestDesc.SetPBZFormatText(text("Le refuge d'Inanis\nPréparez et essayez votre équipement.\nArsenal complet · Niv. 30\nLe niveau s'ajuste ensuite au combat choisi."));
        widget.codexPreview=null;return;
    }
    if(boss&&boss.action){
        const current=widget.codexCurrentBoss;
        boss=boss.action==="next"?bosses[bosses.findIndex(b=>b.id===current.id)+1]||current:current;
    }
    if (!boss || boss.header || widget.codexPreview === boss.id) return;
    widget.codexPreview=boss.id;
    lastSelection=boss.id;
    const image=find(widget,"CurrentBellImage");
    if(image) {
        const path=UE.KismetSystemLibrary.MakeSoftObjectPath(boss.halfPortrait||boss.portrait);
        const soft=UE.KismetSystemLibrary.Conv_SoftObjPathToSoftObjRef(path);
        image.SetBrushFromSoftTexture(soft,false);
        image.SetRenderOpacity(1);
        image.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
    }
    if(widget.QuestName)widget.QuestName.SetPBZFormatText(shortName(boss));
    const location=boss.locationKey?UE.KismetTextLibrary.Conv_TextToString(helper().GetTextByID(boss.locationKey)):"";
    const full=boss.label||UE.KismetTextLibrary.Conv_TextToString(helper().GetTextByID(boss.nameKey));
    const epithet=full.includes(",")?full.slice(full.indexOf(",")+1).trim():"";
    if(widget.QuestDesc)widget.QuestDesc.SetPBZFormatText(text((epithet?epithet+"\n":"")+location+"\nArsenal ajusté · Niv. "+(boss.balance?.weaponLevel||30)+(widget.codexRunSummary&&['victory','failure'].includes(widget.codexScreen)?"\n\n"+widget.codexRunSummary:"\nArrivée directe au combat\nÉquipement : entraînement")));
    const detail=widget.codexDetailPanel||widget.VerticalBox_94;
    if(detail) {detail.SetRenderOpacity(1);detail.SetVisibility(UE.ESlateVisibility.HitTestInvisible);}
}
function initList(widget) {
    for(const id of ["QuestName","QuestDesc","VerticalBox_94"])if(!widget[id])widget[id]=find(widget,id);
    const klass=UE.Class.Load("/Game/Blueprints/TypeScript/UI/ListViewItem/LoadGameItem.LoadGameItem_C");
    const items=UE.NewArray(UE.Object);
    widget.codexBossItems=[];
    let chapter=null;
    const add=boss=>{const item=UE.NewObject(klass,widget);item.codexBossEntry=boss;widget.codexBossItems.push(item);items.Add(item);};
    const entries=widget.codexScreen==="failure"?[
        {id:"restart-run",label:"RECOMMENCER LE DÉFI",action:"restart-run"},
        {id:"training",label:"ENTRAÎNEMENT",action:"training"},
        {id:"select",label:"SÉLECTION DES BOSS",action:"select"},
        {id:"main",label:"MENU PRINCIPAL",action:"main"}
    ]:widget.codexScreen==="victory"?[
        {id:"replay",label:"REJOUER",action:"replay"},
        ...(bosses[bosses.findIndex(b=>b.id===widget.codexCurrentBoss.id)+1]?[{id:"next",label:"BOSS SUIVANT",action:"next"}]:[]),
        {id:"select",label:"SÉLECTION DES BOSS",action:"select"},
        {id:"training",label:"ENTRAÎNEMENT",action:"training"},
        {id:"main",label:"MENU PRINCIPAL",action:"main"},
        {id:"auto",label:"ENCHAÎNEMENT AUTOMATIQUE · "+(widget.codexAutoNext?"OUI":"NON"),action:"auto"}
    ]:[...(!widget.codexInTraining?[{id:"training",label:"ENTRAÎNEMENT",action:"training"}]:[]),...bosses];
    for(const boss of entries) {
        if(boss.chapter && chapter!==boss.chapter.id){chapter=boss.chapter.id;add({header:true,id:"chapter:"+chapter,label:boss.chapter.label,nameKey:boss.chapter.key,chapterLabel:!!boss.chapter.key});}
        add(boss);
    }
    const list=widget.CommonListView_89;
    list.BP_OnItemClicked.Clear();list.BP_OnItemSelectionChanged.Clear();list.BP_OnItemIsHoveredChanged.Clear();
    list.BP_OnItemClicked.Add(item=>{const boss=info(item);if(boss&&!boss.header)widget.codexSelectBoss(boss,widget);});
    list.BP_OnItemSelectionChanged.Add((item,selected)=>{
        if(!selected)return;const boss=info(item),index=list.GetIndexForItem(item);
        if(boss && boss.header){const direction=index<(widget.codexLastIndex||0)?-1:1;let next=index+direction;while(next>=0&&next<widget.codexBossItems.length&&info(widget.codexBossItems[next]).header)next+=direction;if(next<0||next>=widget.codexBossItems.length)next=widget.codexLastIndex||1;if(next!==index)list.SetSelectedIndex(next);return;}
        widget.codexLastIndex=index;widget.playSlotHoverSound();preview(widget,boss);
    });
    list.BP_OnItemIsHoveredChanged.Add((item,hovered)=>{if(hovered&&info(item)&&!info(item).header){list.BP_SetSelectedItem(item);preview(widget,info(item));}});
    list.BP_SetListItems(items);
}
function patchSelector(Type) {
    const p=Type.prototype, init=p.initListView, activated=p.BP_OnActivated, tick=p.Tick;
    const clearQuest=p.clearLatestMainQuestInfo,applyQuest=p.applyLatestMainQuestInfo;
    if(typeof clearQuest==="function")p.clearLatestMainQuestInfo=function(...args){if(this.codexBossSelector)return;return clearQuest.apply(this,args);};
    if(typeof applyQuest==="function")p.applyLatestMainQuestInfo=function(...args){if(this.codexBossSelector){this.codexPreview=null;return preview(this,info(this.CommonListView_89.BP_GetSelectedItem()));}return applyQuest.apply(this,args);};
    p.initListView=function(...args){if(this.codexBossSelector)return initList(this);return init.apply(this,args);};
    p.BP_OnActivated=function(...args){
        const remembered=lastSelection;
        const result=activated.apply(this,args);
        if(!this.codexBossSelector)return result;
        this.LoadGameText.SetText(text(this.codexScreen==="failure"?"66 HITS · DÉFI TERMINÉ":this.codexScreen==="victory"?"VICTOIRE":"BOSSES"));
        this.CommonListView_89.SetScrollbarVisibility(UE.ESlateVisibility.Visible);
        const box=this.CommonListView_89.GetParent();if(box)box.SetWidthOverride(850);
        this.CommonListView_89.SetClipping(UE.EWidgetClipping.ClipToBounds);
        const portrait=find(this,"CurrentBellImage");
        if(portrait){portrait.SetDesiredSizeOverride(new UE.Vector2D(650,650));const ps=portrait.Slot;ps.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);const m=new UE.Margin();m.Top=15;m.Right=155;ps.SetPadding(m);}
        const detail=this.VerticalBox_94,overlay=find(this,"Overlay_29");
        if(detail&&overlay&&!this.codexDetailPanel){
            // The native save-slot lifecycle collapses its original detail box.
            // Keep its styled text/divider, in a panel owned by this selector.
            const panel=UE.NewObject(UE.VerticalBox.StaticClass(),this);
            while(detail.GetChildrenCount()){
                const child=detail.GetChildAt(0),before=child.Slot.Padding,padding=new UE.Margin();
                for(const key of ["Left","Top","Right","Bottom"])padding[key]=before[key];
                child.RemoveFromParent();panel.AddChildToVerticalBox(child).SetPadding(padding);
            }
            const slot=overlay.AddChildToOverlay(panel),padding=new UE.Margin();padding.Left=1070;padding.Top=690;padding.Right=90;
            slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);slot.SetPadding(padding);this.codexDetailPanel=panel;
        }
        if(this.QuestName)this.QuestName.SetAutoWrapText(true);
        hide(this,["GuidBox"]);
        const selected=this.codexBossItems.findIndex(item=>info(item).id===remembered);
        this.CommonListView_89.SetSelectedIndex(['victory','failure'].includes(this.codexScreen)?0:selected>=0?selected:1);
        this.codexPreview=null;preview(this,info(this.CommonListView_89.BP_GetSelectedItem())||bosses[0]);
        if(this.codexScreen!=="victory"&&selected>=0)this.CommonListView_89.BP_ScrollItemIntoView(this.codexBossItems[selected]);
        // Native activation and the fade can clear the old save-slot details.
        // Restore the selected encounter once that transition has finished.
        setTimeout(()=>{if(!UE.KismetSystemLibrary.IsValid(this)||!this.IsActivated())return;this.codexPreview=null;preview(this,info(this.CommonListView_89.BP_GetSelectedItem()));},1350);
        return result;
    };
    // The native save screen pulls focus back every frame. A difficulty screen
    // above this selector must own focus until it is dismissed.
    p.Tick=function(...args){if(this.codexBossSelector)return;return tick.apply(this,args);};
}
function patchEntry(Type) {
    const p=Type.prototype, set=p.OnListItemObjectSet;
    p.OnListItemObjectSet=function(item){
        const boss=info(item);if(!boss)return set.call(this,item);
        this.codexBossRow=true;
        this.SetIsSelectable(!boss.header);this.SetIsInteractionEnabled(!boss.header);
        hide(this,["GameTimeText","CycleText","DaysText","DifficultyText","SaveSlotName","Date","Time","WidgetSwitcher_0","NightmareNumSwitcher","Image_501","BellTex","SizeBox_122","SizeBox_140"]);
        this.BellName.SetText(boss.header&&boss.chapterLabel?text("CHAPITRE · "+UE.KismetTextLibrary.Conv_TextToString(name(boss))):boss.header||boss.action?name(boss):shortName(boss));
        this.BellName.SetAutoWrapText(true);
        this.BellName.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
        const root=find(this,"Overlay_31");
        if(root && typeof root.AddChildToOverlay==="function") {
            this.BellName.RemoveFromParent();
            const slot=root.AddChildToOverlay(this.BellName);
            slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
            slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Center);
            const padding=new UE.Margin();padding.Left=boss.header?0:32;padding.Right=24;slot.SetPadding(padding);
            hide(this,["HorizontalBox_40","HorizontalBox_47"]);
        }
        for(const id of ["Image_44","Image_42","Image"]){const w=find(this,id);if(w)w.SetDesiredSizeOverride(new UE.Vector2D(820,id==="Image_44"?(boss.header?110:78):2));}
        const highlight=find(this,"Image_44");if(highlight)highlight.SetVisibility(boss.header?UE.ESlateVisibility.Hidden:UE.ESlateVisibility.SelfHitTestInvisible);
        this.BellName.SetRenderOpacity(boss.header?0.9:1);
        this.RefreshBottomLine();this.DoSelectedAppearance(this.GetSelected());
    };
}
exports.patchSelector=patchSelector;exports.patchEntry=patchEntry;exports.bosses=bosses;
exports.refreshActions=widget=>{const selected=info(widget.CommonListView_89.BP_GetSelectedItem())?.id;initList(widget);const index=widget.codexBossItems.findIndex(item=>info(item).id===selected);widget.CommonListView_89.SetSelectedIndex(Math.max(0,index));};
exports.inspect=widget=>{const result=Object.fromEntries(["codexDetailPanel","VerticalBox_94","QuestName","QuestDesc","CurrentBellImage"].map(id=>{
    const w=find(widget,id);if(!w)return[id,null];
    const size=w.GetDesiredSize();
    return[id,{visibility:w.GetVisibility(),opacity:w.GetRenderOpacity(),size:{X:size.X,Y:size.Y},text:typeof w.GetText==="function"?UE.KismetTextLibrary.Conv_TextToString(w.GetText()):null}];
}));
    try{const entries=widget.CommonListView_89.GetDisplayedEntryWidgets();result.rows=[];
        for(let i=0;i<entries.Num();i++){const e=entries.Get(i),item=UE.UserObjectListEntryLibrary.GetListItemObject(e);result.rows.push({id:info(item)?.id,selected:e.GetSelected(),text:UE.KismetTextLibrary.Conv_TextToString(e.BellName.GetText()),highlightOpacity:e.Image_44.GetRenderOpacity(),highlightVisibility:e.Image_44.GetVisibility()});}
    }catch(error){result.rowError=String(error);}
    return result;
};

