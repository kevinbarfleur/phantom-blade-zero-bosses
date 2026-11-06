"use strict";
const UE=require("ue"),puerts=require("puerts");
// The authored seven-member RedTroop group owns its coordinated support AI.
// Repeatedly stopping and individually restarting its soldiers freezes it.
const nativeSupportAI=boss=>boss.id==='BP_Monster_HuaShan_RedTroop_BigBro'&&boss.profile.nativeSupportAI===true;
const heldClasses=boss=>[...boss.classes,...nativeSupportAI(boss)?[]:boss.supportClasses||[]];
let scope=null;
const patched={recorder:false,loot:false,pickup:false,settlement:false};
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
function authoredPawn(context,profile){
    const id=profile.nativeSpawnerID||profile.primarySpawnerID;
    if(!id||id==="None"||!UE.SGameAIWorldSubsystem)return null;
    const system=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.SGameAIWorldSubsystem.StaticClass());
    const pawn=system?.GetSpawner(id)?.GetPawn();
    return pawn&&UE.KismetSystemLibrary.IsValid(pawn)?pawn:null;
}
function prepareEntranceFlow(context,session){
    const p=session.boss.profile,policy=require('./entry-policy');
    if(!require('./entry-policy').manual(p)||session.cinematicActive||session.ux?.directIntroObserved||require('./cinema').pending?.(context)||!session.worldLoadingComplete||!session.ux?.nativeArrivalLoaded)return;
    const path=p.directEntry.graph;
    if(!path||!UE.FlowComponent)return;
    const owner=policy.owner(p);
    if(owner.kind==='pawn'&&!session.nativeSpawnerReady)return;
    let pawn=authoredPawn(context,p);
    if(owner.kind==='actor'){
        pawn=session.entranceOwner;
        if(!pawn||!UE.KismetSystemLibrary.IsValid(pawn)){
            const cls=UE.Class.Load(owner.class),out=puerts.$ref(UE.NewArray(UE.Actor));
            UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);const actors=puerts.$unref(out);
            for(let i=0;i<actors.Num();i++)if(actors.Get(i).GetName()===owner.name){pawn=actors.Get(i);break;}
            session.entranceOwner=pawn;
        }
    }
    if(!pawn)return;
    const component=pawn.GetComponentByClass(UE.FlowComponent.StaticClass());if(!component)return;
    const instance=component.GetRootFlowInstance();
    // A live authored flow owns its own entrance, cinematic and phases.
    if(instance&&UE.KismetSystemLibrary.IsValid(instance)){
        const active=instance.IsActive();session.ux={...session.ux,nativeEntranceFlowExisting:{name:instance.GetName(),active}};
        if(active){
            session.entranceFlowPrepared=true;
            const entry=p.directEntry;
            if(!same(UE.KismetSystemLibrary.GetPathName(component.RootFlow),path+'.'+path.split('/').pop()))return;
            // Streaming can replace an active flow after its entry was sent,
            // before its sequence starts. Claim each native instance once,
            // without retaining its wrapper or replaying a previous instance.
            const signalKey=[p.level||'',path,instance.GetName()].join(':');
            const signalled=session.entranceSignalInstances||[];
            if(!signalled.includes(signalKey)&&entry?.kind==='native-entry-volume'&&entry.sequences?.length&&session.ux?.nativeArrivalLoaded&&session.worldLoadingComplete){
                // Repeated native recreation must still end at the ordinary
                // entry watchdog, rather than resetting gates indefinitely.
                if(signalled.length>=4){session.ux={...session.ux,entranceInstanceDispatchLimit:true};return;}
                const parts=entry.node.split('-');if(parts.length!==4||parts.some(p=>! /^[0-9a-f]{8}$/i.test(p)))return;
                const guid=new UE.Guid();['A','B','C','D'].forEach((key,i)=>guid[key]=parseInt(parts[i],16));
                const node=instance.GetNode(guid);if(!node||!UE.KismetSystemLibrary.IsValid(node))return;
                const signalPin=policy.signalPin(p);
                const once=node.GetConnectionNodeByOutputName(signalPin);
                if(once&&/ExecuteOnce_C/.test(once.GetName())&&typeof once.GetNodeSaveString==='function'){
                    // Loading can consume the native one-shot before its
                    // sequence host is ready. Reset only that entrance gate,
                    // using the game's own actor-qualified save key.
                    const saved=puerts.$ref('');const returned=once.GetNodeSaveString(saved),savedKey=puerts.$unref(saved);
                    const pipeline=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.EventPipelineManager.StaticClass());
                    session.ux={...session.ux,entranceGateKey:{value:savedKey,type:typeof savedKey,returned}};
                    if(typeof savedKey==='string'&&savedKey&&pipeline.ExecuteNodeGuid.Get(savedKey)!==undefined)pipeline.ExecuteNodeGuid.Remove(savedKey);
                    const g=once.GetGuid(),key=['A','B','C','D'].map(k=>(g[k]>>>0).toString(16).padStart(8,'0')).join('').toUpperCase();
                    if(pipeline.ExecuteNodeGuid.Get(key)!==undefined)pipeline.ExecuteNodeGuid.Remove(key);once.SetAllOutPutsExecuteDoneFalse();
                }
                node.SetAllOutPutsExecuteDoneFalse();
                // A restored NPC can retain a different active interaction
                // branch. Resolve the exact authored entry on this pawn's
                // live graph instead of waiting for a physical overlap. Its
                // ExecuteOnce/sequence/combat chain owns everything after it.
                session.entranceSignalSent=true;
                session.entranceSignalInstances=[...signalled,signalKey];
                node.TriggerOutput(signalPin,false);
                session.ux={...session.ux,nativeEntranceTriggered:entry.node,nativeEntranceSignalPin:signalPin,nativeEntranceSignalInstances:[...session.entranceSignalInstances]};
                delete session.ux.entranceFlowError;
            }
            return;
        }
    }
    if(session.entranceFlowPrepared)return;
    const existing=component.RootFlow;
    if(existing&&UE.KismetSystemLibrary.IsValid(existing)&&!same(UE.KismetSystemLibrary.GetPathName(existing),path+'.'+path.split('/').pop()))return;
    // AIScript_SetFlowAsset normally assigns this asset before the pawn's
    // initial registration. A streamed/pool pawn may miss that start. Reuse
    // the component's native dynamic initialization instead of inventing AI.
    const flow=UE.FlowAsset.Load(path+'.'+path.split('/').pop());
    if(!flow||typeof component.SetAndStartRootFlow!=='function')throw Error('Native fight initialization unavailable');
    component.SetAndStartRootFlow(flow);session.entranceFlowPrepared=true;session.entryBoundaryPending=true;
    session.ux={...session.ux,nativeEntranceFlowInitialized:path};
}
function stop(){
    if(scope)for(const task of scope.tasks||[])try{task.Cancel();}catch(_){}
    scope=null;
}
function install(session,onVictory){
    stop();session.engaged={};scope={session,onVictory,tasks:[],excluded:{}};
}
function patchLoot(Type){
    patched.loot=true;
    const native=Type.prototype.K2_ExecuteInput;
    Type.prototype.K2_ExecuteInput=function(...args){
        // This package is mounted only in the isolated lab session. Some builds
        // implement this entry in Blueprint rather than JavaScript.
        if(!scope?.session.active)return typeof native==="function"?native.apply(this,args):undefined;
        scope.session.rewardsSuppressed=(scope.session.rewardsSuppressed||0)+1;
        this.TriggerOutput("获得物品的瞬间",false);this.TriggerOutput("UI开始渐隐",false);this.TriggerOutput("获得物品UI关闭后",true);
    };
}
function patchPickup(Type){
    patched.pickup=true;
    const p=Type.prototype,init=p.InitItemByData,activate=p.BP_OnActivated;
    const active=()=>scope&&scope.session.active;
    function advance(widget){
        if(!UE.KismetSystemLibrary.IsValid(widget))return;
        const pack=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(widget,UE.PBZBackPackSubsystem.StaticClass());
        if(pack){pack.ReadyToPlayConfirmUI();if(pack.RefreshItem(widget))return;}
        widget.DeactivateWidget();
    }
    p.InitItemByData=function(...args){
        if(!active())return init.apply(this,args);
        this.codexSuppressedPickup=true;this.SetRenderOpacity(0);
        scope.session.rewardsSuppressed=(scope.session.rewardsSuppressed||0)+1;
        setTimeout(()=>advance(this),0);
    };
    p.BP_OnActivated=function(...args){if(!active())return activate.apply(this,args);this.SetRenderOpacity(0);};
}
function patchSettlement(Type){
    patched.settlement=true;
    const p=Type.prototype,run=p.K2_ExecuteInput;
    p.K2_ExecuteInput=function(...args){if(scope&&scope.session.active)return;return run.apply(this,args);};
}
function observeActor(context,actor,path){
    const current=scope;if(!current?.session.active)return;
    const name=actor.GetName(),selected=current.session.boss;
    if(current.excluded[name])return;
    const tag=new UE.GameplayTag();tag.TagName="CharacterState.Dead";
    const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor);
    if(asc?.HasMatchingGameplayTag(tag))return;
    const record={path,row:path.split('.').pop().replace(/_C$/,''),source:"native-death-observer"};
    current.excluded[name]=record;
    if(selected.unlockTag&&selected.unlockTag!=="None")return;
    if(selected.classes.length>1&&selected.id!=="BP_Monster_MBoss"&&!same(selected.classes[selected.classes.length-1],path))return;
    const task=UE.AbilityAsync_WaitGameplayTagAdded.WaitGameplayTagAddToActor(actor,tag,true);
    current.tasks.push(task);
    task.Added.Add(()=>{current.tasks=current.tasks.filter(t=>t!==task);task.Cancel();if(scope===current&&current.session.active)current.onVictory(context,record);});
    task.Activate();
}
function poll(context,session){
    if(!scope||scope.session!==session||!session.active||session.completed)return;
    for(const path of session.boss.classes){
        const cls=UE.Class.Find(path);if(!cls)continue;
        const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);const actors=puerts.$unref(out);
        for(let i=0;i<actors.Num();i++)try{
            const actor=actors.Get(i);if(!actor||!UE.KismetSystemLibrary.IsValid(actor)||actor.bHidden)continue;
            const actual=UE.KismetSystemLibrary.GetPathName(actor.GetClass());if(!session.boss.classes.some(p=>same(p,actual)))continue;
            const at=session.boss.profile.arena;
            if(at){const p=actor.K2_GetActorLocation();if(Math.hypot(p.X-at.X,p.Y-at.Y,p.Z-at.Z)>20000)continue;}
            observeActor(context,actor,actual);
        }catch(error){session.observerError=String(error);}
    }
}
function patchRecorder(Type){
    patched.recorder=true;
    const p=Type.prototype,finish=p.finishSession;
    p.finishSession=function(name,killed,...args){
        const record=this.sessions&&this.sessions.get(name);
        const row=record&&record.rowName,path=record&&record.classPath;
        const result=finish.call(this,name,killed,...args);
        if(record&&killed&&scope&&scope.session.active){
            const boss=scope.session.boss;
            // A literature record may unlock after a first wave. Encounters
            // with an authored terminal tag wait for that exact native signal.
            if((!boss.unlockTag||boss.unlockTag==="None")&&(boss.members.includes(row)||boss.classes.some(p=>same(p,path))))scope.onVictory(this.contextObject,{row,path});
        }
        return result;
    };
    const engage=p.onBossEngaged;
    if(typeof engage==="function")p.onBossEngaged=function(payload){
        const result=engage.call(this,payload);
        if(!scope?.session.active||!payload?.Target)return result;
        const actor=payload.Target,name=actor.GetName(),path=UE.KismetSystemLibrary.GetPathName(actor.GetClass());
        const selected=scope.session.boss;
        if(![...selected.classes,...selected.supportClasses||[]].some(p=>same(p,path)))return result;
        scope.session.engaged[name]=path;
        if(!selected.classes.some(p=>same(p,path)))return result;
        observeActor(this.contextObject,actor,path);return result;
    };
    const unlock=p.onUnlockTagsAdded;
    if(typeof unlock==="function")p.onUnlockTagsAdded=function(tags){
        const result=unlock.call(this,tags),current=scope;
        if(!current?.session.active||!Object.keys(current.excluded).length)return result;
        const name=current.session.boss.unlockTag;
        if(name&&name!=="None"){
            const tag=new UE.GameplayTag();tag.TagName=name;
            if(UE.BlueprintGameplayTagLibrary.HasTag(tags,tag,true))current.onVictory(this.contextObject,Object.values(current.excluded)[0]);
        }
        return result;
    };
}
exports.install=install;exports.patchRecorder=patchRecorder;exports.patchLoot=patchLoot;exports.patchPickup=patchPickup;exports.patchSettlement=patchSettlement;
exports.status=()=>({...patched,observed:scope?Object.keys(scope.excluded).length:0,observerError:scope?.session.observerError||null});
exports.stop=stop;
exports.poll=poll;
exports.activateDirectCombat=(context,session)=>{
    const boss=session.boss;
    if(!scope||!session.active||session.completed||boss.training||boss.profile.nativeController||["BP_Monster_MuXiaoKui","BP_Monster_ZuoShang_Ending"].includes(boss.id))return;
    if(session.arrivalAnchorPending||session.cinematicActive||!session.directArrival?.released)return;
    if(!boss.profile.directEntry?.sequences?.length&&Date.now()-(session.directArrival.releasedAt||0)<400)return;
    if(boss.profile.directEntry?.sequences?.length&&!session.ux?.directIntroObserved)return;
    if(Object.keys(scope.arrivalHeld||{}).length)for(const path of heldClasses(boss)){
        const klass=UE.Class.Find(path);if(!klass)continue;
        const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,klass,out);const actors=puerts.$unref(out);
        for(let i=0;i<actors.Num();i++){
            const actor=actors.Get(i),name=actor.GetName();if(!scope.arrivalHeld[name])continue;
            // Streaming can invalidate a Puerts component wrapper. Resolve it
            // afresh from the current pawn instead of retaining native refs.
            const component=actor.GetController?.()?.GetBlueprintSGameAIComponent?.();
            if(component&&UE.KismetSystemLibrary.IsValid(component))component.StartAI();
            delete scope.arrivalHeld[name];
        }
    }
    const path=boss.classes[0],cls=UE.Class.Find(path);if(!cls)return;
    const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);
    const actors=puerts.$unref(out),authored=authoredPawn(context,boss.profile),player=UE.GameplayStatics.GetPlayerCharacter(context,0).K2_GetActorLocation();
    const dead=new UE.GameplayTag();dead.TagName="CharacterState.Dead";
    const usable=actor=>{
        if(!actor||actor.bHidden||!same(UE.KismetSystemLibrary.GetPathName(actor.GetClass()),path))return false;
        if(UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor)?.HasMatchingGameplayTag(dead))return false;
        const at=actor.K2_GetActorLocation();return Math.hypot(at.X-player.X,at.Y-player.Y,at.Z-player.Z)<=5000;
    };
    // A native introduction may replace its preview pawn. A hidden or dead
    // spawner reference must not prevent the actual visible fighter starting.
    const candidates=usable(authored)?[authored]:Array.from({length:actors.Num()},(_,i)=>actors.Get(i));
    scope.directStarted=scope.directStarted||{};
    for(const actor of candidates){
        const name=actor.GetName();if(actor.bHidden||scope.directStarted[name])continue;
        if(!same(UE.KismetSystemLibrary.GetPathName(actor.GetClass()),path))continue;
        const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor);if(asc?.HasMatchingGameplayTag(dead))continue;
        const at=actor.K2_GetActorLocation();if(Math.hypot(at.X-player.X,at.Y-player.Y,at.Z-player.Z)>5000)continue;
        const library=puerts.blueprint.tojs(UE.Class.Load("/HuaShira/Animation/Seqs/BP_PBZSequenceFunctionLibrary.BP_PBZSequenceFunctionLibrary_C"));
        const activation=boss.profile.nativeCombatActivation;
        if(!boss.profile.directEntry?.sequences?.length&&(activation?.becomeMonster||activation?.attackable)){
            const flow=puerts.blueprint.tojs(UE.Class.Load("/Game/PBZContent/Blueprint/FlowGraph/FunctionLib/BP_FlowUtils.BP_FlowUtils_C"));
            // Native SetBecomeMonster / SetAttackEnable nodes, with their
            // authored intent and original execution rules; no campaign save.
            if(activation.becomeMonster)flow.SetActorBecomeMonster(actor,true,false,false,false,context);
            if(activation.attackable)flow.SetActorAttackable(actor,true,false,true,false,false,context);
        }
        // ForceIntoCombat uses the authored AI component and the real player
        // target. Later phases and scripted native controllers keep their flow.
        library.StartAI(actor,true,context);scope.directStarted[name]=true;
        session.ux={...session.ux,directCombatStarted:true};
    }
};
exports.hasObserved=name=>!!scope?.excluded[name];
exports.holdDirectCombat=(context,session)=>{
    const p=session.boss?.profile,arrival=session.directArrival;
    if(!scope||scope.session!==session||!session.active||session.completed||session.boss.training||!p?.directEntry||p.directEntry.sequences?.length||!arrival?.coverRequested||arrival.released)return;
    const names=[];
    // Stop the native movement/decision component as SpawnMonsterEx does for
    // a dormant pawn. A combat-disable tag alone still permits an idle patrol
    // to walk into the landing point while the streaming cover is active.
    if(nativeSupportAI(session.boss))session.ux={...session.ux,nativeSupportAI:true};
    for(const path of heldClasses(session.boss)){
        const cls=UE.Class.Find(path);if(!cls)continue;
        const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);const actors=puerts.$unref(out);
        for(let i=0;i<actors.Num();i++){
            const actor=actors.Get(i);if(actor.bHidden||!same(UE.KismetSystemLibrary.GetPathName(actor.GetClass()),path))continue;
            const at=actor.K2_GetActorLocation(),arena=p.arena;
            if(arena&&Math.hypot(at.X-arena.X,at.Y-arena.Y,at.Z-arena.Z)>5000)continue;
            const controller=actor.GetController?.(),component=controller?.GetBlueprintSGameAIComponent?.();
            if(component&&UE.KismetSystemLibrary.IsValid(component)){
                component.StopAI();controller.StopMovement?.();names.push(actor.GetName());
                (scope.arrivalHeld||(scope.arrivalHeld={}))[actor.GetName()]=true;
            }
        }
    }
    if(names.length)session.ux={...session.ux,arrivalAIHeld:names};
};
exports.prepareEncounter=(context,session)=>{
    const boss=session.boss,p=boss.profile;
    if(!session.active||session.completed)return;
    const afterArrival=p.restoreLayersAfterArrival&&!session.layersRestoredAfterArrival&&(session.directArrival?.released||session.directArrival?.streamingReady)&&!session.cinematicActive;
    if((!session.layersPrepared||afterArrival)&&(p.loadLayers?.length||p.unloadLayers?.length)){
        // The pipeline reapplies its saved layers during world initialization.
        // Wait for the stable preparation point before changing the live state.
        if(session.arrivalAnchorPending||session.worldLoadingComplete===false)return;
        try{
            const manager=UE.WorldPartitionBlueprintLibrary.GetDataLayerManager(context);
            if(!manager)return;
            // Same native manager as SetDataLayerVisibility. Only the authored
            // leaf layers change; never recursively activate the campaign tree.
            for(const [paths,state]of [[p.unloadLayers||[],0],[p.loadLayers||[],2]])for(const path of paths){
                const asset=UE.DataLayerAsset.Load(path);
                if(!asset)throw new Error("Map layer unavailable: "+path);
                manager.SetDataLayerRuntimeState(asset,state,false);
            }
            session.layersPrepared=true;session.ux={...session.ux,nativeLayersPrepared:true};
            delete session.ux.layerPreparationError;
            // The native landing cover can finish streaming after the first
            // world preparation. Reconcile the selected season once at its
            // playable exit, without continuously rewriting a phase's layers.
            if(afterArrival){session.layersRestoredAfterArrival=true;session.ux.layersRestoredAfterArrival=true;}
        }catch(error){session.ux={...session.ux,layerPreparationError:String(error)};}
        return;
    }
    // These two battles have a separate native controller (guardian waves or
    // the ending sequence). Other phase fights can prepare their first pawn;
    // their native death graph remains responsible for subsequent phases.
    try{prepareEntranceFlow(context,session);}catch(error){session.ux={...session.ux,entranceFlowError:String(error)};}
    if(session.nativeSpawnerReady)return;
    if(p.nativeController||["BP_Monster_MuXiaoKui","BP_Monster_ZuoShang_Ending"].includes(boss.id))return;
    const id=boss.trial?p.nativeSpawnerID:p.primarySpawnerID;
    if((!id||id==="None")&&!p.primarySpawnerActor)return;
    if(!boss.trial&&(session.arrivalAnchorPending||session.cinematicActive))return;
    // A second native teleport cover can stream the approach cells out again.
    // Never force a cinematic pawn to spawn before its destination is loaded.
    if(!boss.trial&&p.directEntry&&!session.ux?.nativeArrivalLoaded&&!session.directArrival?.released&&!(session.directArrival?.coverRequested&&!p.directEntry.sequences?.length))return;
    if(!boss.trial&&p.arena){const at=UE.GameplayStatics.GetPlayerCharacter(context,0).K2_GetActorLocation();if(Math.hypot(at.X-p.arena.X,at.Y-p.arena.Y,at.Z-p.arena.Z)>15000)return;}
    if((session.trialPrepareAttempts||0)>=120)return;
    session.trialPrepareAttempts=(session.trialPrepareAttempts||0)+1;
    try{
        // Exactly the native SpawnMonsterEx path: use the registered campaign
        // spawner and the game's own initialization, with combat still dormant.
        const cls=UE.Class.Load("/HuaShira/Animation/Seqs/BP_PBZSequenceFunctionLibrary.BP_PBZSequenceFunctionLibrary_C");
        const library=puerts.blueprint.tojs(cls);
        if(require("./validation").enabled){
            try{const system=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.SGameAIWorldSubsystem.StaticClass());session.ux={...session.ux,nativeSpawnerFound:!!system?.GetSpawner(id)};}
            catch(error){session.ux={...session.ux,spawnerDiagnosticError:String(error)};}
        }
        // The actor pool can retain same-class stand-ins. The registered
        // encounter spawner owns the actual live combat pawn.
        let actor=authoredPawn(context,p);
        if(!actor&&id&&id!=="None")actor=library.SpawnRealMonsterAndHidden(id,false,true,false,context);
        if(!actor&&p.primarySpawnerActor){
            // Some campaign spawners have no registered ID. Use that exact
            // authored spawner, preserving its class, domain and native level.
            const cls=UE.Class.Load("/SGameAI/Tools/Spawner/BP_AISpawner.BP_AISpawner_C"),out=puerts.$ref(UE.NewArray(UE.Actor));
            UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);const spawners=puerts.$unref(out);
            for(let i=0;i<spawners.Num();i++){
                const spawner=spawners.Get(i);if(spawner.GetName()!==p.primarySpawnerActor)continue;
                const info=spawner.SpawnInfo,old=info.bAutoStartAI;info.bAutoStartAI=true;info.bHiddenByDefault=false;spawner.SpawnInfo=info;
                try{spawner.SetShouldSpawn(true);spawner.UpdateSaveInfo();spawner.LoadAssetBlocking=true;spawner.SpawnFromSequence();actor=spawner.GetPawn();}
                finally{const after=spawner.SpawnInfo;after.bAutoStartAI=old;spawner.SpawnInfo=after;}
                break;
            }
        }
        if(actor&&UE.KismetSystemLibrary.IsValid(actor)){
            if(p.directEntry&&!p.directEntry.sequences?.length){
                // Awake the authored pawn while the native loading cover is
                // active, keeping combat disabled until facing is finalized.
                // StartAI at the playable release clears this same native tag.
                const tag=new UE.GameplayTag();tag.TagName='AI.DisableCombatAI';
                actor.SetActorEnableCollision(true);
                UE.AbilityUtils.SetLooseGameplayTagCount(actor,tag,1);
                library.AwakeAI(actor,false,context);session.ux={...session.ux,arrivalAISuppressed:true};
            }else library.StartAI(actor,false,context);
            session.nativeSpawnerReady=true;session.trialReady=!!boss.trial;
            session.ux={...session.ux,nativeEncounterPrepared:true,nativeTrialPrepared:!!boss.trial};
        }
    }catch(error){session.ux={...session.ux,trialPreparationError:String(error)};}
};
