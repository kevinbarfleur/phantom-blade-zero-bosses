"use strict";
const owners=require('./entrance-owners');
exports.owner=profile=>{
    const entry=profile?.directEntry;if(!entry)return null;
    if((profile.attachedEntranceFlows||[]).includes(entry.graph))return {kind:'pawn'};
    if(/^BP_FlowActor/.test(entry.volumeOwner||''))return {kind:'actor',name:entry.volumeOwner,class:'/Game/PBZContent/Blueprint/FlowGraph/FlowActor/BP_FlowActor.BP_FlowActor_C'};
    return owners[entry.graph]||null;
};
// This non-default pin is proven on the authored phase-three gate only.
exports.signalPin=profile=>{
    const entry=profile?.directEntry;
    if(!entry?.signalPin||entry.signalPin==='Out')return 'Out';
    if(entry.signalPin==='Match'&&entry.graph==='/Game/PBZContent/Blueprint/FlowGraph/QuestFlowGraph/HuPan/BPF_MuXiaoKuiDeath'&&entry.node==='C23C79A8-40DF9002-64651C89-37F6B84A')return 'Match';
    return null;
};
exports.manual=profile=>{
    const entry=profile?.directEntry;
    return !!(exports.signalPin(profile)&&entry?.kind==='native-entry-volume'&&entry.dispatch!=='native-overlap'&&typeof entry.graph==='string'&&entry.graph.startsWith('/Game/')&&entry.sequences?.length&&/^[0-9a-f]{8}(?:-[0-9a-f]{8}){3}$/i.test(entry.node||'')&&exports.owner(profile));
};
