const test=require('node:test'),assert=require('node:assert/strict');
const model=require('./model'),catalog=require('./boss-catalog.json');
test('Meng Hua keeps her first-phase prerequisite while clearing the ending trigger in a completed donor',()=>{
 const boss=catalog.find(b=>b.id==='BP_Monster_MengHua'),prerequisite='dhs.击杀.冷荼',defeated='dhs.击杀.梦华';
 const seed={PBZGameSystem:{},Inventory:{},BellManager:{ActivateBellIDs:[]},EventPipeline:{GlobalTags:[prerequisite,defeated,'dhy.结局.真龙之躯','Unrelated']},AISystem:{SpawnerSaveData:{}},BossRecord:{}};
 const out=model.bossSnapshot(seed,boss,{direct:true});
 assert.deepEqual(out.EventPipeline.GlobalTags,[prerequisite,'dhy.结局.真龙之躯','Unrelated']);
 assert(seed.EventPipeline.GlobalTags.includes(defeated));
});
test('Hua resets the authored introduction that changes her from a cinematic actor into a fight',()=>{
 const boss=catalog.find(b=>b.id==='BP_Monster_AHua_GuiTouDao'),p=boss.profile;
 const intro='xg.新娘阿花.出场',node='FC0ACE564D0F90AEC5C45E978C925339',domain=p.domains[0];
 const seed={PBZGameSystem:{CompleteAddItemMobDomainNames:[domain+'+Reward','OtherDomain+Reward']},Inventory:{},BellManager:{ActivateBellIDs:[]},EventPipeline:{GlobalTags:[intro,'xg.击杀.新娘阿花','Unrelated'],ExecuteNodeGuid:{['Actor'+node]:true,OtherNode:true}},AISystem:{SpawnerSaveData:{}},BossRecord:{BP_Monster_AHua_GuiTouDao:1}};
 const out=model.bossSnapshot(seed,boss,{direct:true});
 assert(p.clearTags.includes(intro));assert(p.nodeIDs.includes(node));
 assert.equal(p.directEntry.kind,'native-entry-volume');assert(p.directEntry.sequences.some(s=>s.includes('/Seq016/')));
 assert.deepEqual(p.directEntry.transform.Location,{X:-69651.69,Y:210061.08,Z:-19330});
 assert.deepEqual(out.PBZGameSystem.PlayerTransform.Location,p.directEntry.crossing);
 assert.deepEqual(out.EventPipeline.GlobalTags,['Unrelated']);assert.deepEqual(out.EventPipeline.ExecuteNodeGuid,{OtherNode:true});
 assert.deepEqual(out.PBZGameSystem.CompleteAddItemMobDomainNames,['OtherDomain+Reward']);assert.equal(out.BossRecord.BP_Monster_AHua_GuiTouDao,undefined);
 assert(seed.EventPipeline.GlobalTags.includes(intro),'the donor snapshot remains immutable');
});

test('the first sword encounter resets its native spawner component flow and post-fight flag',()=>{
 const boss=catalog.find(b=>b.id==='BP_Monster_MobMan_Elite_Sword'),p=boss.profile;
 const tag='xg.残钢.爆血',node='F93E96ED49104FF40B8865B42AF259C8';
 assert(p.graphs.some(x=>x.endsWith('/BPF_XiuRen')));assert(p.nodeIDs.includes(node));assert(p.clearTags.includes(tag));
 assert.deepEqual(p.nativeCombatActivation,{becomeMonster:true,attackable:true});
 const seed={PBZGameSystem:{},Inventory:{},BellManager:{ActivateBellIDs:[]},EventPipeline:{GlobalTags:[tag,'Unrelated'],ExecuteNodeGuid:{['Actor'+node]:true}},AISystem:{SpawnerSaveData:{}},BossRecord:{}};
 const out=model.bossSnapshot(seed,boss,{direct:true});
 assert.deepEqual(out.EventPipeline.GlobalTags,['Unrelated']);assert.deepEqual(out.EventPipeline.ExecuteNodeGuid,{});
 assert.deepEqual(out.PBZGameSystem.ReviveCameraRotation,p.directEntry.transform.Rotation,'native landing must not restore the old bell camera heading');
 assert.deepEqual(out.PBZGameSystem.PlayerTransform.Location,p.transform.Location,'retain the safe bell streaming location');
 assert.deepEqual(out.PBZGameSystem.PlayerTransform.Rotation,p.transform.Rotation,'native checkpoint spawning remains unchanged');
 assert.deepEqual(out.PBZGameSystem.ReviveTransform,out.PBZGameSystem.PlayerTransform);
 assert(Math.abs(p.transform.Rotation.Yaw-p.directEntry.transform.Rotation.Yaw)>100,'regression fixture has a large bell/arena heading difference');
 assert.equal(p.transform.Rotation.Yaw,159.5662544979367,'catalogue bell transform remains immutable');
 assert.deepEqual(model.bossSnapshot(seed,boss).PBZGameSystem.PlayerTransform,p.transform,'ordinary checkpoint launch preserves native bell heading');
 assert.equal(p.directEntry.kind,'native-arena-approach');assert.equal(p.directEntry.waypoints.length,0);
});
