const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('./boss-catalog.json');
const {bossSnapshot} = require('./model');
const id = 'BP_Monster_HuaShan_RedTroop_BigBro';
const boss = catalog.find(x => x.id === id);
// Authored seven-member group in PBZ_Pangzhen_WP, not nearby unrelated mobs.
const spawners = [
  'BP_AISpawner_C_UAID_E89C25A750C72DE302_1591131170',
  'BP_AISpawner_C_UAID_E89C25A750C72DE302_1517928169',
  'BP_AISpawner_C_UAID_E89C25A750C72CE302_1744151987',
  'BP_AISpawner_C_UAID_E89C25A750C7F6E102_2002111428',
  'BP_AISpawner_C_UAID_E89C25A750C7A0CB02_2042446446',
  'BP_AISpawner_C_UAID_E89C25A750C729E302_2019269458',
  'BP_AISpawner_C_UAID_E89C25A750C72AE302_1256505636'
];
const domain = 'PBZ_MobDomain_C_UAID_E89C25A750C736E302_1126457833';
const blue = catalog.find(x => x.id === 'BP_Monster_HuaShan_Blue');
const blueSpawners = [
  ...['1979997677', '1979998678', '1980000681', '1979998679', '1980001682',
    '1980002684', '1979999680', '1980002683', '1980005686', '1980006688', '1980006687']
    .map(x => 'BP_AISpawner_C_UAID_0A6230820DE85F4502_' + x),
  'BP_AISpawner_C_UAID_E89C25A7516AEC7302_1405639150'
];
test('JianZhen restores both authored groups while native scripts retain phase and final victory ownership', () => {
  assert.deepEqual(new Set(blue.profile.spawners), new Set(blueSpawners));
  for (const name of blueSpawners) assert.ok(blue.profile.clearActors.includes(name), name);
  assert.equal(blue.profile.nativeController, true);
  assert.equal(blue.profile.nativeSupportAI, undefined);
  assert.deepEqual(blue.members, ['BP_Monster_HuaShan_Blue', 'BP_Monster_HuaShan_JianOu']);
  assert.equal(blue.classes.length, 2);
  assert.equal(blue.unlockTag, 'zddy.击杀.剑阵2');
  assert.ok(blue.profile.unloadLayers.some(x => x.endsWith('/DaYingJianZhen_P2.DaYingJianZhen_P2')));
  assert.deepEqual(blue.supportClasses.map(x => x.split('.').pop()), [
    'BP_Monster_HuaShan_White_C', 'BP_Monster_HuaShan_CaoOu_C', 'BP_Monster_EMei_Sword_JianZhen_C'
  ]);
  const proof = require('./population-proof.json').find(x => x.id === blue.id);
  assert.deepEqual(proof.phaseGroups.map(x => x.members.length), [7, 5]);
  assert.deepEqual(new Set(proof.spawners.map(x => x.name)), new Set(blueSpawners));
});
test('JianZhen clears saved support deaths in both phases without removing unrelated state or mutating campaign', () => {
  const saved = () => Object.fromEntries([...blueSpawners, 'UnrelatedSpawner'].map(x => ['World.PersistentLevel.' + x, {dead:true}]));
  const seed = {
    PBZGameSystem:{CompleteAddItemMobDomainNames:[blue.profile.domains[0], 'OtherDomain']},
    BellManager:{ActivateBellIDs:[]}, Inventory:{},
    EventPipeline:{ComponentInfoJson:saved(), ComponentsOwnerActorInfo:saved(), ExecuteNodeGuid:saved(),
      GlobalTags:['zddy.击杀.剑阵1', 'zddy.击杀.剑阵2', 'zddy.剑阵.二阶段', 'UnrelatedTag']},
    LevelActorManager:saved(), AISystem:{SpawnerSaveData:saved()},
    BossRecord:{BP_Monster_HuaShan_Blue:true, BP_Monster_HuaShan_JianOu:true, UnrelatedBoss:true}
  };
  const before = JSON.stringify(seed), result = bossSnapshot(seed, blue, {direct:true});
  for (const section of [result.EventPipeline.ComponentInfoJson, result.EventPipeline.ComponentsOwnerActorInfo,
    result.EventPipeline.ExecuteNodeGuid, result.LevelActorManager, result.AISystem.SpawnerSaveData])
    assert.deepEqual(Object.keys(section), ['World.PersistentLevel.UnrelatedSpawner']);
  assert.deepEqual(result.EventPipeline.GlobalTags, ['UnrelatedTag']);
  assert.deepEqual(result.BossRecord, {UnrelatedBoss:true});
  assert.deepEqual(result.PBZGameSystem.CompleteAddItemMobDomainNames, ['OtherDomain']);
  assert.equal(JSON.stringify(seed), before);
});
test('BigBro restores all six authored supports without changing primary completion identity', () => {
  assert.deepEqual(new Set(boss.profile.spawners), new Set(spawners));
  assert.deepEqual(new Set(boss.profile.clearActors), new Set([...spawners, domain]));
  assert.deepEqual(boss.members, [id]);
  assert.equal(boss.profile.nativeSupportAI, true);
  assert.deepEqual(catalog.filter(b=>b.profile?.nativeSupportAI).map(b=>b.id), [id]);
  assert.equal(boss.classes.length, 1);
  assert.match(boss.classes[0], /BigBro_C$/);
  assert.deepEqual(boss.supportClasses, ['/PBZCombatAsset/ActorData/Mobs/035_HuaShan/BP_Monster_HuaShan_RedTroop_Soldier.BP_Monster_HuaShan_RedTroop_Soldier_C']);
  assert.deepEqual(require('./boss-catalog.js'), catalog);
});
test('late-campaign support deaths are removed from every saved actor section, preserving unrelated progress', () => {
  const authored = [...spawners, domain].map(x => 'World.PersistentLevel.' + x);
  const saved = () => Object.fromEntries([...authored, 'World.PersistentLevel.UnrelatedSpawner'].map(x => [x, {dead:true}]));
  const seed = {
    PBZGameSystem: {CompleteAddItemMobDomainNames:[domain, 'UnrelatedDomain']},
    BellManager:{ActivateBellIDs:[]}, Inventory:{},
    EventPipeline:{ComponentInfoJson:saved(), ComponentsOwnerActorInfo:saved(), ExecuteNodeGuid:saved(), GlobalTags:['pz.击杀.再会兄长怪物', 'UnrelatedTag']},
    LevelActorManager:saved(), AISystem:{SpawnerSaveData:saved()}, BossRecord:{[id]:true, UnrelatedBoss:true}
  };
  const before = JSON.stringify(seed);
  const result = bossSnapshot(seed, boss, {direct:true});
  for (const section of [result.EventPipeline.ComponentInfoJson, result.EventPipeline.ComponentsOwnerActorInfo, result.EventPipeline.ExecuteNodeGuid, result.LevelActorManager, result.AISystem.SpawnerSaveData]) {
    assert.deepEqual(Object.keys(section), ['World.PersistentLevel.UnrelatedSpawner']);
  }
  assert.deepEqual(result.PBZGameSystem.CompleteAddItemMobDomainNames, ['UnrelatedDomain']);
  assert.deepEqual(result.EventPipeline.GlobalTags, ['UnrelatedTag']);
  assert.deepEqual(result.BossRecord, {UnrelatedBoss:true});
  assert.equal(JSON.stringify(seed), before, 'source campaign snapshot stays untouched');
});

