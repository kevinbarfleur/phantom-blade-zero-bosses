import json,copy
from pathlib import Path
base=Path(__file__).parent
def rows(name):return next(o['Rows'] for o in json.loads(next((base.parent/'pbz-exports').rglob(name+'.uasset.json')).read_text(encoding='utf8')) if 'Rows'in o)
bosses=json.loads((base/'boss-catalog.json').read_text(encoding='utf8'))
spawners=json.loads((base/'world-spawners.json').read_text(encoding='utf8'))
maps={r['MapID'].lower():r for r in rows('DT_MapData').values()}
chapters={r['ChapterID']:r for r in rows('DT_ChapterData').values()}
for b in bosses:
    if b.get('trial'):continue
    m=maps.get(b['map'].lower(),{})
    ch=chapters.get(m.get('OwnChapterID'))
    b['chapter']={'id':ch['ChapterID'],'key':ch['ChapterName']['Key'],'order':ch['ChapterOrder']} if ch else {'id':'Prologue','label':'PROLOGUE','order':0}
    b['locationKey']=m.get('MapName',{}).get('Key','')
    if b['id']=='BP_Monster_YuCong_P1':
        ch=chapters['DieXueZhiLu'];b['chapter']={'id':ch['ChapterID'],'key':ch['ChapterName']['Key'],'order':ch['ChapterOrder']}

masked=next((b for b in bosses if b['id']=='BP_Monster_MoTian_LongZhu_01'),None)
if masked:
    bosses=[b for b in bosses if b['id'] not in ['BP_Monster_MoTian_LongZhu_01','BP_Monster_MoTian']]
    flows=json.loads((base/'world-flows.json').read_text(encoding='utf8'))
    graphs=json.loads((base/'quest-graphs.json').read_text(encoding='utf8'))
    trialClasses=['MoTian_LongZhu_01','MoTian_LongZhu_03','MoTian_LongZhu_02','MoTian_LongZhu_04','MoTian']
    roots=[s for s in spawners if s['world']=='PBZ_Xigu_WP' and 'BP_Monster_MoTian' in str(s['actor']['Properties'].get('Class'))]
    allNames=[s['actor']['Name'] for s in roots]
    clear=set(masked['profile']['clearTags']);actorNames=set(masked['profile']['clearActors'])|set(allNames);nodeIDs=set()
    for g in graphs:
        if '/LongZhu/' not in g['path']:continue
        for o in g['nodes']:
            p=o.get('Properties',{})
            if 'NodeGuid'in p:nodeIDs.add(p['NodeGuid'].replace('-',''))
            for k in ['AddTags','ObserveTags','BlockTags','Tags']:clear.update(t for t in p.get(k,[]) if t.startswith('lz.'))
    for f in flows:
        if 'PBZ_Xigu_WP' not in f['package']:continue
        if '/LongZhu/' in str(f['actor'].get('Properties',{}).get('RootFlow')):
            actorNames.add(f['actor']['Outer']['ObjectName'].split('.')[-1].rstrip("'"))
    for n,cls in enumerate(trialClasses,1):
        b=copy.deepcopy(masked);b['id']='MoTian_Trial_'+str(n);b['trial']=n;b['variant']='ÉPREUVE '+['I','II','III','IV','V'][n-1]
        b['chapter']={'id':'Statues','label':'ÉPREUVES DES STATUES','order':20};b['order']=n
        b['classes']=[next(s['actor']['Properties']['Class']['AssetPathName'] for s in roots if s['actor']['Properties']['Class']['AssetPathName'].endswith('BP_Monster_'+cls+'_C'))]
        p=b['profile'];p['clearTags']=sorted(clear);p['clearActors']=sorted(actorNames);p['spawners']=allNames;p['nodeIDs']=sorted(nodeIDs);p['broken']=True
        p['addTags']=['lz.龙柱.点位1','lz.龙柱.龙柱试炼开启'+str(n),'lz.龙柱.初始化选项'+str(n)]
        for previous in range(1,n):p['addTags'].extend(['lz.龙柱.战斗胜利'+str(previous),'lz.龙柱.战斗结算'+str(previous),'lz.龙柱.龙柱试炼完成'+str(previous)])
        p['nativeTrialClass']=b['classes'][0]
        bosses.append(b)
trial_spawners=[s for s in spawners if s['world']=='PBZ_Xigu_WP' and 'BP_Monster_MoTian' in str(s['actor']['Properties'].get('Class'))]
def domain_of(s):return s['actor']['Properties']['MobGroup']['ObjectName'].split(':PersistentLevel.')[1].split('.')[0]
trial_domains={domain_of(s) for s in trial_spawners}
for b in bosses:
    if not b.get('trial'):continue
    s=next(s for s in trial_spawners if s['actor']['Properties']['Class']['AssetPathName']==b['classes'][0])
    b['profile']['domains']=[domain_of(s)]
    b['profile']['clearActors']=sorted(set(b['profile']['clearActors'])|trial_domains)
    b['profile']['arena']=s['root']['RelativeLocation']
    b['profile']['nativeSpawnerID']=s['actor']['Properties']['SpawnerID']
