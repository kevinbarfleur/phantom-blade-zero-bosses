"use strict";
const UE=require('ue'),cpp=require('cpp'),puerts=require('puerts'),model=require('./run-model');
let view=null,lastSearch=0;
function valid(w){try{return !!w&&UE.KismetSystemLibrary.IsValid(w);}catch(_){return false;}}
function stop(){if(view)try{if(valid(view.box))view.box.RemoveFromParent();}catch(_){}view=null;}
function attach(host,session){
    if(!session.active||!model.enabled(session.run))return;
    const root=UE.Widget.Find('Overlay_0',host.WidgetTree);if(!root?.AddChildToOverlay)return;
    stop();
    const box=UE.NewObject(UE.VerticalBox.StaticClass(),host),size=UE.NewObject(UE.SizeBox.StaticClass(),host);
    try{
        size.SetWidthOverride(330);size.AddChild(box);
        const slot=root.AddChildToOverlay(size),margin=new UE.Margin();margin.Right=90;margin.Top=65;
        slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Right);slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);slot.SetPadding(margin);
        size.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
        const fontObject=UE.Font.Load('/Game/PBZContent/UI/Fonts/STZHONGS_Font.STZHONGS_Font');
        const add=fontSize=>{
            const label=UE.NewObject(UE.TextBlock.StaticClass(),host),font=new UE.SlateFontInfo();font.FontObject=fontObject;font.TypefaceFontName='Default';font.Size=fontSize;
            label.SetFont(font);label.SetJustification(UE.ETextJustify.Right);label.SetShadowOffset(new UE.Vector2D(1,1));label.SetShadowColorAndOpacity(new UE.LinearColor(0,0,0,0.9));
            label.SetVisibility(UE.ESlateVisibility.HitTestInvisible);box.AddChildToVerticalBox(label);return label;
        };
        view={host,box:size,label:add(18),clock:add(32),hits:add(22),status:add(16),last:null};
        update(session);
    }catch(error){
        view=null;try{if(valid(size))size.RemoveFromParent();}catch(_){}
        throw error;
    }
}
function update(session,context){
    if(view&&!valid(view.box))view=null;
    const now=Date.now();
    if(!view&&context&&session.active&&!session.boss.training&&model.enabled(session.run)&&(now<lastSearch||now-lastSearch>1000)){
        lastSearch=now;const cls=UE.Class.Find('/Game/PBZContent/UI/FrontEnd/W_FrontEndHUDLayout.W_FrontEndHUDLayout_C');
        if(cls){const out=puerts.$ref(UE.NewArray(UE.UserWidget));UE.WidgetBlueprintLibrary.GetAllWidgetsOfClass(context,out,cls,false);const all=puerts.$unref(out);for(let i=0;i<all.Num();i++)if(valid(all.Get(i))){attach(all.Get(i),session);break;}}
    }
    if(!view)return;
    const s=session.run,visible=session.active&&!session.boss.training&&model.enabled(s)&&!(session.cinematicActive&&!session.runInteractiveActive);
    view.box.SetVisibility(visible?UE.ESlateVisibility.HitTestInvisible:UE.ESlateVisibility.Collapsed);
    if(!visible)return;
    const time=s.options.timer==='series'?s.totalMs:s.attemptMs;
    const data={label:s.options.timer==='series'?'SÉRIE':s.options.timer==='fight'?'COMBAT':'DÉFI',clock:s.options.timer==='off'?'':model.formatTime(time),hits:s.options.hits66?'66 HITS · '+s.hits+' / 66':'',status:s.invalid?'DÉTECTION À VÉRIFIER':s.phase==='failed'?'DÉFI TERMINÉ':s.phase==='finished'?'TERMINÉ':s.reason==='pause'?'EN PAUSE':s.reason==='preparing'?'PRÊT':s.phase==='between'?'COMBAT TERMINÉ':''};
    const key=JSON.stringify(data);if(view.last===key)return;view.last=key;
    for(const name of ['label','clock','hits','status']){view[name].SetText(cpp.FText.FromString(data[name]));view[name].SetVisibility(data[name]?UE.ESlateVisibility.HitTestInvisible:UE.ESlateVisibility.Collapsed);}
    const color=new UE.SlateColor();color.SpecifiedColor=s.hits>=60?new UE.LinearColor(0.9,0.22,0.16,1):new UE.LinearColor(0.96,0.91,0.82,1);view.hits.SetColorAndOpacity(color);
}
exports.update=update;exports.stop=stop;