test('MuXiaoKui preserves native third-phase pair and resets both support deaths without counting them as final victory', () => {
  const mux = catalog.find(x => x.id === 'BP_Monster_MuXiaoKui');
  const pair = ['BP_AISpawner_C_UAID_74563C6BC2BD12B902_1163530142', 'BP_AISpawner_C_UAID_74563C6BC2BD12B902_1168010143'];
  for (const name of pair) {
    assert.ok(mux.profile.spawners.includes(name));
    assert.ok(mux.profile.clearActors.includes(name));
  }
  assert.equal(mux.profile.spawners.length, 4);
  assert.deepEqual(mux.members, ['BP_Monster_MuXiaoKui', 'BP_Monster_MuXiaoKui_P2']);
  assert.equal(mux.unlockTag, 'ljc.沐小葵.战斗结束');
  assert.deepEqual(mux.supportClasses.map(x => x.split('.').pop()), ['BP_Monster_Yuu_C', 'BP_Monster_TieGui_C']);
  const saved = () => Object.fromEntries([...pair, 'Unrelated'].map(x => ['World.PersistentLevel.'+x, {dead:true}]));
  const seed = {PBZGameSystem:{}, BellManager:{ActivateBellIDs:[]}, Inventory:{},
    EventPipeline:{ComponentInfoJson:saved(), ComponentsOwnerActorInfo:saved(), ExecuteNodeGuid:saved(),
      GlobalTags:['ljc.沐小葵.玉妖铁鬼死亡', mux.unlockTag, 'UnrelatedTag']},
    AISystem:{SpawnerSaveData:saved()}, LevelActorManager:saved(), BossRecord:{}};
  const before = JSON.stringify(seed), result = bossSnapshot(seed, mux, {direct:true});
  for (const section of [result.EventPipeline.ComponentInfoJson, result.EventPipeline.ComponentsOwnerActorInfo,
    result.EventPipeline.ExecuteNodeGuid, result.LevelActorManager, result.AISystem.SpawnerSaveData])
    assert.deepEqual(Object.keys(section), ['World.PersistentLevel.Unrelated']);
  assert.deepEqual(result.EventPipeline.GlobalTags, ['UnrelatedTag']);
  assert.equal(JSON.stringify(seed), before);
});

