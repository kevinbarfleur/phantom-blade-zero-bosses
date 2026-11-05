const test=require('node:test'),assert=require('node:assert/strict'),model=require('./model'),catalog=require('./boss-catalog'),proof=require('./environment-proof.json');
function donor(){
 const [summer,npc]=proof.loadLayers,[winter,monster]=proof.unloadLayers,level=proof.region;
 return {PBZGameSystem:{CurrentLevelName:level},BellManager:{ActivateBellIDs:[]},Inventory:{CurrentMapID:'FuJiZhiLin',MainWeaponInfos:{Sword:{WeaponLevel:30}},MedicineInfos:{}},Player:{},AISystem:{SpawnerSaveData:{}},BossRecord:{},LevelActorManager:{},EventPipeline:{GlobalTags:[...proof.resetTags,'story.other.region.complete'],LoadedDataLayer:{[level]:[winter,monster],OtherMap:['OtherLayer']},UnLoadedDataLayer:{[level]:[summer,npc]},ComponentInfoJson:Object.fromEntries(proof.resetActors.map(id=>[level+'-'+id,{completed:true}])),ComponentsOwnerActorInfo:{},ExecuteNodeGuid:{}}};
}
test('each early forest encounter restores its season and ordinary population from a late-game donor',()=>{
 assert.equal(proof.encounters.length,4);
 for(const id of proof.encounters){
  const seed=donor(),before=JSON.stringify(seed),boss=catalog.find(b=>b.id===id),r=model.bossSnapshot(seed,boss,{direct:true}),ep=r.EventPipeline;
  assert.equal(JSON.stringify(seed),before);
  for(const layer of proof.loadLayers){assert(ep.LoadedDataLayer[proof.region].includes(layer));assert(!ep.UnLoadedDataLayer[proof.region].includes(layer));}
  for(const layer of proof.unloadLayers){assert(!ep.LoadedDataLayer[proof.region].includes(layer));assert(ep.UnLoadedDataLayer[proof.region].includes(layer));}
  for(const tag of proof.resetTags)assert(!ep.GlobalTags.includes(tag));
  for(const owner of proof.resetActors)assert(!Object.keys(ep.ComponentInfoJson).some(k=>k.includes(owner)));
  assert(ep.GlobalTags.includes('story.other.region.complete'));assert.deepEqual(ep.LoadedDataLayer.OtherMap,['OtherLayer']);assert.equal(boss.profile.restoreLayersAfterArrival,true);
 }
});
test('retry and chosen equipment cannot reintroduce the late forest population',()=>{
 const boss=catalog.find(b=>b.id==='BP_Monster_LuanShi'),seed=donor(),gear=model.captureGear(seed);gear.Inventory.CurrentMainWeaponID='Chosen';gear.Inventory.CurrentMapID='SomewhereElse';
 const prepared=model.bossSnapshot(seed,boss,{direct:true}),r=model.encounterSave(prepared,gear,3,true,false,boss.balance);
 assert.equal(r.Inventory.CurrentMainWeaponID,'Chosen');assert.equal(r.Inventory.CurrentMapID,'FuJiZhiLin');assert.deepEqual(r.EventPipeline.LoadedDataLayer[proof.region],prepared.EventPipeline.LoadedDataLayer[proof.region]);
 for(const tag of proof.resetTags)assert(!r.EventPipeline.GlobalTags.includes(tag));
});
test('the later winter encounter and other chapters keep their own campaign environment',()=>{
 for(const id of ['BP_Monster_YuCong_P1','BP_Monster_TieGui']){
  const boss=catalog.find(b=>b.id===id),seed=donor(),r=model.bossSnapshot(seed,boss,{direct:true});
  assert.notEqual(boss.profile.restoreLayersAfterArrival,true);assert(r.EventPipeline.GlobalTags.includes(proof.resetTags[0]));
  assert(r.EventPipeline.LoadedDataLayer[proof.region].includes(proof.unloadLayers[0]));assert(!r.EventPipeline.LoadedDataLayer[proof.region].includes(proof.loadLayers[0]));
 }
});
