"""Restore the authored streaming layers of an encounter, rather than late-game layers."""
import json,re,math
from pathlib import Path
base=Path(__file__).parent
catalog=json.loads((base/'boss-catalog.json').read_text(encoding='utf8'))
analysis={b['id']:b for b in json.loads((base/'encounter-analysis.json').read_text(encoding='utf8'))}
world_files={p.name.removesuffix('.umap.json'):p for p in (base.parent/'pbz-world-main').rglob('*.umap.json')}
cache={}
graphs=json.loads((base/'quest-graphs.json').read_text(encoding='utf8'))
flow_actors=json.loads((base/'world-flows.json').read_text(encoding='utf8'))
def world_index(world):
    if world not in cache:
        cache[world]={o['Name']:o for o in json.loads(world_files[world].read_text(encoding='utf8'))} if world in world_files else {}
    return cache[world]
def layer_path(obj):
    asset=obj.get('Properties',{}).get('DataLayerAsset',{})
    path=asset.get('ObjectPath','').rsplit('.',1)[0]
    return path+'.'+path.rsplit('/',1)[-1] if path else ''
for boss in catalog:
    profile=boss['profile'];world=profile['level'];index=world_index(world)
    primary=next((c for c in analysis.get(boss['id'],{}).get('candidates',[]) if c['world']==world and c['class']==boss['classes'][0]),None)
    if primary:profile['primarySpawnerActor']=primary['actor']['Name']
    layers=set();seen=set()
    for candidate in analysis.get(boss['id'],{}).get('candidates',[]):
        if candidate['world']!=world or candidate['class'] in seen:continue
        seen.add(candidate['class'])
        if '/_Generated_/' not in candidate['package']:continue
        cell=index.get(Path(candidate['package']).stem,{})
        for name in cell.get('Properties',{}).get('DataLayers',{}).get('DataLayers',[]):
            # The parent logic layers are already active in the campaign.
            # Saving their activation could recursively activate unrelated cells.
            path=layer_path(index.get(name,{}))
            if path:layers.add(path)
    # These two native seasonal layers share the same physical region. Loading
    # both would duplicate scenery and leave the campaign's winter population.
    unload=set()
    for path in layers:
        if path.endswith('_Summer.'+path.rsplit('/',1)[-1].split('.')[0]):
            unload.add(path.replace('_Summer','_Winter'))
        if path.endswith('_Winter.'+path.rsplit('/',1)[-1].split('.')[0]):
            unload.add(path.replace('_Winter','_Summer'))
    profile['loadLayers']=sorted(layers)
    # A cell can also reference optional rendering / event variants. The
    # campaign logic layer is sufficient for its authored spawners.
    if any(path.endswith('/Main_Logic.Main_Logic') for path in layers):
        profile['loadLayers']=[path for path in profile['loadLayers'] if not any(word in path for word in ['/NvRtx.','/202507_S_Party/'])]
    profile['unloadLayers']=sorted(unload-layers)
    if world=='PBZ_Fujizhilin_WP' and any('_Summer.' in path for path in layers):
        # The native weather controller observes this story flag on every load;
        # changing only the saved layer list gets immediately undone by it.
        profile['clearTags']=sorted(set(profile['clearTags'])|{'fjzl.风雪数据层.激活'})
        weather=next(g for g in graphs if g['name']=='BPF_DataLayer_Snow')
        profile['nodeIDs']=sorted(set(profile['nodeIDs'])|{o['Properties']['NodeGuid'].replace('-','') for o in weather['nodes'] if 'NodeGuid' in o.get('Properties',{})})
        for actor in flow_actors:
            if world not in actor['package']:continue
            if actor['actor'].get('Properties',{}).get('RootFlow',{}).get('ObjectPath','').rsplit('.',1)[0]==weather['path']:
                owner=actor['actor'].get('Outer',{}).get('ObjectName','').split('.')[-1].rstrip("'")
                profile['clearActors']=sorted(set(profile['clearActors'])|{owner})
    if boss['id']=='BP_Monster_HuaShan_Blue':
        table=next(o['Rows'] for o in json.loads(next((base.parent/'pbz-exports').rglob('DT_BellData.uasset.json')).read_text(encoding='utf8')) if 'Rows' in o)
        bell=next(v for v in table.values() if v['BellID']=='Bell_YXZR_012');tr=bell['TeleportTransform'];q=tr['Rotation']
        x,y,z,w=[q[k] for k in 'XYZW']
        rotation={'Roll':math.degrees(math.atan2(2*(w*x+y*z),1-2*(x*x+y*y))),'Pitch':math.degrees(math.asin(max(-1,min(1,2*(w*y-z*x))))),'Yaw':math.degrees(math.atan2(2*(w*z+x*y),1-2*(y*y+z*z)))}
        profile['bell']=bell['BellID'];profile['transform']={'Location':tr['Translation'],'Rotation':rotation};profile['camera']=bell['TeleportCameraRotation']
        profile['distance']=round(math.dist([tr['Translation'][k] for k in 'XYZ'],[profile['arena'][k] for k in 'XYZ']))
        profile['nativeController']=True
        profile['supportRadius']=6000
        boss['supportClasses']=['/PBZCombatAsset/ActorData/Mobs/035_HuaShan/BP_Monster_HuaShan_White.BP_Monster_HuaShan_White_C','/PBZCombatAsset/ActorData/Mobs/035_HuaShan/BP_Monster_HuaShan_CaoOu.BP_Monster_HuaShan_CaoOu_C']
        profile['entryWaypoints']=[{'X':28585.22,'Y':73690.47,'Z':7108.2295}]
        profile['clearTags']=sorted(set(profile['clearTags'])|{'zddy.击杀.剑阵2'})
        profile['unloadLayers']=sorted(set(profile['unloadLayers'])|{'/Game/DataLayers/T01_FirstStage_WP/202405DemoVersion/MainGameFlow/DaYingJianZhen_P2.DaYingJianZhen_P2'})
        # The codex unlocks after wave one; the native death flow finishes only
        # after wave two. Do not mistake a literature unlock for fight victory.
        boss['unlockTag']='zddy.击杀.剑阵2'
    if boss['id']=='BP_Monster_YuCong_P1':
        # P2 is observed, rather than assigned, in the native death graph. It
        # must be reset along with P3 or the new transition is never emitted.
        profile['clearTags']=sorted(set(profile['clearTags'])|{'fjzl.三头魔偶.p2'})
        boss['unlockTag']='fjzl.三头魔偶.死亡'
    if boss['id']=='BP_Monster_MuXiaoKui':
        # This is emitted by damage during phase two, not by a SetTag flow
        # node. Keeping the donor's value starts the QTE before the fight.
        profile['clearTags']=sorted(set(profile['clearTags'])|{'ljc.沐小葵.血量降低到25'})
        boss['unlockTag']='ljc.沐小葵.战斗结束'
    if boss['id']=='BP_Monster_ZuoShang_Ending':
        table=next(o['Rows'] for o in json.loads(next((base.parent/'pbz-exports').rglob('DT_BellData.uasset.json')).read_text(encoding='utf8')) if 'Rows' in o)
        bell=next(v for v in table.values() if v['BellID']=='BrokenBell_TheEnd01');tr=bell['TeleportTransform'];q=tr['Rotation']
        x,y,z,w=[q[k] for k in 'XYZW']
        rotation={'Roll':math.degrees(math.atan2(2*(w*x+y*z),1-2*(x*x+y*y))),'Pitch':math.degrees(math.asin(max(-1,min(1,2*(w*y-z*x))))),'Yaw':math.degrees(math.atan2(2*(w*z+x*y),1-2*(y*y+z*z)))}
        profile.update(bell=bell['BellID'],broken=True,checkpoint='native-bell',transform={'Location':tr['Translation'],'Rotation':rotation},camera=bell['TeleportCameraRotation'],verified=False,nativeController=True)
        profile['entryWaypoints']=[{'X':-193003.6,'Y':-115937.52,'Z':4500000.0}]
        selected=[g for g in graphs if g['name'] in ['BPF_ZuoShang_TheEnd_Chuchang','BPF_BigBoss_ZuoShang_Death']]
        profile['graphs']=[g['path'] for g in selected]
        profile['nodeIDs']=sorted({o['Properties']['NodeGuid'].replace('-','') for g in selected for o in g['nodes'] if 'NodeGuid' in o.get('Properties',{})})
        profile['clearTags']=sorted({'dhy.左殇.seqs023后','dhy.左殇.seqs023+后','dhs.击杀.左殇义体','dhs.击杀.左殇义体二阶段'}|{tag for g in selected for o in g['nodes'] if o['Type']=='SetTag_C' for tag in o.get('Properties',{}).get('AddTags',[])})
        profile['addTags']=['dhy.左殇.seqs022后']
        candidates=[c for c in analysis[boss['id']]['candidates'] if c['world']==world]
        profile['spawners']=[c['actor']['Name'] for c in candidates]
        profile['domains']=sorted({c['actor'].get('Properties',{}).get('SpawnInfo',{}).get('MobDomain',{}).get('SubPathString','').split('.')[-1] for c in candidates}-{''})
        owners={a['actor'].get('Outer',{}).get('ObjectName','').split('.')[-1].rstrip("'") for a in flow_actors if world in a['package'] and a['actor'].get('Properties',{}).get('RootFlow',{}).get('ObjectPath','').rsplit('.',1)[0] in profile['graphs']}
        profile['clearActors']=sorted(set(profile['spawners'])|set(profile['domains'])|owners)
        profile['primarySpawnerID']=candidates[0]['actor']['Properties'].get('SpawnerID','')
        profile['distance']=round(math.dist([tr['Translation'][k] for k in 'XYZ'],[profile['arena'][k] for k in 'XYZ']))
(base/'boss-catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf8')
(base/'boss-catalog.js').write_text('"use strict";\nmodule.exports = '+json.dumps(catalog,ensure_ascii=False)+';\n',encoding='utf8')
print('Encounter layers:',sum(bool(b['profile']['loadLayers']) for b in catalog),'of',len(catalog))
