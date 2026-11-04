"use strict";
const UE = require("ue"), puerts = require("puerts");
const acquisition = require("./acquisition");
function keys(map) { const result = []; for (const [id] of map) result.push(id); return result; }
function describeWeapon(pack, id, main, obtainable) {
    const data = main ? pack.GetMainWeaponTableData(id) : pack.GetShaqiWeaponTableData(id);
    if (!data) return {id, accepted:false, reason:"missing-table-row"};
    const nameKey = String(data.WeaponName.Key || "");
    const name = nameKey ? UE.KismetTextLibrary.Conv_TextToString(UE.PBZBlueprintFunctionLibrary.MakeTextByKey(nameKey)) : "";
    const snap = main ? data.WeaponSnapSoulData : data.ShaChiWeaponSnapSoulData;
    const iconPath = icon => icon && UE.KismetSystemLibrary.IsValidSoftObjectReference(icon) ? String(UE.KismetSystemLibrary.Conv_SoftObjectReferenceToString(icon)) : "";
    const render = iconPath(data.RenderIcon) || (snap && iconPath(snap.RenderIcon)) || "";
    const white = iconPath(main ? data.White : data.WhiteIcon) || (snap && iconPath(snap.WhiteIcon)) || "";
    const scenario = id === "WoodenSword" || /Prologue$|_HorseCartCombat$/i.test(id);
    const placeholder = /placeholder|defaulttexture|engine\/|testtexture|debug/i.test(render + " " + white);
    const origins = obtainable ? (main ? obtainable.main : obtainable.edges)[id] || [] : [];
    const accepted = origins.length > 0 && !scenario;
    return {id, nameKey, name, render, white, origins, accepted, artworkComplete:!!render&&!!white&&!placeholder, reason:scenario?"scenario-variant":!origins.length?"no-campaign-acquisition":"campaign-acquisition"};
}
function initialize(context) {
    const pack = UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context, UE.PBZBackPackSubsystem.StaticClass());
    const system = UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context, UE.PBZGameSystem.StaticClass());
    if (!pack || !system) throw new Error("Inventaire pas encore disponible");
    const cycle = system.GetCycleCount();
    const obtainable = acquisition.collect(context);
    const counts = { weapons: 0, edges: 0, accessories: 0, medicines: 0, missed: 0, catalog: [], acquisition:obtainable };
    try {
        // Lab uses the base game's balance: Lv30, forging, no NG+ reincarnations.
        if (cycle !== 0) throw new Error("Le laboratoire attend un monde au cycle zéro");
        pack.GetAllWeaponsByDataTable();
        for (const command of ["GM_GetAllWeaponLockTags", "GM_GetAllAccessories", "GetAllMedicines"]) UE.KismetSystemLibrary.ExecuteConsoleCommand(context, command);
        const table = UE.DataTable.Load("/Game/PBZContent/DataTable/UI/DT_MedicineTable.DT_MedicineTable");
        const namesRef = puerts.$ref(UE.NewArray(UE.BuiltinName));
        UE.DataTableFunctionLibrary.GetDataTableRowNames(table, namesRef);
        const names = puerts.$unref(namesRef);
        for (let i = 0; i < names.Num(); i++) pack.PushMedicineToInventory(names.Get(i), true);
        for (const main of [true, false]) {
            const ids = keys(main ? pack.MainWeaponInfos : pack.ShaqiWeaponInfos);
            for (const id of ids) {
                const entry = describeWeapon(pack, id, main, obtainable); entry.main = main; counts.catalog.push(entry);
                if (!entry.accepted) { (main ? pack.MainWeaponInfos : pack.ShaqiWeaponInfos).Remove(id); continue; }
                const max = Math.min(30, pack.GetWeaponMaxLevel(id, main));
                const current = main ? pack.MainWeaponInfos.Get(id).WeaponLevel : pack.ShaqiWeaponInfos.Get(id).ShaChiWeaponLevel;
                if (current < max) pack.UpgradeWeapon(id, main, max - current);
                const supportsForge = !main || id !== "WoodenSwordHun";
                if (supportsForge) pack.SnapSoulWeapon(id, main);
                const actual = main ? pack.MainWeaponInfos.Get(id).WeaponLevel : pack.ShaqiWeaponInfos.Get(id).ShaChiWeaponLevel;
                entry.level = actual; entry.nativeMaximum = max;
                try {
                    const helper = require("../Library/UIHelper").default;
                    entry.forgedName = UE.KismetTextLibrary.Conv_TextToString(helper.getWeaponNameText(main, id, pack));
                } catch (_) {}
                if (actual < max) counts.missed++;
                if (supportsForge && !(main ? pack.MainWeaponInfos.Get(id) : pack.ShaqiWeaponInfos.Get(id)).bAlreadySnapSoul) counts.missed++;
                counts[main ? "weapons" : "edges"]++;
            }
        }
        for (const id of keys(pack.Accessories)) {
            const max = pack.GetAccessoryMaxRefineLevel(id), old = pack.Accessories.Get(id).CurrentLevel;
            if (old < max) pack.UpgradeAccessory(id, max - old);
            if (pack.Accessories.Get(id).CurrentLevel < max) counts.missed++;
            counts.accessories++;
        }
        for (const id of keys(pack.MedicineInfos)) {
            const max = pack.GetMedicineMaxLevel(id), old = pack.MedicineInfos.Get(id).CurrentLevel;
            if (old < max) pack.UpgradeMedicine(id, max - old);
            if (pack.MedicineInfos.Get(id).CurrentLevel < max) counts.missed++;
            counts.medicines++;
        }
        pack.RestoreQuickItems();
    } finally { system.SetCycleCount(cycle); }
    if (!counts.weapons || !counts.edges || !counts.accessories || !counts.medicines || counts.missed) throw new Error("Préparation incomplète : " + JSON.stringify(counts));
    return counts;
}
exports.initialize = initialize;
exports.describeWeapon = describeWeapon;
