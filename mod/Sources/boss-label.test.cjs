const test=require('node:test'),assert=require('node:assert/strict');
const {resolve}=require('./boss-label'),catalog=require('./boss-catalog');
test('duo resolves both native localized short names without hardcoding their language',()=>{
 const boss=catalog.find(b=>b.id==='BP_Monster_Yuu');
 assert.deepEqual(boss.nameKeys,['BossName_040','BossName_020_3']);
 const names={'BossName_040':'Danseuse de jade, gardienne','BossName_020_3':'Démon de fer, gardien'};
 assert.equal(resolve(boss,k=>names[k]),'Danseuse de jade & Démon de fer');
 assert.equal(resolve(boss,k=>({'BossName_040':'Jade Dancer, guardian','BossName_020_3':'Iron Demon, guardian'})[k]),'Jade Dancer & Iron Demon');
});
test('ordinary labels and epithets keep their previous display behavior',()=>{
 assert.equal(resolve({nameKey:'x'},()=> 'Nom, titre'),'Nom, titre');
 assert.equal(resolve({nameKey:'x'},()=> 'Nom, titre',true),'Nom');
 assert.equal(resolve({label:'Entrée'},()=>{throw Error('unneeded lookup');}),'Entrée');
 assert.equal(resolve(null,()=>null),'BOSSES');
});
test('former solo remains historical metadata but is not a second selectable or sequential fight',()=>{
 const duo=catalog.find(b=>b.id==='BP_Monster_Yuu'),old=catalog.find(b=>b.id==='BP_Monster_TieGui');
 const active=catalog.filter(b=>b.available!==false);
 assert.equal(active.length,59);assert.equal(old.available,false);assert.equal(old.deprecatedAliasOf,duo.id);
 assert.ok(old.profile);assert.ok(old.unavailableReason);assert.ok(!active.includes(old));
 assert.deepEqual(duo.members,['BP_Monster_Yuu','BP_Monster_TieGui']);
 assert.equal(duo.profile.nativeController,true);assert.equal(duo.unlockTag,'ljc.沐小葵.战斗结束');
 assert.equal(active[active.indexOf(duo)+1].id,'BP_Monster_GuiChai_Red');
});
