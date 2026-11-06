"use strict";
const UE=require("ue"),puerts=require("puerts");
function object(wrapper){
    const ok=puerts.$ref(false),str=puerts.$ref("");
    UE.JSONUtility.JsonToString(wrapper,ok,str);
    if(!puerts.$unref(ok))throw Error("Equipment could not be read");
    return JSON.parse(puerts.$unref(str));
}
function capture(context,saveLoad,param){
    const pack=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.PBZBackPackSubsystem.StaticClass());
    if(!pack||typeof pack.PreSaveGame!=="function")throw Error("Inventory is not ready");
    // Serialize only the backpack. The native full-world PreSaveGame also visits
    // quest actors and cinematic state that do not belong in a replay checkpoint.
    pack.PreSaveGame(param);
    const result={};
    for(const key of ["Inventory","AbilityNode_RenewalHun","AbilityNode_RenewalHun_Climax","PBZAppearanceComponent"]){
        const ref=puerts.$ref(new UE.JsonObjectWrapper());
        if(saveLoad.GetDirtySectionCopy(key,ref))result[key]=object(puerts.$unref(ref));
    }
    if(!result.Inventory?.MainWeaponInfos)throw Error("Equipment missing from inventory");
    // GetDirtySectionCopy can retain the slots from the last loaded section,
    // even after PreSaveGame serializes a new backpack. Read the equipped slots
    // from the same live subsystem used by the native equipment screen.
    const slots=value=>{const out=[];for(let i=0;i<value.Num();i++)out.push(String(value.Get(i)));return out;};
    const inv=result.Inventory;
    inv.MainWeapons=slots(pack.MainWeapons);
    inv.ShaqiWeapons=slots(pack.ShaqiWeapons);
    inv.AccessoryIDs=slots(pack.AssemblyAccessory);
    const mainIndex=pack.GetCurrentMainWeaponIndex();
    if(mainIndex>=0&&mainIndex<inv.MainWeapons.length)inv.CurrentMainWeaponID=inv.MainWeapons[mainIndex];
    inv.CurrentShaqiWeaponIndex=pack.GetCurrentShaqiWeaponIndex();
    return result;
}
exports.capture=capture;
