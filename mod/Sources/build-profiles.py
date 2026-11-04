import json, math, re
from pathlib import Path
base=Path(__file__).parent
bosses=json.loads((base/'boss-catalog.json').read_text(encoding='utf8'))
analysis={b['id']:b for b in json.loads((base/'encounter-analysis.json').read_text(encoding='utf8'))}
graphs=json.loads((base/'quest-graphs.json').read_text(encoding='utf8'))
flowActors=json.loads((base/'world-flows.json').read_text(encoding='utf8'))
def asset_refs(value):
    if isinstance(value,dict):
        for child in value.values():yield from asset_refs(child)
    elif isinstance(value,list):
        for child in value:yield from asset_refs(child)
    elif isinstance(value,str) and value.startswith('/Game/'):
        yield value.rsplit('.',1)[0]
graphPaths={g['path'] for g in graphs}
graphChildren={g['path']:set(asset_refs(g['nodes'])) & graphPaths for g in graphs}
deathScripts=json.loads((base/'death-scripts.json').read_text(encoding='utf8'))
bellTable=next(o['Rows'] for o in json.loads(next((base.parent/'pbz-exports').rglob('DT_BellData.uasset.json')).read_text(encoding='utf8')) if 'Rows' in o)
bellByID={b['BellID']:b for b in bellTable.values()}
bellInstances=[];scripts=[];allObjects=[]
for line in (base.parent/'pbz-world-gameplay/gameplay.jsonl').open(encoding='utf8'):
    d=json.loads(line);world=re.search(r'/([^/]+)(?:/_Generated_/[^/]+)?\.umap$',d['package']).group(1)
    for o in d['exports']:
        if 'MobGroupScript' in o['Type']:scripts.append({'world':world,'object':o})
        if 'Bell' in o['Type'] and o.get('Properties',{}).get('BellID') in bellByID:
            bellInstances.append({'world':world,'actor':o,'data':bellByID[o['Properties']['BellID']]})

def quat_rotation(q):
    x,y,z,w=[q.get(k,0 if k!='W' else 1) for k in 'XYZW']
    return {'Roll':math.degrees(math.atan2(2*(w*x+y*z),1-2*(x*x+y*y))),
            'Pitch':math.degrees(math.asin(max(-1,min(1,2*(w*y-z*x))))),
            'Yaw':math.degrees(math.atan2(2*(w*z+x*y),1-2*(y*y+z*z)))}

