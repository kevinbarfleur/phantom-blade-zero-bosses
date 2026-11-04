"use strict";
const UE=require("ue"),puerts=require("puerts");
function object(wrapper){
    const ok=puerts.$ref(false),str=puerts.$ref("");
    UE.JSONUtility.JsonToString(wrapper,ok,str);
    if(!puerts.$unref(ok))throw Error("Lecture de l'équipement impossible");
    return JSON.parse(puerts.$unref(str));
}
function capture(context,saveLoad,param){
    const pack=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.PBZBackPackSubsystem.StaticClass());
    if(!pack||typeof pack.PreSaveGame!=="function")throw Error("L'inventaire n'est pas prêt");
    // Serialize only the backpack. The native full-world PreSaveGame also visits
    // quest actors and cinematic state that do not belong in a replay checkpoint.
    pack.PreSaveGame(param);
    const result={};
    for(const key of ["Inventory","AbilityNode_RenewalHun","AbilityNode_RenewalHun_Climax","PBZAppearanceComponent"]){
        const ref=puerts.$ref(new UE.JsonObjectWrapper());
        if(saveLoad.GetDirtySectionCopy(key,ref))result[key]=object(puerts.$unref(ref));
    }
    if(!result.Inventory?.MainWeaponInfos)throw Error("Équipement absent de l'inventaire");
    return result;
}
exports.capture=capture;
