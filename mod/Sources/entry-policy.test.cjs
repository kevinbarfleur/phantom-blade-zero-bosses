const test=require('node:test'),assert=require('node:assert/strict'),policy=require('./entry-policy');
test('manual introductions require an authored graph, exact node and identified live owner',()=>{
 const graph='/Game/Introduction',entry={kind:'native-entry-volume',graph,node:'9860EF90-4BA16232-D05FB7BA-54DB496D',sequences:['/Sequence']};
 assert.equal(policy.manual({directEntry:entry,attachedEntranceFlows:[graph]}),true);
 assert.equal(policy.manual({directEntry:{...entry,volumeOwner:'BP_FlowActor_C_Authored'}}),true);
 for(const value of [{directEntry:entry},{directEntry:{...entry,node:'guess'},attachedEntranceFlows:[graph]},{directEntry:{...entry,sequences:[]},attachedEntranceFlows:[graph]},{directEntry:{...entry,kind:'native-arena-approach'},attachedEntranceFlows:[graph]}])assert.equal(policy.manual(value),false);
});
test('NPC-owned and final introductions resolve only their exact exported component owner',()=>{
 const proof=require('./entrance-owner-proof.json'),catalog=require('./boss-catalog.json');assert.equal(proof.length,4);
 for(const row of proof){const boss=catalog.find(b=>b.id===row.id);assert.equal(policy.manual(boss.profile),boss.profile.directEntry.dispatch!=='native-overlap');assert.deepEqual(policy.owner(boss.profile),row.owner);assert.equal(row.graph,boss.profile.directEntry.graph);assert(row.sourcePackage.endsWith('.umap'));assert.equal(row.sourceComponent,'BP_PBZFlowComponent');}
 assert.equal(policy.owner({directEntry:{graph:'/Unrelated/Graph',volumeOwner:'fixed-volume'}}),null);
});

test('entries requiring the native execution context retain their authored overlap trigger',()=>{
 const catalog=require('./boss-catalog.json');
 for(const id of ['BP_Monster_GuiChai_Red','BP_Monster_ChangHong_Spear','BP_Monster_PowerMan','BP_Monster_ZuoShang_Ending']){
  const p=catalog.find(b=>b.id===id).profile;assert.equal(p.directEntry.dispatch,'native-overlap');assert.equal(policy.manual(p),false);assert(p.directEntry.crossing);assert(p.clearActors.includes(policy.owner(p).name));
 }
});
