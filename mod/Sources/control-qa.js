"use strict";
// Private read-only QA: input routing is distinct from enemy activity.
const UE=require('ue'),puerts=require('puerts'),config=require('./qa-config');
let state=null,tagCountApis=null;
const read=fn=>{try{return fn();}catch(_){return null;}};
const vector=v=>v?{X:v.X,Y:v.Y,Z:v.Z}:null;
const xiaoXue={boss:'BP_Monster_XiaoXue',domain:'BP_MobDomain_C_UAID_E89C25A75434724A02_2052072365',spawner:'XiaoXue_Seq073'};
const bigBro={boss:'BP_Monster_HuaShan_RedTroop_BigBro',domain:'PBZ_MobDomain_C_UAID_E89C25A750C736E302_1126457833',spawner:'XiongZhang'};
bigBro.members=['BP_AISpawner_C_UAID_E89C25A750C72DE302_1591131170','BP_AISpawner_C_UAID_E89C25A750C72DE302_1517928169','BP_AISpawner_C_UAID_E89C25A750C72CE302_1744151987','BP_AISpawner_C_UAID_E89C25A750C7F6E102_2002111428','BP_AISpawner_C_UAID_E89C25A750C7A0CB02_2042446446','BP_AISpawner_C_UAID_E89C25A750C729E302_2019269458','BP_AISpawner_C_UAID_E89C25A750C72AE302_1256505636'];
xiaoXue.members=['BP_AISpawner_C_UAID_E89C25A75434724A02_2052073366'];
const huaShan={boss:'BP_Monster_HuaShan_Blue',domain:'BP_MobDomain_C_UAID_0A6230820DE85F4502_1979995676',spawner:'Jianou_Seq076',groups:[
 {key:'DefaultGroup',phase:1,members:['1979997677','1980000681','1979998679','1980001682','1980002684','1979999680','1980002683'].map(x=>'BP_AISpawner_C_UAID_0A6230820DE85F4502_'+x)},
 {key:'JianOu',phase:2,initialExpectation:'inactive-until-native-phase-transition',members:[...['1979998678','1980005686','1980006688','1980006687'].map(x=>'BP_AISpawner_C_UAID_0A6230820DE85F4502_'+x),'BP_AISpawner_C_UAID_E89C25A7516AEC7302_1405639150']}
]};
huaShan.members=huaShan.groups.flatMap(group=>group.members);
const domainConfig=session=>[xiaoXue,bigBro,huaShan].find(item=>item.boss===session.boss?.id);
function captureDomain(context,session,phase){
 const authored=domainConfig(session);
 if(config.mode==='manual'||!session.active||!authored)return null;
 const result={time:Date.now(),phase,method:'read-only-authored-domain',status:'unknown',errors:[]};
 const inspect=(name,fn)=>{try{return fn();}catch(error){result.errors.push({field:name,error:String(error)});return null;}};
 const valid=value=>!!value&&UE.KismetSystemLibrary.IsValid(value);
 const name=value=>valid(value)?value.GetName():null;
 const objectPath=value=>valid(value)?UE.KismetSystemLibrary.GetPathName(value):null;
 const names=values=>{if(!values)return null;const out=[];for(let i=0;i<values.Num();i++)out.push(name(values.Get(i)));return out;};
 const domain=inspect('domain',()=>{
  const cls=UE.Class.Find('/SGameAI/Tools/MobDomain/BP_MobDomain.BP_MobDomain_C');if(!cls)return null;
  const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);const actors=puerts.$unref(out);
  for(let i=0;i<actors.Num();i++){const actor=actors.Get(i);if(valid(actor)&&actor.GetName()===authored.domain)return actor;}
  return null;
 });
 result.domainFound=!!domain;
 const group=domain?inspect('group',()=>domain.MobDomainConfig.MobGroups.Get('DefaultGroup')):null;
 result.groupName=inspect('groupName',()=>name(group));
 result.groupPath=inspect('groupPath',()=>objectPath(group));
 if(authored.groups)result.groups=authored.groups.map(expected=>{
  const native=domain?inspect('groups.'+expected.key,()=>domain.MobDomainConfig.MobGroups.Get(expected.key)):null;
  return {key:expected.key,phase:expected.phase,initialExpectation:expected.initialExpectation||'native-entry-activation',
   groupPath:inspect('groups.'+expected.key+'.path',()=>objectPath(native)),
   isActivating:native?inspect('groups.'+expected.key+'.isActivating',()=>native.IsActivating):null,
   nativeMemberCount:native?inspect('groups.'+expected.key+'.memberCount',()=>native.Members.Num()):null,
   authoredMemberCount:expected.members.length};
 });
 result.isActivating=group?inspect('isActivating',()=>group.IsActivating):null;
 result.activeGroups=domain?inspect('activeGroups',()=>names(domain.GetCurrentActivatingGroups())):null;
 result.actorsInDomain=domain?inspect('actorsInDomain',()=>names(domain.GetActorsInMobDomain())):null;
 // Native Members/ReferencedTriggers hold soft references, not actor wrappers.
 // Enumerate only the exact authored names proven in the map export; do not
 // pretend unavailable Puerts soft-reference fields are an empty membership.
 result.nativeMemberCount=group?inspect('nativeMemberCount',()=>group.Members.Num()):null;
 result.memberListSource='authored-map-export; live membership verified by each spawner.MobGroup';
 result.members=authored.members.map(name=>({subPath:'PersistentLevel.'+name}));
 const spawner=inspect('spawner',()=>UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.SGameAIWorldSubsystem.StaticClass())?.GetSpawner(authored.spawner));
 result.spawnerName=inspect('spawnerName',()=>name(spawner));
 result.spawnerGroupPath=spawner?inspect('spawnerGroupPath',()=>objectPath(spawner.MobGroup)):null;
 result.spawnerGroupMatches=!!result.groupPath&&!!result.spawnerGroupPath?result.groupPath===result.spawnerGroupPath:null;
 result.pawnName=spawner?inspect('pawnName',()=>name(spawner.GetPawn())):null;
 if(authored===xiaoXue)result.primaryClassPawns=inspect('primaryClassPawns',()=>{
  const cls=UE.Class.Find('/PBZCombatAsset/ActorData/Mobs/027_XiaoXue/BP_Monster_XiaoXue.BP_Monster_XiaoXue_C');if(!cls)return null;
  const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);const values=puerts.$unref(out),rows=[];
  result.primaryClassPawnCount=values.Num();
  for(let i=0;i<values.Num()&&i<16;i++){
   const actor=values.Get(i);if(!valid(actor))continue;const actorName=name(actor),field=key=>'primaryClass.'+actorName+'.'+key;
   const row={name:actorName,registeredPrimary:actorName===result.pawnName,inDomainVolume:result.actorsInDomain?.includes(actorName)??null};
   row.hidden=inspect(field('hidden'),()=>actor.bHidden);
   row.owner=inspect(field('owner'),()=>typeof actor.GetOwner==='function'?name(actor.GetOwner()):null);
   row.health=inspect(field('health'),()=>UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter(actor,UE.PBZBlueprintFunctionLibrary.MakeAttribute('Health',UE.BasicAttributeSet.StaticClass())));
   row.dead=inspect(field('dead'),()=>{const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor),tag=new UE.GameplayTag();tag.TagName='CharacterState.Dead';return asc?.HasMatchingGameplayTag(tag)??null;});
   row.position=inspect(field('position'),()=>vector(actor.K2_GetActorLocation()));rows.push(row);
  }
  return rows;
 });
 if(spawner){
  result.spawnerLifecycle={};
  for(const key of ['SetShouldNotSpawnAfterDead','AutoRespawnOnDead','RespawnDelay'])result.spawnerLifecycle[key]=inspect('spawnerLifecycle.'+key,()=>{
   const value=spawner[key];return typeof value==='boolean'||typeof value==='number'?value:null;
  });
  for(const key of ['IsShouldToSpawn','GetShouldSpawn'])result.spawnerLifecycle[key]=inspect('spawnerLifecycle.'+key,()=>typeof spawner[key]==='function'?spawner[key]():null);
  result.spawnerLifecycle.savedIsAlive=inspect('spawnerLifecycle.savedIsAlive',()=>typeof spawner.SpawnerSaveInfo?.IsAlive==='boolean'?spawner.SpawnerSaveInfo.IsAlive:null);
  if(authored===xiaoXue){
   const task=inspect('deathObserver.object',()=>spawner.WaitSpawnedAIDeadAsyncAction);
   const observer=result.spawnerDeathObserver={valid:inspect('deathObserver.valid',()=>valid(task)),name:inspect('deathObserver.name',()=>name(task)),path:inspect('deathObserver.path',()=>objectPath(task))};
   if(observer.valid){
    observer.classPath=inspect('deathObserver.class',()=>typeof task.GetClass==='function'?objectPath(task.GetClass()):null);
    observer.outer=inspect('deathObserver.outer',()=>typeof task.GetOuter==='function'?name(task.GetOuter()):null);
    observer.availableActorGetters=inspect('deathObserver.getters',()=>['GetActor','GetTargetActor','GetAvatarActor'].filter(key=>typeof task[key]==='function'));
    observer.actors={};
    for(const getter of observer.availableActorGetters||[]){
     const actor=inspect('deathObserver.'+getter,()=>task[getter]());
     observer.actors[getter]={name:inspect('deathObserver.'+getter+'.name',()=>name(actor)),
      registeredPrimary:inspect('deathObserver.'+getter+'.primary',()=>valid(actor)?actor===spawner.GetPawn():null),
      player:inspect('deathObserver.'+getter+'.player',()=>valid(actor)?actor===UE.GameplayStatics.GetPlayerCharacter(context,0):null)};
    }
   }
  }
 }
 if(authored.members){
  const memberActors=inspect('memberEnumeration',()=>{
   const cls=UE.Class.Find('/SGameAI/Tools/Spawner/BP_AISpawner.BP_AISpawner_C');if(!cls)return null;
   const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);const values=puerts.$unref(out),actors=new Map();
   for(let i=0;i<values.Num();i++){const actor=values.Get(i);if(valid(actor))actors.set(actor.GetName(),actor);}
   return actors;
  });
  result.memberPawns=(result.members||[]).map(member=>{
   const actorName=member.subPath.split('.').pop(),actor=memberActors?.get(actorName);
   const item={spawner:actorName,found:!!actor};
   if(!actor)return item;
   const field=key=>'member.'+actorName+'.'+key;
   item.groupPath=inspect(field('group'),()=>objectPath(actor.MobGroup));
   const expectedGroup=authored.groups?.find(expected=>expected.members.includes(actorName));
   const expectedPath=expectedGroup?result.groups.find(row=>row.key===expectedGroup.key)?.groupPath:result.groupPath;
   if(expectedGroup){item.phase=expectedGroup.phase;item.expectedGroupKey=expectedGroup.key;}
   item.groupMatches=item.groupPath&&expectedPath?item.groupPath===expectedPath:null;
   const pawn=inspect(field('pawn'),()=>actor.GetPawn());
   item.pawn=inspect(field('pawnName'),()=>name(pawn));
   if(item.pawn){
    item.classPath=inspect(field('class'),()=>objectPath(pawn.GetClass()));
    item.hidden=inspect(field('hidden'),()=>pawn.bHidden);
    item.health=inspect(field('health'),()=>UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter(pawn,UE.PBZBlueprintFunctionLibrary.MakeAttribute('Health',UE.BasicAttributeSet.StaticClass())));
   }
   return item;
  });
  result.liveMemberPawns=result.memberPawns.filter(item=>item.pawn).length;
  if(result.groups)for(const row of result.groups)row.liveMemberPawns=result.memberPawns.filter(item=>item.expectedGroupKey===row.key&&item.pawn).length;
 }
 if(result.domainFound&&result.groupPath&&typeof result.isActivating==='boolean'&&result.spawnerName&&result.errors.length===0)result.status='observed';
 if(state?.boss===session.boss.id){
  const diagnostic=state.domainDiagnostic||(state.domainDiagnostic={firstByPhase:{},transitions:[]});
  diagnostic.firstByPhase[phase]=diagnostic.firstByPhase[phase]||result;
  // Combat motion/HP change every frame. Keep the bounded transition history
  // for lifecycle evidence (death/respawn/membership), with full live data in latest.
  const signature=JSON.stringify({...result,time:0,phase:''},(key,value)=>['position','health'].includes(key)?undefined:value);
  if(signature!==state.domainSignature){state.domainSignature=signature;diagnostic.transitions.push(result);diagnostic.transitions=diagnostic.transitions.slice(-12);}
  diagnostic.latest=result;
 }
 session.ux={...session.ux,authoredDomainDiagnostic:result};
 return result;
}
// Exact read-only investigation of the authored Seq027 navigation/once gate.
// Never retain native wrappers, reset a key, move the player or retrigger a node.
function captureHuaEntrance(context,session){
 if(config.mode==='manual'||!session.active||session.boss?.id!=='BP_Monster_HuaQianXIao')return null;
 const result={time:Date.now(),method:'read-only-huaq-seq027-entry',errors:[]};
 const inspect=(field,fn)=>{try{const value=fn();return value===undefined?null:value;}catch(error){if(result.errors.length<20)result.errors.push({field,error:String(error)});return null;}};
 const valid=value=>!!value&&UE.KismetSystemLibrary.IsValid(value);
 const name=value=>valid(value)?String(value.GetName()):null;
 const path=value=>valid(value)?String(UE.KismetSystemLibrary.GetPathName(value)):null;
 const primitive=value=>['boolean','number','string'].includes(typeof value)?value:null;
 const guid=value=>{const out=new UE.Guid();value.split('-').forEach((part,i)=>out[['A','B','C','D'][i]]=parseInt(part,16));return out;};
 const actorInfo=actor=>!valid(actor)?null:{name:name(actor),path:path(actor),position:inspect('owner.position',()=>vector(actor.K2_GetActorLocation())),rotation:inspect('owner.rotation',()=>{const r=actor.K2_GetActorRotation();return {Pitch:r.Pitch,Yaw:r.Yaw,Roll:r.Roll};})};
 const spawner=inspect('spawner',()=>UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.SGameAIWorldSubsystem.StaticClass())?.GetSpawner('HuaQianXiao_Seq027'));
 const pawn=inspect('pawn',()=>spawner?.GetPawn());
 const component=inspect('component',()=>pawn?.GetComponentByClass(UE.FlowComponent.StaticClass()));
 const flow=inspect('flow',()=>component?.GetRootFlowInstance());
 result.spawner=inspect('spawnerInfo',()=>actorInfo(spawner));result.pawn=inspect('pawnInfo',()=>actorInfo(pawn));
 result.component=inspect('componentName',()=>name(component));result.root=inspect('root',()=>path(component?.RootFlow));result.instance=inspect('instance',()=>name(flow));
 const expected='/Game/PBZContent/Blueprint/FlowGraph/QuestFlowGraph/FuJiZhiLin/BPF_JianChiChuChang.BPF_JianChiChuChang';
 result.expectedRoot=result.root===expected;
 result.worldLoadingComplete=!!session.worldLoadingComplete;result.cinematic=!!session.cinematicActive;result.nativeSignalSent=!!session.entranceSignalSent;
 result.cinemaPending=inspect('cinemaPending',()=>require('./cinema').pending(context));
 result.playerPosition=inspect('playerPosition',()=>vector(UE.GameplayStatics.GetPlayerCharacter(context,0)?.K2_GetActorLocation()));
 // Native OnNavFallbackTimeout explicitly defers for either of these states;
 // session.cinematicActive alone cannot establish that the native player is free.
 result.playerNativeTags={};
 const playerASC=inspect('playerAbilitySystem',()=>UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(UE.GameplayStatics.GetPlayerCharacter(context,0)));
 for(const tagName of ['CharacterState.InLevelSequence','CharacterState.Dead'])result.playerNativeTags[tagName]=inspect('playerTag.'+tagName,()=>{
  if(typeof playerASC?.HasMatchingGameplayTag!=='function')return null;
  const tag=new UE.GameplayTag();tag.TagName=tagName;return playerASC.HasMatchingGameplayTag(tag);
 });
 if(result.expectedRoot&&valid(flow)){
  result.flowActive=inspect('flowActive',()=>flow.IsActive());
  result.activeNodes=inspect('activeNodes',()=>{const values=flow.GetActiveNodes(),out=[];for(let i=0;i<Math.min(values.Num(),20);i++){const n=values.Get(i),g=n.GetGuid();out.push({name:name(n),state:primitive(n.GetActivationState()),guid:['A','B','C','D'].map(k=>(g[k]>>>0).toString(16).padStart(8,'0')).join('-').toUpperCase()});}return out;});
  result.nodes={};
  const ids={entry:'B76277E3-4ACCC337-C1AAF183-097F5A14',once:'D29C8D3B-42575452-A57D26A6-37AAF276',sequence:'CDAEA218-4B83A6C8-6BBEBDAC-38139C83'};
  for(const [key,id] of Object.entries(ids)){
   const node=inspect(key+'.node',()=>flow.GetNode(guid(id)));
   const row=result.nodes[key]={guid:id,name:inspect(key+'.name',()=>name(node))};if(!valid(node))continue;
   row.state=inspect(key+'.state',()=>primitive(node.GetActivationState()));row.done=inspect(key+'.done',()=>primitive(node.IsExecuteDone()));
   if(key==='once'){
    row.actorQualifiedKey=inspect('once.key',()=>{const out=puerts.$ref('');node.GetNodeSaveString(out);return primitive(puerts.$unref(out));});
    row.consumed=inspect('once.consumed',()=>{const out=puerts.$ref(false);node.NodeExistInExecuteNode(out);return primitive(puerts.$unref(out));});
    row.actorQualifiedKeyPresent=inspect('once.keyPresent',()=>{if(typeof row.actorQualifiedKey!=='string'||!row.actorQualifiedKey)return null;const pipeline=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.EventPipelineManager.StaticClass());return pipeline.ExecuteNodeGuid.Get(row.actorQualifiedKey)!==undefined;});
   }
   if(key==='sequence'){
    row.owner=inspect('sequence.owner',()=>actorInfo(node.GetOwnerActor()));
    row.rootActor=inspect('sequence.rootActor',()=>actorInfo(node.TryGetRootFlowActorOwner()));
    for(const field of ['HasPlay','PlayInf','PendingNormalAdded','NavToOwner','NavDuration','NavFallbackSeconds','PreprocessType','DisableInput','DisableType','AsyncComplete','WaitComplete','MapSwitchPreloadDone'])row[field]=inspect('sequence.'+field,()=>primitive(node[field]));
    for(const field of ['NavAsyncTask','LoadedLevelSequence','SequencePlayer'])row[field]=inspect('sequence.'+field,()=>({valid:valid(node[field]),name:name(node[field])}));
   }
  }
 }
 if(state?.boss===session.boss.id){
  const diagnostic=state.huaEntranceDiagnostic||(state.huaEntranceDiagnostic={transitions:[]});
  const signature=JSON.stringify({...result,time:0},(key,value)=>['position','playerPosition','rotation'].includes(key)?undefined:value);
  if(signature!==state.huaEntranceSignature){state.huaEntranceSignature=signature;diagnostic.transitions.push(result);diagnostic.transitions=diagnostic.transitions.slice(-20);}
  diagnostic.latest=result;
 }
 session.ux={...session.ux,huaEntranceDiagnostic:result};return result;
}
function captureDuo(context,session){
 if(config.mode==='manual'||!session.active||session.boss?.id!=='BP_Monster_Yuu')return null;
 const result={time:Date.now(),method:'read-only-phase-three-spawner-aliases',boss:session.boss.id,
  nativeController:session.boss.profile?.nativeController===true,phase:!session.worldLoadingComplete?'loading':session.cinematicActive?'intro':session.directArrival?.released?'playable':'arrival',errors:[]};
 const inspect=(field,fn)=>{try{return fn();}catch(error){result.errors.push({field,error:String(error)});return null;}};
 const valid=value=>!!value&&UE.KismetSystemLibrary.IsValid(value);
 const name=value=>valid(value)?value.GetName():null;
 const rotation=value=>value?{Pitch:value.Pitch,Yaw:value.Yaw,Roll:value.Roll}:null;
 const system=inspect('worldSubsystem',()=>UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.SGameAIWorldSubsystem.StaticClass()));
 result.aliases=['Yuu_Seq046-1','TieGu_Seq046-1','TieGui_Seq046-1'].map(alias=>{
  const spawner=system?inspect(alias+'.lookup',()=>system.GetSpawner(alias)):null;
  const row={alias,spawner:inspect(alias+'.spawner',()=>name(spawner))};
  const group=spawner?inspect(alias+'.group',()=>spawner.MobGroup):null;
  row.group=inspect(alias+'.groupName',()=>name(group));
  row.groupActive=group?inspect(alias+'.groupActive',()=>group.IsActivating):null;
  const pawn=spawner?inspect(alias+'.pawn',()=>spawner.GetPawn()):null;
  row.pawn=inspect(alias+'.pawnName',()=>name(pawn));
  if(row.pawn){
   row.classPath=inspect(alias+'.class',()=>UE.KismetSystemLibrary.GetPathName(pawn.GetClass()));
   row.hidden=inspect(alias+'.hidden',()=>pawn.bHidden);
   row.health=inspect(alias+'.health',()=>UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter(pawn,UE.PBZBlueprintFunctionLibrary.MakeAttribute('Health',UE.BasicAttributeSet.StaticClass())));
   row.position=inspect(alias+'.position',()=>vector(pawn.K2_GetActorLocation()));
  }
  return row;
 });
 const player=inspect('player',()=>UE.GameplayStatics.GetPlayerCharacter(context,0));
 const controller=inspect('controller',()=>UE.GameplayStatics.GetPlayerController(context,0));
 const camera=controller?inspect('cameraManager',()=>controller.PlayerCameraManager):null;
 result.player={name:inspect('player.name',()=>name(player)),position:inspect('player.position',()=>player?vector(player.K2_GetActorLocation()):null),
  rotation:inspect('player.rotation',()=>typeof player?.K2_GetActorRotation==='function'?rotation(player.K2_GetActorRotation()):null)};
 result.camera={controlRotation:inspect('camera.controlRotation',()=>typeof controller?.GetControlRotation==='function'?rotation(controller.GetControlRotation()):null),
  rotation:inspect('camera.rotation',()=>typeof camera?.GetCameraRotation==='function'?rotation(camera.GetCameraRotation()):null),
  position:inspect('camera.position',()=>typeof camera?.GetCameraLocation==='function'?vector(camera.GetCameraLocation()):null)};
 result.status=system&&result.errors.length===0?'observed':'unknown';
 if(state?.boss===session.boss.id){
  const diagnostic=state.duoPhase3Diagnostic||(state.duoPhase3Diagnostic={firstByPhase:{},transitions:[]});
  diagnostic.firstByPhase[result.phase]=diagnostic.firstByPhase[result.phase]||result;
  const signature=JSON.stringify({...result,time:0,player:undefined,camera:undefined},(key,value)=>['position','health'].includes(key)?undefined:value);
  if(signature!==state.duoPhase3Signature){state.duoPhase3Signature=signature;diagnostic.transitions.push(result);diagnostic.transitions=diagnostic.transitions.slice(-12);}
  diagnostic.latest=result;
 }
 session.ux={...session.ux,duoPhase3Diagnostic:result};return result;
}
// Read-only entry orientation probe: actor yaw alone does not establish the
// rendered facing. Keep primitive snapshots only, never native wrapper refs.
function captureFacing(player,controller,includeMetadata=true){
 const result={method:'read-only-actor-mesh-facing',errors:[]};
 const inspect=(field,fn)=>{try{const value=fn();return value===undefined?null:value;}catch(error){result.errors.push({field,error:String(error)});return null;}};
 const rot=value=>value?{Pitch:value.Pitch,Yaw:value.Yaw,Roll:value.Roll}:null;
 const methods=object=>{const found=[];for(let depth=0;object&&depth<4;depth++,object=Object.getPrototypeOf(object))found.push(...Object.getOwnPropertyNames(object));return [...new Set(found)].filter(key=>/rotation|facing|yaw|orientation|transform/i.test(key));};
 result.actor=inspect('actor',()=>rot(player.K2_GetActorRotation()));
 result.control=inspect('control',()=>rot(controller.GetControlRotation()));
 result.camera=inspect('camera',()=>rot(controller.PlayerCameraManager?.GetCameraRotation()));
 // Renewal Hun exposes the native CharacterMesh0 through Mesh (also used by
 // PickupWeapon/Appearance); GetMesh is absent on this Puerts wrapper.
 const mesh=inspect('mesh',()=>typeof player.GetMesh==='function'?player.GetMesh():player.Mesh);
 result.meshName=inspect('meshName',()=>mesh?.GetName());
 result.meshWorld=inspect('meshWorld',()=>typeof mesh?.K2_GetComponentRotation==='function'?rot(mesh.K2_GetComponentRotation()):null);
 result.meshRelative=inspect('meshRelative',()=>rot(mesh?.RelativeRotation));
 result.meshAbsoluteRotation=inspect('meshAbsoluteRotation',()=>typeof mesh?.bAbsoluteRotation==='boolean'?mesh.bAbsoluteRotation:null);
 result.boneWorld={};
 for(const bone of ['root','pelvis'])result.boneWorld[bone]=inspect('bone.'+bone,()=>{
  if(typeof mesh?.DoesSocketExist!=='function'||!mesh.DoesSocketExist(bone)||typeof mesh.GetSocketTransform!=='function'||UE.ERelativeTransformSpace?.RTS_World===undefined)return null;
  const transform=mesh.GetSocketTransform(bone,UE.ERelativeTransformSpace.RTS_World);
  return {rotation:rot(transform.Rotator()),position:vector(transform.GetLocation())};
 });
 const anim=inspect('animInstance',()=>typeof mesh?.GetAnimInstance==='function'?mesh.GetAnimInstance():null);
 result.animClass=inspect('animClass',()=>anim?UE.KismetSystemLibrary.GetPathName(anim.GetClass()):null);
 result.animYaw={};
 for(const field of ['AimYaw','Last Root Yaw','Last Root Yaw Target','Origin Root Yaw Target','Turn Yaw','Last Root Yaw Alpha','Last Root Yaw Alpha Blending','PreviousDesiredControllerYaw'])result.animYaw[field]=inspect('anim.'+field,()=>typeof anim?.[field]==='number'?anim[field]:null);
 result.animWorldRotation=inspect('anim.WorldRotation',()=>rot(anim?.WorldRotation));
 result.animAimWorldRotation=inspect('anim.Aim World Rotation',()=>rot(anim?.['Aim World Rotation']));
 const cameraComponent=inspect('nativeCamera',()=>player.NBCamera);
 const cameraLock=inspect('cameraLockObject',()=>typeof cameraComponent?.GetCameraLockOnTargetObject==='function'?cameraComponent.GetCameraLockOnTargetObject():null);
 result.nativeCameraLockView=inspect('cameraLockView',()=>{const target=typeof cameraLock?.GetTargetActor==='function'?cameraLock.GetTargetActor('LockView'):null;return target?{name:target.GetName(),classPath:UE.KismetSystemLibrary.GetPathName(target.GetClass()),position:vector(target.K2_GetActorLocation())}:null;});
 const driver=inspect('driver',()=>typeof player.GetLocomotionDriverComponent==='function'?player.GetLocomotionDriverComponent():null);
 result.driverClass=inspect('driverClass',()=>driver?UE.KismetSystemLibrary.GetPathName(driver.GetClass()):null);
 if(includeMetadata){
  result.appearanceMeshes=inspect('appearanceMeshes',()=>{
   if(typeof player.K2_GetComponentsByClass!=='function'||!UE.SkeletalMeshComponent?.StaticClass)return null;
   const list=player.K2_GetComponentsByClass(UE.SkeletalMeshComponent.StaticClass()),out=[];
   for(let i=0;i<list.Num()&&i<16;i++){const part=list.Get(i);out.push({name:part.GetName(),world:rot(part.K2_GetComponentRotation()),relative:rot(part.RelativeRotation)});}return out;
  });
  result.driverRotationMembers=inspect('driverRotationMembers',()=>driver?methods(driver):[]);
  result.meshRotationMembers=inspect('meshRotationMembers',()=>mesh?methods(mesh):[]);
  result.animRotationMembers=inspect('animRotationMembers',()=>anim?methods(anim):[]);
 }
 result.rawMoveInput=inspect('rawMoveInput',()=>typeof driver?.GetCurrentMoveInputRaw==='function'?vector(driver.GetCurrentMoveInputRaw()):null);
 result.movementMode=inspect('movementMode',()=>player.CharacterMovement?.MovementMode);
 result.useControllerRotationYaw=inspect('useControllerRotationYaw',()=>typeof player.bUseControllerRotationYaw==='boolean'?player.bUseControllerRotationYaw:null);
 return result;
}
function tick(context,session){
 if(config.mode==='manual'||!session.active||(session.boss.training&&config.mode!=='keyboard-probe'))return;
 const player=UE.GameplayStatics.GetPlayerCharacter(context,0),controller=UE.GameplayStatics.GetPlayerController(context,0);
 if(!player||!controller)return;
 const identity=player.GetName()+':'+session.boss.id;
 if(state?.identity!==identity)state={identity,boss:session.boss.id,start:Date.now(),samples:[],entrySamples:[],entryRoutingTransitions:[],keys:[],lastSample:0,lastSave:0};
 if(!tagCountApis){
  const names=object=>{const result=[];for(let depth=0;object&&depth<4;depth++,object=Object.getPrototypeOf(object))result.push(...Object.getOwnPropertyNames(object));return [...new Set(result)].filter(name=>/tag|count/i.test(name));};
  tagCountApis={abilityUtils:read(()=>names(UE.AbilityUtils)),abilityUtilsPrototype:read(()=>names(UE.AbilityUtils.prototype)),abilitySystemComponent:read(()=>names(UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(player)))};
 }
 state.tagCountApis=tagCountApis;
 const now=Date.now();
 if(session.boss.id==='BP_Monster_Yuu'&&(state.lastDuoSample===undefined||now-state.lastDuoSample>=1000)){state.lastDuoSample=now;captureDuo(context,session);}
 if(session.boss.id==='BP_Monster_HuaQianXIao'&&(state.lastHuaSample===undefined||now-state.lastHuaSample>=1000)){state.lastHuaSample=now;captureHuaEntrance(context,session);}
 if(domainConfig(session)&&(!state.lastDomainSample||now-state.lastDomainSample>=1000)){
  state.lastDomainSample=now;captureDomain(context,session,!session.worldLoadingComplete?'loading':session.cinematicActive?'intro':session.directArrival?.released?'playable':'arrival');
 }
 for(const name of ['W','A','S','D','Z','Q','Up','Down','Left','Right','I','SpaceBar','Escape','Tab','LeftMouseButton','MiddleMouseButton'])if(controller.WasInputKeyJustPressed(new UE.Key(name)))state.keys.push({ms:now-state.start,key:name});
 if(now-state.lastSample<100)return;state.lastSample=now;
 const router=read(()=>require('../Library/TsHelper').default.getlocalPlayerSubsystem(context,UE.PBZUIActionRouterBase.StaticClass()));
 const mode=read(()=>router.GetActiveInputMode()),moveIgnored=read(()=>controller.IsMoveInputIgnored()),lookIgnored=read(()=>controller.IsLookInputIgnored());
 const layers={},layout=UE.PBZBlueprintFunctionLibrary.GetUILayOut(context);
 for(const name of ['UI.Layer.Menu','UI.Layer.Sequence','UI.Layer.GameSystem','UI.Layer.BlackScreen']){
  const tag=new UE.GameplayTag();tag.TagName=name;const widget=layout?.Layers.Get(tag)?.GetActiveWidget();
  if(widget)layers[name]={name:widget.GetName(),active:widget.IsActivated(),opacity:widget.GetRenderOpacity()};
 }
 const ready=!!session.worldLoadingComplete&&!!session.directArrival?.released&&!!session.ux?.directReady&&!session.cinematicActive;
 const routable=mode!==null&&mode!==UE.ECommonInputMode.Menu&&moveIgnored===false&&lookIgnored===false;
 const sample={ms:now-state.start,ready,routable,inputMode:mode,moveIgnored,lookIgnored,paused:UE.GameplayStatics.IsGamePaused(context),cinematic:!!session.cinematicActive,position:vector(player.K2_GetActorLocation()),input:read(()=>vector(player.GetLastMovementInputVector())),velocity:read(()=>vector(player.GetVelocity())),lockTarget:read(()=>player.LockTargetActor?.GetName()),montage:read(()=>player.GetCurrentMontage()?.GetName()),layers,health:UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter(player,UE.PBZBlueprintFunctionLibrary.MakeAttribute('Health',UE.BasicAttributeSet.StaticClass()))};
 if(ready&&state.facingProbeStartedAt===undefined)state.facingProbeStartedAt=now;
 if(state.facingProbeStartedAt!==undefined&&now-state.facingProbeStartedAt<=10000){
  const facing={ms:sample.ms,sinceReadyMs:now-state.facingProbeStartedAt,health:sample.health,montage:sample.montage,position:sample.position,...captureFacing(player,controller,!state.entryFacingSamples?.length)};
  state.entryFacingSamples=[...(state.entryFacingSamples||[]),facing].slice(-101);
 }
 // Exact retake only: UI routing can be valid while an ability or locomotion
 // state rejects attacks/movement. Observe native state without repairing it.
 if(session.boss.id==='BP_Monster_FengXueDaoKe'&&ready&&(!state.routableAt||now-state.routableAt<15000)){
  const diagnostic={time:now,method:'read-only-native-control-state',tags:{},errors:[]};
  const inspect=(field,fn)=>{try{return fn();}catch(error){diagnostic.errors.push({field,error:String(error)});return null;}};
  const asc=inspect('abilitySystem',()=>UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(player));
  for(const name of ['CharacterState.InLevelSequence','CharacterState.Dead','CharacterState.Forbid','CharacterState.Hitreact','CharacterState.Stand','CharacterState.Action','CharacterState.AbilityState','CharacterState.StatusInfliction.Frost.Effect','CharacterState.Stand.Steady','CharacterState.Hitreact.State.Frozen']){
   diagnostic.tags[name]=inspect(name,()=>{if(!asc?.HasMatchingGameplayTag)return null;const tag=new UE.GameplayTag();tag.TagName=name;return asc.HasMatchingGameplayTag(tag);});
  }
  const driver=inspect('locomotionDriver',()=>player.GetLocomotionDriverComponent());
  diagnostic.rawMoveInput=inspect('rawMoveInput',()=>vector(driver.GetCurrentMoveInputRaw()));
  diagnostic.worldMoveInput=inspect('worldMoveInput',()=>vector(driver.GetCurrentMoveInputWorldSpace()));
  diagnostic.constrainedMoveInput=inspect('constrainedMoveInput',()=>vector(driver.GetCurrentMoveInputWorldSpaceAfterConstraint()));
  diagnostic.movementMode=inspect('movementMode',()=>player.CharacterMovement.MovementMode);
  diagnostic.montage=sample.montage;diagnostic.velocity=sample.velocity;diagnostic.health=sample.health;
  sample.nativeControlState=diagnostic;
  state.nativeControlSamples=[...(state.nativeControlSamples||[]),diagnostic].slice(-150);
  session.ux.nativeControlState=diagnostic;
 }
 if(ready&&!state.readyAt)state.readyAt=now;
 if(ready&&routable&&!state.routableAt)state.routableAt=now;
 if(ready&&(!state.routableAt||now-state.routableAt<2000)){
  const route=JSON.stringify({routable,mode,moveIgnored,lookIgnored,paused:sample.paused,layers});
  if(route!==state.entryRoute){state.entryRoute=route;state.entryRoutingTransitions.push({...sample});state.entryRoutingTransitions=state.entryRoutingTransitions.slice(-64);}
  if(state.entryInitialHealth===undefined)state.entryInitialHealth=sample.health;
  state.entryMinimumHealth=Math.min(state.entryMinimumHealth??sample.health,sample.health);
  if(!routable)state.entryBlockedMinimumHealth=Math.min(state.entryBlockedMinimumHealth??sample.health,sample.health);
 }
 if(ready&&!routable)state.blockedMs=(state.blockedMs||0)+100;
 if(ready&&now-state.readyAt<2000)state.entrySamples.push(sample);
 state.samples.push(sample);if(state.samples.length>250)state.samples.shift();state.keys=state.keys.slice(-100);
 session.ux.controls={routable,mode,moveIgnored,lookIgnored,blockedMs:state.blockedMs||0,releaseDelayMs:state.routableAt&&state.readyAt?state.routableAt-state.readyAt:null,entryBlockedSamples:state.entrySamples.filter(s=>!s.routable).length,entrySampleCount:state.entrySamples.length,inputObserved:state.keys.length>0&&state.samples.some(s=>s.ready&&s.input&&Math.hypot(s.input.X,s.input.Y)>0.05)};
 Object.assign(session.ux.controls,{entryInitialHealth:state.entryInitialHealth,entryMinimumHealth:state.entryMinimumHealth,entryBlockedMinimumHealth:state.entryBlockedMinimumHealth});
 if(now-state.lastSave<1500)return;state.lastSave=now;
 const sl=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZSaveLoadSubsystem.StaticClass()),ok=puerts.$ref(false),value=puerts.$ref(new UE.JsonObjectWrapper());
 UE.JSONUtility.ParseStringToJson(JSON.stringify({...state,time:now,controls:session.ux.controls}),ok,value);
 if(puerts.$unref(ok)){sl.SaveAdvancedObjectDataAndSync('CodexBossLabControlsQA',puerts.$unref(value));sl.SaveAdvancedSaveGameNow();}
}
exports.tick=tick;
exports.captureDomain=captureDomain;

exports.captureHuaEntrance=captureHuaEntrance;
exports.captureDuo=captureDuo;
exports.captureFacing=captureFacing;
