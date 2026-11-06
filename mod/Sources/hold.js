"use strict";
const UE=require("ue");
function valid(object){try{return !!object&&UE.KismetSystemLibrary.IsValid(object);}catch(_){return false;}}
exports.configure=(...args)=>require("./run-setup-ui").configure(...args);
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