for b in bosses:
    if b['id']=='BP_Monster_ZuoShang_Ending' or b.get('trial'):continue
    choices=analysis[b['id']]['candidates']
    first=choices[0];world=first['world'];pos=first['root']['RelativeLocation']
    worldFlows=[f for f in flowActors if re.search(r'/'+re.escape(world)+r'(?:/_Generated_/[^/]+)?\.umap$',f['package'])]
    localGraphs={f['actor'].get('Properties',{}).get('RootFlow',{}).get('ObjectPath','').rsplit('.',1)[0] for f in worldFlows}
    # Spawner IDs are reused in later chapters. Only reset graphs attached to
    # this world, including their nested flow assets.
    queue=list(localGraphs)
    while queue:
        path=queue.pop()
        for child in graphChildren.get(path,set())-localGraphs:
            localGraphs.add(child);queue.append(child)
    members=[s for s in choices if s['world']==world]
    spawnNames={s['actor']['Name'] for s in members}
    spawnIDs={s['actor']['Properties'].get('SpawnerID') for s in members}-{None,'None',''}
    domains={s['actor']['Properties'].get('SpawnInfo',{}).get('MobDomain',{}).get('SubPathString','').split('.')[-1] for s in members}-{''}
    clearTags=set();clearActors=set(spawnNames)|domains
    if b.get('unlockTag') and b['unlockTag']!='None':clearTags.add(b['unlockTag'])
    for r in deathScripts:
        if not re.search(r'/'+re.escape(world)+r'(?:/_Generated_/[^/]+)?\.umap$',r['package']):continue
        o=r['actor']
        if any(n in str(o.get('Outer')) for n in spawnNames):clearTags.update(o.get('Properties',{}).get('EventTag',[]))
    for s in scripts:
        if s['world']==world and any(n in str(s['object'].get('Outer')) for n in domains):
            p=s['object'].get('Properties',{})
            for k in ['EventTag','AddTags','Tags']:
                clearTags.update(x for x in p.get(k,[]) if isinstance(x,str))
    related=[]
    for g in graphs:
        if g['path'] not in localGraphs:continue
        serialized=json.dumps(g,ensure_ascii=False)
        direct=any('"'+x+'"' in serialized for x in spawnIDs)
        battleName=any(word in g['name'].lower() for word in ['dead','death','battle','boss','combat','monster','fight','chuchang','ruzhan','ru_zhan'])
        if direct or (battleName and any('"'+x+'"' in serialized for x in clearTags)):related.append(g)
    # Cinematic spawners often have suffixed IDs (e.g. HookManP1_Seq022),
    # while the entrance graph refers to a runtime alias. Pair the native
    # entrance/death graph names within this world even when it has no tags.
    def combat_stem(name):return re.sub(r'_?(?:death|dead|chuchang|ruzhan|ru_zhan)(?:_\d+)?$','',name,flags=re.I).lower()
    stems={combat_stem(g['name']) for g in related}
    known={g['path'] for g in related}
    for g in graphs:
        if g['path'] in localGraphs and g['path'] not in known and combat_stem(g['name']) in stems and re.search(r'(?:chuchang|ruzhan|ru_zhan)(?:_\d+)?$',g['name'],re.I):
            related.append(g);known.add(g['path'])
    nodeIDs=set()
    for g in related:
        for o in g['nodes']:
            p=o.get('Properties',{})
            if 'NodeGuid' in p:nodeIDs.add(p['NodeGuid'].replace('-',''))
            if o['Type']=='SetTag_C':clearTags.update(p.get('AddTags',[]))
    paths={g['path'] for g in related}
    for f in worldFlows:
        p=f['actor'].get('Properties',{})
        path=p.get('RootFlow',{}).get('ObjectPath','').rsplit('.',1)[0]
        if path in paths:
            owner=f['actor'].get('Outer',{}).get('ObjectName','').split('.')[-1].rstrip("'")
            clearActors.add(owner)
    bells=[]
    for entry in bellInstances:
        if entry['world']!=world:continue
        # Stone cranes and bells unlocked by this boss's death are post-fight
        # checkpoints. Never use them as the preparation point for that fight.
        if 'StoneCrane' in entry['actor']['Type']:continue
        if any(tag in clearTags for tag in entry['actor'].get('Properties',{}).get('ActiveTags',[])):continue
        bell=entry['data'];loc=bell.get('TeleportTransform',{}).get('Translation',{})
        if len(loc)!=3:continue
        distance=math.dist([pos[k] for k in 'XYZ'],[loc[k] for k in 'XYZ'])
        bells.append((distance,bell))
    bells.sort(key=lambda p:p[0])
    if bells and bells[0][0]<20000:
        distance,bell=bells[0]
        tr=bell['TeleportTransform'];transform={'Location':tr['Translation'],'Rotation':quat_rotation(tr.get('Rotation',{}))}
        camera=bell.get('TeleportCameraRotation',transform['Rotation']);bid=bell['BellID']
        checkpoint='native-bell';broken='broken' in bid.lower()
    else:
        # Prologue / isolated scripted arenas may have no reachable registered bell.
        # Keep an explicit experimental checkpoint instead of assigning a distant bell in another map.
        transform={'Location':dict(pos),'Rotation':first['root'].get('RelativeRotation',{'Pitch':0,'Yaw':0,'Roll':0})}
        transform['Location']['X']-=1200;transform['Location']['Z']+=100
        camera=transform['Rotation'];bid='';checkpoint='experimental-position';broken=False;distance=None
    b['profile']={'level':world,'bell':bid,'checkpoint':checkpoint,'broken':broken,'transform':transform,'camera':camera,
                  'primarySpawnerID':first['actor']['Properties'].get('SpawnerID',''),
                  'spawners':sorted(spawnNames),'domains':sorted(domains),'clearActors':sorted(clearActors),
                  'clearTags':sorted(clearTags),'nodeIDs':sorted(nodeIDs),'graphs':sorted(paths),
                  'distance':round(distance) if distance is not None else None,'verified':False}
    print(b['id'].removeprefix('BP_Monster_'),bid or 'POSITION',len(clearTags),'tags',len(related),'graphs')
(base/'boss-catalog.json').write_text(json.dumps(bosses,ensure_ascii=False,indent=2),encoding='utf8')
(base/'boss-catalog.js').write_text('"use strict";\nmodule.exports = '+json.dumps(bosses,ensure_ascii=False)+';\n',encoding='utf8')
