const test=require('node:test'),assert=require('node:assert/strict');
const model=require('./model'),bosses=require('./boss-catalog');
test('every encounter has bounded balance with evidence provenance',()=>{
 for(const b of bosses){assert(Number.isInteger(b.balance.weaponLevel));assert(b.balance.weaponLevel>=1&&b.balance.weaponLevel<=30);assert(['native-mob-group-area','regional-baseline'].includes(b.balance.source));}
 assert.equal(bosses.find(b=>b.id==='BP_Monster_HuaQianXIao').balance.weaponLevel,5);
 assert.equal(bosses.find(b=>b.id==='BP_Monster_ZuoShang_Ending').balance.weaponLevel,25);
 assert.deepEqual(bosses.filter(b=>b.trial).map(b=>b.balance.weaponLevel),[10,10,19,25,26]);
});
test('travelling both directions reapplies encounter level while preserving forge and equipped choices',()=>{
 const inv={MainWeaponInfos:{Tang:{WeaponLevel:30,AlreadySnapSoul:1,ReincarnationCount:6}},ShaChiWeaponInfo:{MoJian:{ShaChiWeaponLevel:30,AlreadySnapSoul:1}},CurrentMainWeaponID:'Tang',AccessoryInfos:{A:{CurrentLevel:4,ReincarnationCount:3}}};
 model.balanceInventory(inv,5);assert.equal(inv.MainWeaponInfos.Tang.WeaponLevel,5);assert.equal(inv.ShaChiWeaponInfo.MoJian.ShaChiWeaponLevel,5);assert.equal(inv.MainWeaponInfos.Tang.AlreadySnapSoul,1);assert.equal(inv.MainWeaponInfos.Tang.ReincarnationCount,0);assert.equal(inv.CurrentMainWeaponID,'Tang');
 model.balanceInventory(inv,25);assert.equal(inv.MainWeaponInfos.Tang.WeaponLevel,25);assert.equal(inv.ShaChiWeaponInfo.MoJian.ShaChiWeaponLevel,25);
});