test('phase-three duo restores four spawners but preserves the earlier consumed intro and waits for native final QTE',()=>{
  const pair=catalog.find(b=>b.id==='BP_Monster_Yuu'),p=pair.profile;
  const oldOwner='BP_FlowActor_C_UAID_E89C25A75434854402_1102432945';
  const oldKey=oldOwner+'_45E7FC774A947B74A54E83A880915116';
  const gateKey=p.directEntry.volumeOwner+'_622055234BCA302993E1CB814D62250F';
  assert.deepEqual(pair.members,['BP_Monster_Yuu','BP_Monster_TieGui']);assert.equal(pair.classes.length,2);
  assert.equal(p.nativeController,true);assert.equal(p.spawners.length,4);assert.equal(pair.unlockTag,'ljc.沐小葵.战斗结束');
  assert.equal(p.clearActors.includes(oldOwner),false);
  const seed={PBZGameSystem:{},BellManager:{ActivateBellIDs:[]},Inventory:{},
    BossRecord:{BP_Monster_Yuu:true,BP_Monster_TieGui:true},AISystem:{SpawnerSaveData:Object.fromEntries(p.spawners.map(x=>[x,{dead:true}]))},
    EventPipeline:{ExecuteNodeGuid:{[oldKey]:true,[gateKey]:true},GlobalTags:['hp.击杀.沐小葵','hp.击杀.沐小葵二阶段','ljc.沐小葵.玉妖铁鬼死亡',pair.unlockTag,'UnrelatedTag']}};
  const before=JSON.stringify(seed),result=bossSnapshot(seed,pair,{direct:true});
  assert.deepEqual(result.EventPipeline.ExecuteNodeGuid,{[oldKey]:true});assert.deepEqual(result.AISystem.SpawnerSaveData,{});
  assert.deepEqual(result.BossRecord,{});assert.deepEqual(result.EventPipeline.GlobalTags,['UnrelatedTag','ljc.沐小葵.满足额外剧情条件']);
  assert.equal(JSON.stringify(seed),before);
});


test('XiaoXue resets the exact completed-quest entrance blocker while preserving collection progress',()=>{
 const boss=catalog.find(b=>b.id==='BP_Monster_XiaoXue');
 const completed='ljc.小雪.完成',intro='ljc.小雪.出场',kill='ljc.击杀.小雪';
 const keep=['ljc.小雪.收集物1','ljc.小雪.收集物2','ljc.小雪.收集物3','UnrelatedQuest.Completed'];
 const deathOwner='BP_FlowActor_C_UAID_E89C25A75434724A02_2052069363';
 assert.ok(boss.profile.clearTags.includes(completed));assert.ok(boss.profile.clearActors.includes(deathOwner));
 assert.ok(boss.profile.nodeIDs.includes('71AC88A44D03C14361C2459B9FCDEFFC'));
 assert.ok(boss.profile.nodeIDs.includes('E97E7D76404CCECF40C63C96381A24E0'));
 const seed={PBZGameSystem:{},BellManager:{ActivateBellIDs:[]},Inventory:{},BossRecord:{},AISystem:{},
  EventPipeline:{GlobalTags:[completed,intro,kill,...keep]}};
 const before=JSON.stringify(seed),result=bossSnapshot(seed,boss,{direct:true});
 assert.deepEqual(result.EventPipeline.GlobalTags,keep);assert.equal(JSON.stringify(seed),before);
 assert.equal(boss.unlockTag,kill);assert.deepEqual(require('./boss-catalog.js'),catalog);
});
