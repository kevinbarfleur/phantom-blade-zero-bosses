"use strict";
// Same global collection asset and traversal used by the game's completion screen.
// Read the denominator (possible pickups), never the player's collected-item state.
const completion = require("../Library/MapItemCompletionCalc");
const proof = require("./campaign-proof");
function collect(context) {
    const asset = completion.getPlayerMapItemDataAsset(context);
    if (!asset || !asset.MapItemDatas) throw new Error("Le catalogue d'obtention du jeu n'est pas disponible");
    const result = {source:"BP_UIGameplayLogicComponent.BP_MapItem.MapItemDatas + " + proof.source, main:JSON.parse(JSON.stringify(proof.initialMain)), edges:JSON.parse(JSON.stringify(proof.initialEdges)), maps:[], excludedMaps:[]};
    const map = asset.MapItemDatas;
    function addRows(rows, target, mapID) {
        for (let i = 0; i < rows.Num(); i++) {
            const row = rows.GetRef(i);
            if (!row) continue;
            const id = String(row.WeaponID);
            if (!id || id.toLowerCase() === "none") continue;
            const nodeGuids = [];
            const guids = row.NodeGuids;
            if (guids) for (let n = 0; n < guids.Num(); n++) nodeGuids.push(String(guids.Get(n)));
            const origin = {map:mapID,saveGuid:String(row.SaveGuidString || ""),mobDomain:String(row.MobDomainName || ""),nodeGuids};
            if (!target[id]) target[id] = [];
            target[id].push(origin);
        }
    }
    for (let i = 0; i < map.GetMaxIndex(); i++) {
        if (!map.IsValidIndex(i)) continue;
        const mapID = String(map.GetKey(i));
        if (!proof.activeMaps[mapID]) { result.excludedMaps.push(mapID); continue; }
        const data = map.GetRef(mapID);
        if (!data) continue;
        result.maps.push(mapID);
        addRows(data.WeaponItemDatas, result.main, mapID);
        addRows(data.ShaChiWeaponItemDatas, result.edges, mapID);
    }
    void asset.MapItemDatas;
    if (!Object.keys(result.main).length || !Object.keys(result.edges).length) throw new Error("Le catalogue d'obtention est vide");
    return result;
}
exports.collect = collect;
