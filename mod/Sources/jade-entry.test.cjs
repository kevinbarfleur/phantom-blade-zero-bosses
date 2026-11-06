const test=require('node:test'),assert=require('node:assert/strict');
const catalog=require('./boss-catalog.json'),runtime=require('./boss-catalog.js'),proof=require('./direct-entry-proof.json'),policy=require('./entry-policy');
const population=require('./population-proof.json');

test('Jade restores its authored Gold and Iron supports without promoting them to primary bosses',()=>{
 const boss=catalog.find(b=>b.id==='BP_Monster_JadeMaskMan'),row=population.find(r=>r.id===boss.id);
 assert.equal(boss.profile.primarySpawnerID,'JadeIntro_Jade');
 assert.deepEqual(boss.classes,['/Game/RenewalContent/Actors/Mobs/Normal/BP_Monster_JadeMaskMan.BP_Monster_JadeMaskMan_C']);
 assert.equal(row.domain,'BP_MobDomain_C_UAID_74563CC57EE2514C02_1635135171');
 assert.equal(row.terminalTag,'ddsd.击杀.玉面');
 assert.deepEqual(row.spawners.map(s=>s.spawnerID),['JadeIntro_Gold','JadeIntro_Iron','JadeIntro_Jade']);
 assert.equal(row.spawners.length,3);
 assert.deepEqual(boss.supportClasses,row.spawners.filter(s=>s.spawnerID!=='JadeIntro_Jade').map(s=>s.class));
 for(const spawner of row.spawners){assert(boss.profile.spawners.includes(spawner.name));assert(boss.profile.clearActors.includes(spawner.name));}
 assert.deepEqual(runtime,catalog);
});

test('Jade uses its authored Jade introduction, not the nearby MBoss introduction',()=>{
 const boss=catalog.find(b=>b.id==='BP_Monster_JadeMaskMan'),entry=boss.profile.directEntry;
 assert.equal(boss.profile.primarySpawnerID,'JadeIntro_Jade');
 assert.equal(entry.graph,'/Game/PBZContent/Blueprint/FlowGraph/QuestFlowGraph/DDSD/BPF_YuMianChuChang');
 assert.equal(entry.node,'2B9F52E9-4161CBD6-515BB480-71AD79B2');
 assert.deepEqual(entry.sequences,['/HuaShira/Animation/Seqs/JadeIntro/Jade_Intro.Jade_Intro']);
 assert.equal(policy.manual(boss.profile),true);
 assert.equal(policy.owner(boss.profile).name,'BP_FlowActor_C_UAID_74563CC57EE2693A02_1903534261');
 assert(boss.profile.clearActors.includes(entry.volumeOwner));
 assert(boss.profile.nodeIDs.includes(entry.node.replaceAll('-','')));
 const other=catalog.find(b=>b.id==='BP_Monster_MBoss').profile.directEntry;
 assert.notEqual(entry.graph,other.graph);assert.notEqual(entry.node,other.node);
 assert(!entry.sequences.some(sequence=>other.sequences.includes(sequence)));
});

test('Jade entry is on the native owner side and shipped catalog matches its route proof',()=>{
 const boss=catalog.find(b=>b.id==='BP_Monster_JadeMaskMan'),entry=boss.profile.directEntry;
 // Native SetExcuteType defaults UseSelfTransform=true. Its authored owner
 // is at (-60731.773,-94289.45,29424.12), yaw90, with extentX10.
 assert.deepEqual(entry.transform.Location,{X:-60731.773,Y:-94289.45,Z:29524.12});
 assert.deepEqual(entry.crossing,{X:-60731.773,Y:-94039.45,Z:29524.12});
 assert(entry.crossing.Y>entry.transform.Location.Y);
 assert(entry.transform.Location.Y>boss.profile.arena.Y);
 assert(Math.abs(entry.transform.Rotation.Yaw+90)<1);
 const {transform,waypoints,...route}=entry;
 assert.deepEqual(proof.find(row=>row.id===boss.id),{id:boss.id,...route});
 assert.deepEqual(runtime,catalog);
 // The native HuangXingZi death graph actually observes Jade quest tags;
 // this correction must not erase that separate campaign relationship.
 assert(boss.profile.graphs.some(graph=>graph.endsWith('/BPF_HuangXingZiDeath')));
});
