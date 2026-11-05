"use strict";
const UE=require("ue"),puerts=require("puerts");
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
    if(boss.profile.directEntry?.sequences?.length&&!session.ux?.directIntroObserved)return;
    const path=boss.classes[0],cls=UE.Class.Find(path);if(!cls)return;
    const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);
    const actors=puerts.$unref(out),authored=authoredPawn(context,boss.profile),candidates=authored?[authored]:Array.from({length:actors.Num()},(_,i)=>actors.Get(i)),player=UE.GameplayStatics.GetPlayerCharacter(context,0).K2_GetActorLocation();
    const dead=new UE.GameplayTag();dead.TagName="CharacterState.Dead";
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
exports.prepareEncounter=(context,session)=>{
    const boss=session.boss,p=boss.profile;
    if(!session.active||session.completed)return;
    const afterArrival=p.restoreLayersAfterArrival&&!session.layersRestoredAfterArrival&&session.directArrival?.released&&!session.cinematicActive;
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
                if(!asset)throw new Error("Couche de carte indisponible: "+path);
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
    if(session.nativeSpawnerReady||p.nativeController||["BP_Monster_MuXiaoKui","BP_Monster_ZuoShang_Ending"].includes(boss.id))return;
    const id=boss.trial?p.nativeSpawnerID:p.primarySpawnerID;
    if((!id||id==="None")&&!p.primarySpawnerActor)return;
    if(!boss.trial&&(session.arrivalAnchorPending||session.cinematicActive))return;
    // A second native teleport cover can stream the approach cells out again.
    // Never force a cinematic pawn to spawn before its destination is loaded.
    if(!boss.trial&&p.directEntry&&!session.ux?.nativeArrivalLoaded&&!session.directArrival?.released)return;
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
            library.StartAI(actor,false,context);session.nativeSpawnerReady=true;session.trialReady=!!boss.trial;
            session.ux={...session.ux,nativeEncounterPrepared:true,nativeTrialPrepared:!!boss.trial};
        }
    }catch(error){session.ux={...session.ux,trialPreparationError:String(error)};}
};
