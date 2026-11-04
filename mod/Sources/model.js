"use strict";
const copy = value => JSON.parse(JSON.stringify(value));
const GEAR_SECTIONS = ["Inventory", "AbilityNode_RenewalHun", "AbilityNode_RenewalHun_Climax", "PBZAppearanceComponent"];
function bossSnapshot(pristine, boss) {
    if (!boss || !boss.profile) throw new Error("Point de départ du boss indisponible");
    if (boss.id === "BP_Monster_ZuoShang_Ending"&&!boss.profile.transform) return copy(pristine);
    const root=copy(pristine),p=boss.profile;
    root.PBZGameSystem.CurrentLevelName=p.level;
    root.PBZGameSystem.LastSaveActorID=p.bell;
    root.PBZGameSystem.PlayerTransform=copy(p.transform);
    root.PBZGameSystem.ReviveTransform=copy(p.transform);
    root.PBZGameSystem.ReviveCameraRotation=copy(p.camera);
    root.PBZGameSystem.IsInTutorial=false;
    root.BellSaveID=p.bell;
    root.BellManager.SaveBellID=p.bell;root.BellManager.TeleportSaveBellID=p.bell;
    root.BellManager.RecentlyInteractedBellID=p.bell;
    root.BellManager.BrokenBellID=p.broken ? p.bell : "";
    root.BellManager.BrokenBellPrevMapName=p.level;
    root.BellManager.BrokenBellPlayerTransform=copy(p.transform);
    root.BellManager.SuspendedBrokenBellStates=[];
    root.BellManager.DisableTeleportBellIDs=[];
    if(!root.BellManager.ActivateBellIDs.includes(p.bell))root.BellManager.ActivateBellIDs.push(p.bell);
    root.Inventory.CurrentMapID=boss.map;
    // Restore the native encounter's saved actors and flow nodes. Leave unrelated
    // campaign gates in place so the preparation route remains accessible.
    const matchesActor=key=>p.clearActors.some(name=>key.includes(name));
    const ep=root.EventPipeline;
    // Restore the streaming population that belongs to this encounter. A late
    // campaign snapshot can otherwise keep its boss spawner unloaded entirely.
    if(p.loadLayers?.length||p.unloadLayers?.length){
        const load=new Set(p.loadLayers||[]),unload=new Set(p.unloadLayers||[]);
        ep.LoadedDataLayer=ep.LoadedDataLayer||{};ep.UnLoadedDataLayer=ep.UnLoadedDataLayer||{};
        ep.LoadedDataLayer[p.level]=[...new Set([...(ep.LoadedDataLayer[p.level]||[]).filter(x=>!unload.has(x)),...load])];
        ep.UnLoadedDataLayer[p.level]=[...new Set([...(ep.UnLoadedDataLayer[p.level]||[]).filter(x=>!load.has(x)),...unload])];
    }
    for(const section of [ep.ComponentInfoJson,ep.ComponentsOwnerActorInfo,root.LevelActorManager,root.AISystem.SpawnerSaveData])
        for(const key of Object.keys(section||{}))if(matchesActor(key))delete section[key];
    const removed=new Set(p.clearTags);
    ep.GlobalTags=(ep.GlobalTags||[]).filter(tag=>!removed.has(tag));
    for(const tag of p.addTags||[])if(!ep.GlobalTags.includes(tag))ep.GlobalTags.push(tag);
    for(const key of Object.keys(ep.ExecuteNodeGuid||{}))
        if(matchesActor(key)||p.nodeIDs.some(id=>key.endsWith(id)))delete ep.ExecuteNodeGuid[key];
    root.AISystem.ActiveEventVolumes=[];
    for(const id of boss.members)delete root.BossRecord[id];
    ep.CurrentPlayingID=0;ep.FlowPlaySeqID="";ep.FlowTags=[];
    root.CodexBossLabEncounter={id:boss.id,profile:p};
    return root;
}
function balanceInventory(inventory, level = 30) {
    level = Math.max(1, Math.min(30, Math.round(level)));
    for (const info of Object.values(inventory.MainWeaponInfos || {})) {
        info.WeaponLevel = level;
        info.ReincarnationCount = 0;
    }
    for (const info of Object.values(inventory.ShaChiWeaponInfo || {})) {
        info.ShaChiWeaponLevel = level;
        info.ReincarnationCount = 0;
    }
    for (const info of Object.values(inventory.AccessoryInfos || {})) info.ReincarnationCount = 0;
    return inventory;
}
function captureGear(root) {
    if (!root || !root.Inventory || !root.Inventory.MainWeaponInfos) throw new Error("Inventaire absent du point de contrôle");
    const gear = {};
    for (const name of GEAR_SECTIONS) if (root[name]) gear[name] = copy(root[name]);
    return gear;
}
function encounterSave(pristine, gear, difficulty, initialized, nightmare = false, balance = null) {
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 3 || nightmare) throw new Error("Difficulté inconnue");
    const root = copy(pristine);
    if (gear) for (const name of GEAR_SECTIONS) if (gear[name]) root[name] = copy(gear[name]);
    balanceInventory(root.Inventory, balance?.weaponLevel || 30);
    // Bosses, triggers and respawn position always come from the pristine world.
    for (const name of ["CurrentMapID", "CurrentMapLayer"]) {
        if (name in pristine.Inventory) root.Inventory[name] = pristine.Inventory[name];
        else delete root.Inventory[name];
    }
    for (const info of Object.values(root.Inventory.MedicineInfos || {})) {
        info.CurrentTime = info.MaxTime || 0;
        info.BuffRemainTime = 0;
    }
    root.PBZGameSystem.DifficultModeByte = difficulty;
    root.PBZGameSystem.CycleCount = 0;
    root.PBZGameSystem.bCanSelectNightMare = true;
    root.PBZGameSystem.NightmareSlotIndex = nightmare ? 0 : -1;
    root.PBZGameSystem.NightmareLineageId = nightmare ? "CB0551AB000000000000000000000002" : "";
    root.PBZGameSystem.NightmarePendingOverwriteOldLineageId = "";
    root.PBZGameSystem.PendingSettlementEnding = 0;
    root.PBZGameSystem.bIsFinishGame = false;
    root.Player.RemainingDays = 66;
    root.Player.IsCompleteRespawnSequence = false;
    root.CodexBossLabSession = { version: "0.5", encounter: pristine.CodexBossLabEncounter?.id || "BP_Monster_ZuoShang_Ending", initialized: !!initialized, difficulty };
    return root;
}
exports.captureGear = captureGear;
exports.encounterSave = encounterSave;
exports.balanceInventory = balanceInventory;
exports.bossSnapshot = bossSnapshot;
