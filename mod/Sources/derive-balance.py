import json,re
from pathlib import Path
base=Path(__file__).parent
bosses=json.loads((base/'boss-catalog.json').read_text(encoding='utf8'))
table=next(o['Rows'] for o in json.loads(next((base.parent/'pbz-balance').rglob('DT_AIAreaLevel.uasset.json')).read_text(encoding='utf8')) if 'Rows' in o)
scripts=[]
analysis={b['id']:b for b in json.loads((base/'encounter-analysis.json').read_text(encoding='utf8'))}
for line in (base.parent/'pbz-boss-gameplay/gameplay.jsonl').open(encoding='utf8'):
    d=json.loads(line)
    for o in d['exports']:
        if o['Type']=='GroupScript_Level_C':scripts.append((d['package'],o))
for b in bosses:
    if b['id']=='BP_Monster_ZuoShang_Young_Tutorial':b['variant']='JEUNESSE'
    if b['id']=='BP_Monster_ZuoShang':b['variant']='PROLOGUE'
    if b['id']=='BP_Monster_HookMan_HorseCartCombat':b['variant']='POURSUITE'
    if b['id']=='BP_Monster_HookMan_P2':b['variant']='SIX LAMES'
    p=b['profile'];domains=p.get('domains',[])
    candidates=analysis.get(b['id'],{}).get('candidates',[])
    chosen=next((s for s in candidates if s['world']==p['level']),None)
    if chosen:p['arena']=chosen['root']['RelativeLocation']
    # Several miniboss classes are reused in distant regions of the same world.
    # Balance the selected placement rather than the highest level of every copy.
    if chosen and len(b['classes'])==1 and not b.get('trial'):
        cp=chosen['actor']['Properties']
        domain=cp.get('SpawnInfo',{}).get('MobDomain',{}).get('SubPathString','').split('.')[-1]
        if not domain and cp.get('MobGroup'):
            domain=cp['MobGroup']['ObjectName'].split(':PersistentLevel.')[-1].split('.')[0]
        if domain:domains=[domain]
    matched=[s for package,s in scripts if '/'+p['level'] in package and (p['level']+':') in s.get('Outer',{}).get('ObjectName','') and any(d in s.get('Outer',{}).get('ObjectName','') for d in domains)]
    areas=sorted({s.get('Properties',{}).get('AreaName','') for s in matched}-{''})
    groups=[{'area':s.get('Properties',{}).get('AreaName',''),'offset':s.get('Properties',{}).get('Offset',0)} for s in matched]
    levels=[table[g['area']]['LevelOffset']+g['offset'] for g in groups if g['area'] in table]
    b['balance']={'weaponLevel':min(30,max(1,int(max(levels)))) if levels else None,'areas':areas,'groups':groups,'source':'native-mob-group-area'}
    if not levels:
        fallback={'PBZ_WP_ZhuLinGuWu':1,'PBZ_Xigu_WP':3,'PBZ_Pangzhen_WP':12,'PBZ_Duanhun_WP':25}
        b['balance'].update(weaponLevel=fallback.get(p['level'],20),source='regional-baseline')
    print(b['id'].removeprefix('BP_Monster_'),b['balance'])
(base/'boss-catalog.json').write_text(json.dumps(bosses,ensure_ascii=False,indent=2),encoding='utf8')
(base/'boss-catalog.js').write_text('"use strict";\nmodule.exports = '+json.dumps(bosses,ensure_ascii=False)+';\n',encoding='utf8')
