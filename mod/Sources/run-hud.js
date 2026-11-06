"use strict";
const UE=require('ue'),cpp=require('cpp'),puerts=require('puerts'),model=require('./run-model');
let view=null,lastSearch=0;
function valid(w){try{return !!w&&UE.KismetSystemLibrary.IsValid(w);}catch(_){return false;}}
function stop(){if(view)try{if(valid(view.box))view.box.RemoveFromParent();}catch(_){}view=null;}
function backdrop(host,box){
    let border=null;
    try{
        if(typeof UE.Border?.StaticClass!=='function')return box;
        border=UE.NewObject(UE.Border.StaticClass(),host);
        if(!valid(border)||['SetBrushColor','SetPadding','SetVisibility','AddChild'].some(name=>typeof border[name]!=='function'))throw Error('Native HUD border unavailable');
        const padding=new UE.Margin();padding.Left=10;padding.Right=10;padding.Top=6;padding.Bottom=6;
        border.SetBrushColor(new UE.LinearColor(0.012,0.014,0.018,0.40));border.SetPadding(padding);
        // Entire subtree remains non-interactive: never capture pointer/focus.
        border.SetVisibility(UE.ESlateVisibility.HitTestInvisible);border.AddChild(box);return border;
    }catch(_){
        // Preserve the established text-only HUD on unsupported native wrappers.
        try{box.RemoveFromParent();}catch(_){}
        try{if(valid(border))border.RemoveFromParent();}catch(_){}
        return box;
    }
}
function attach(host,session){
    if(!session.active||!model.enabled(session.run))return;
    const root=UE.Widget.Find('Overlay_0',host.WidgetTree);if(!root?.AddChildToOverlay)return;
    stop();
    const box=UE.NewObject(UE.VerticalBox.StaticClass(),host),size=UE.NewObject(UE.SizeBox.StaticClass(),host);
    try{
        size.SetWidthOverride(250);size.AddChild(backdrop(host,box));
        // Compact corner placement leaves the central native boss HUD clear.
        const slot=root.AddChildToOverlay(size),margin=new UE.Margin();margin.Right=65;margin.Top=60;
        slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Right);slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);slot.SetPadding(margin);
        size.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
        const fontObject=UE.Font.Load('/Game/PBZContent/UI/Fonts/STZHONGS_Font.STZHONGS_Font');
        const add=fontSize=>{
            const label=UE.NewObject(UE.TextBlock.StaticClass(),host),font=new UE.SlateFontInfo();font.FontObject=fontObject;font.TypefaceFontName='Default';font.Size=fontSize;
            label.SetFont(font);label.SetJustification(UE.ETextJustify.Right);label.SetShadowOffset(new UE.Vector2D(1,1));label.SetShadowColorAndOpacity(new UE.LinearColor(0,0,0,0.9));
            label.SetVisibility(UE.ESlateVisibility.HitTestInvisible);box.AddChildToVerticalBox(label);return label;
        };
        view={host,box:size,label:add(14),clock:add(26),hits:add(18),status:add(14),last:null};
        update(session);
    }catch(error){
        view=null;try{if(valid(size))size.RemoveFromParent();}catch(_){}
        throw error;
    }
}
function update(session,context){
    if(view&&(!valid(view.box)||!valid(view.host)||(view.host.IsActivated&&!view.host.IsActivated())))stop();
    const now=Date.now();
    if(!view&&context&&session.active&&!session.boss.training&&model.enabled(session.run)&&(now<lastSearch||now-lastSearch>1000)){
        lastSearch=now;const cls=UE.Class.Find('/Game/PBZContent/UI/FrontEnd/W_FrontEndHUDLayout.W_FrontEndHUDLayout_C');
        if(cls){const out=puerts.$ref(UE.NewArray(UE.UserWidget));UE.WidgetBlueprintLibrary.GetAllWidgetsOfClass(context,out,cls,false);const all=puerts.$unref(out);for(let i=0;i<all.Num();i++){const host=all.Get(i);if(valid(host)&&(!host.IsActivated||host.IsActivated())){attach(host,session);break;}}}
    }
    if(!view)return;
    const s=session.run,visible=session.active&&!session.boss.training&&model.enabled(s)&&!(session.cinematicActive&&!session.runInteractiveActive);
    view.box.SetVisibility(visible?UE.ESlateVisibility.HitTestInvisible:UE.ESlateVisibility.Collapsed);
    if(!visible)return;
    const time=s.options.timer==='series'?s.totalMs:s.attemptMs;
    const data={label:s.options.timer==='series'?'SERIES':s.options.timer==='fight'?'FIGHT':'CHALLENGE',clock:s.options.timer==='off'?'':model.formatTime(time),hits:s.options.hits66?'66 HITS · '+s.hits+' / 66':'',status:s.invalid?'CHECK DETECTION':s.phase==='failed'?'CHALLENGE OVER':s.phase==='finished'?'COMPLETE':s.reason==='pause'?'PAUSED':s.reason==='preparing'?'READY':s.phase==='between'?'FIGHT COMPLETE':''};
    const key=JSON.stringify(data);if(view.last===key)return;view.last=key;
    for(const name of ['label','clock','hits','status']){view[name].SetText(cpp.FText.FromString(data[name]));view[name].SetVisibility(data[name]?UE.ESlateVisibility.HitTestInvisible:UE.ESlateVisibility.Collapsed);}
    const color=new UE.SlateColor();color.SpecifiedColor=s.hits>=60?new UE.LinearColor(0.9,0.22,0.16,1):new UE.LinearColor(0.96,0.91,0.82,1);view.hits.SetColorAndOpacity(color);
}
exports.update=update;exports.stop=stop;