mistress=next(b for b in bosses if b['id']=='BP_Monster_MuXiaoKui')
mistress['supportClasses']=[b['classes'][0] for b in bosses if b['id'] in ['BP_Monster_Yuu','BP_Monster_TieGui']]
# The native replay branches observe `trial N`, while `trial started N` only
# enables tutorial/settlement listeners. Both must agree with the selected fight.
for b in bosses:
    if b.get('trial'):
        tag='lz.龙柱.试炼'+str(b['trial'])
        if tag not in b['profile']['addTags']:b['profile']['addTags'].append(tag)
        for tag in ['lz.龙柱.回忆起特殊杀气','lz.龙柱.难度开关','lz.龙柱.第一次触摸']:
            if tag not in b['profile']['addTags']:b['profile']['addTags'].append(tag)
# The codex assigns Hansui to the default XiGu map; its native mob area is the
# illusion ruins. Keep location/chapter metadata tied to that authored area.
hansui=next(b for b in bosses if b['id']=='BP_Monster_QiShu_Bing')
hansui['map']='MeiGu_YiJi';ch=chapters['MeiGuHu'];hansui['chapter']={'id':ch['ChapterID'],'key':ch['ChapterName']['Key'],'order':ch['ChapterOrder']}
hansui['locationKey']=maps['meigu_yiji']['MapName']['Key']
hansui['available']=False
hansui['availabilityReason']='Only placement found is in DL_3721Unload; direct loading did not complete. No active campaign entrance validated.'
for b in bosses:
    if b['id'] in ['BP_Monster_ZuoShang_Young_Tutorial','BP_Monster_ZuoShang','BP_Monster_HookMan_HorseCartCombat','BP_Monster_YuCong_FirstTime']:
        b['available']=False
        b['availabilityReason']='Sequence-controlled encounter without a registered preparation bell. A complete standalone replay has not been validated.'
# This obsolete chapter localization is empty in the installed French table.
for b in bosses:
    if b['chapter']['id']=='DieXueZhiLu':b['chapter']['label']='FORÊT ÉCARLATE'
# Reset the native entrance as well as the death graph for the young mistress.
# Otherwise the saved entrance is skipped and only her two guardians reappear.
graphs=json.loads((base/'quest-graphs.json').read_text(encoding='utf8'))
flows=json.loads((base/'world-flows.json').read_text(encoding='utf8'))
extra={g['path'] for g in graphs if g['name'] in ['BPF_MuXiaoKuiChuChang','BPF_AnBianMuXiaoKui']}
p=mistress['profile'];p['graphs']=sorted(set(p['graphs'])|extra)
for g in graphs:
    if g['path'] not in extra:continue
    for o in g['nodes']:
        q=o.get('Properties',{})
        if q.get('NodeGuid'):p['nodeIDs'].append(q['NodeGuid'].replace('-',''))
        if o['Type']=='SetTag_C':p['clearTags'].extend(q.get('AddTags',[]))
for f in flows:
    if 'PBZ_Zhengdaodaying_WP' not in f['package']:continue
    path=f['actor'].get('Properties',{}).get('RootFlow',{}).get('ObjectPath','').rsplit('.',1)[0]
    if path in extra:p['clearActors'].append(f['actor']['Outer']['ObjectName'].split('.')[-1].rstrip("'"))
for key in ['nodeIDs','clearTags','clearActors']:p[key]=sorted(set(p[key]))
# Keep the statue entrance/cinematic history. Only the battle controller is
# reset; replaying every old victory signal starts the previous trial's outro.
controller=next(g for g in graphs if g['name']=='BPF_MoTian')
controllerNodes={o['Properties']['NodeGuid'].replace('-','') for o in controller['nodes'] if o.get('Properties',{}).get('NodeGuid')}
controllerActors={f['actor']['Outer']['ObjectName'].split('.')[-1].rstrip("'") for f in flows if 'PBZ_Xigu_WP' in f['package'] and '/BPF_MoTian.' in f['actor'].get('Properties',{}).get('RootFlow',{}).get('ObjectPath','')}
for b in bosses:
    if not b.get('trial'):continue
    p=b['profile'];n=b['trial']
    p['graphs']=[controller['path']];p['nodeIDs']=sorted(controllerNodes)
    p['clearActors']=sorted(set(p['spawners'])|trial_domains|controllerActors)
    p['clearTags']=[f'lz.龙柱.{prefix}{i}' for prefix in ['试炼','龙柱试炼开启','龙柱试炼完成','战斗胜利','战斗结算','初始化选项','点位'] for i in range(1,7)]
    p['addTags']=['lz.龙柱.点位1',f'lz.龙柱.试炼{n}',f'lz.龙柱.龙柱试炼开启{n}',f'lz.龙柱.初始化选项{n}','lz.龙柱.回忆起特殊杀气','lz.龙柱.难度开关']+[f'lz.龙柱.龙柱试炼完成{i}' for i in range(1,n)]
bosses.sort(key=lambda b:(b['chapter']['order'],b['order']))
(base/'boss-catalog.json').write_text(json.dumps(bosses,ensure_ascii=False,indent=2),encoding='utf8')
(base/'boss-catalog.js').write_text('"use strict";\nmodule.exports = '+json.dumps(bosses,ensure_ascii=False)+';\n',encoding='utf8')
print(len(bosses),'encounters;',len({b['chapter']['id'] for b in bosses}),'sections; five distinct statue trial classes')
