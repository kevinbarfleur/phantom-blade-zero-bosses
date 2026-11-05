"use strict";
// Local QA only. These inputs are inactive in ordinary launcher sessions.
const UE=require("ue"),puerts=require("puerts");
const config=require("./qa-config"),bosses=require("./boss-catalog").filter(b=>b.available!==false);
const enabled=config.mode!=="manual";
const automated=["survey","arrival","combat","retry","direct","system-flow"].includes(config.mode);
let systemFlowPawn=null,systemFlowTicks=0;
const exitTrace={pawn:null,start:0,samples:[]};
function cinemaExitTrace(context,session){
    if(!exitTrace.apis){exitTrace.apis=true;const apis={};for(const name of ['PBZTeleportCoverSubsystem','PBZLevelSequenceManager','PBZMediaSequenceQueryLibrary','PlayerCameraManager'])try{apis[name]={instance:Object.getOwnPropertyNames(UE[name].prototype),static:Object.getOwnPropertyNames(UE[name])};}catch(_){}ui(context,'intro-exit-apis',session,{apis});}
    if(!session.ux.directIntroObserved)return;
    const pawn=UE.GameplayStatics.GetPlayerCharacter(context,0),name=pawn?.GetName();
    if(exitTrace.pawn!==name){exitTrace.pawn=name;exitTrace.start=Date.now();exitTrace.samples=[];exitTrace.tick=0;exitTrace.finished=0;}
    if(++exitTrace.tick%3!==0)return;
    if(!session.cinematicActive){exitTrace.finished=exitTrace.finished||Date.now();if(Date.now()-exitTrace.finished>7000)return;}
    const camera=UE.GameplayStatics.GetPlayerController(context,0)?.PlayerCameraManager,layout=UE.PBZBlueprintFunctionLibrary.GetUILayOut(context),layers={};
    for(const name of ['UI.Layer.Menu','UI.Layer.Sequence','UI.Layer.BlackScreen']){const tag=new UE.GameplayTag();tag.TagName=name;const w=layout?.Layers.Get(tag)?.GetActiveWidget();layers[name]=w?{name:w.GetName(),class:UE.KismetSystemLibrary.GetPathName(w.GetClass()),active:w.IsActivated(),opacity:w.GetRenderOpacity()}:null;}
    const visible=[];
    for(const path of ['/Game/PBZContent/Blueprint/FlowGraph/UI/WBP_FlowSequencer.WBP_FlowSequencer_C','/Game/PBZContent/UI/Hud/WB_TempLoadingScreen.WB_TempLoadingScreen_C','/Game/PBZContent/Blueprint/FlowGraph/UI/WB_BlackScreen_Flow.WB_BlackScreen_Flow_C']){
        const cls=UE.Class.Find(path);if(!cls)continue;const all=puerts.$ref(UE.NewArray(UE.UserWidget));UE.WidgetBlueprintLibrary.GetAllWidgetsOfClass(context,all,cls,false);const widgets=puerts.$unref(all);
        for(let i=0;i<widgets.Num();i++){const w=widgets.Get(i);visible.push({name:w.GetName(),visible:w.IsVisible(),active:w.IsActivated(),opacity:w.GetRenderOpacity(),imageBlack:w.ImageBlack?.GetRenderOpacity(),background:w.ImageBlackBackGround?.GetRenderOpacity()});}
    }
    const manager=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZUIManagerSubsystem.StaticClass()),tag=new UE.GameplayTag();tag.TagName='UI.Layer.Sequence';const w=manager.GetActivateWidgetByLayer(tag,UE.Class.Find('/Game/PBZContent/Blueprint/FlowGraph/UI/WBP_FlowSequencer.WBP_FlowSequencer_C'));
    const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(pawn),inSequence=new UE.GameplayTag();inSequence.TagName='CharacterState.InLevelSequence';
    exitTrace.samples.push({ms:Date.now()-exitTrace.start,cover:UE.PBZTeleportCoverSubsystem.IsAnyTeleportCoverActive(context),cinematic:!!session.cinematicActive,inSequence:asc?.HasMatchingGameplayTag(inSequence),playing:w?.InLevelSeqPlayer?.IsPlaying(),fade:camera?.FadeAmount,remaining:camera?.FadeTimeRemaining,health:UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter(pawn,UE.PBZBlueprintFunctionLibrary.MakeAttribute('Health',UE.BasicAttributeSet.StaticClass())),layers,visible});
    if(exitTrace.samples.length%10===0)ui(context,'intro-exit-trace',session,{samples:exitTrace.samples});
}
const direct={results:[],index:0,ticks:0,lastBoss:null,done:false,capturing:false};
const trainingFlow={phase:"waiting",done:false};
const held={};
const survey={started:false,index:0,ticks:0,results:[],capturing:false,lastBoss:null};
const combat={index:0,ticks:0,results:[],lastBoss:null,stage:"waiting",lastKill:0};
const retry={stage:"waiting",ticks:0,done:false};
const arrivalWait={boss:null,ticks:0};
const uiEvents=[];
let uiFlush=null,uiContext=null;
function flushUI(){
    uiFlush=null;
    try{
        const sl=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(uiContext,UE.PBZSaveLoadSubsystem.StaticClass()),ok=puerts.$ref(false),value=puerts.$ref(new UE.JsonObjectWrapper());
        UE.JSONUtility.ParseStringToJson(JSON.stringify({phase:uiEvents[uiEvents.length-1]?.phase,events:uiEvents}),ok,value);
        if(puerts.$unref(ok)){sl.SaveAdvancedObjectDataAndSync("CodexBossLabUIQA",puerts.$unref(value));sl.SaveAdvancedSaveGameNow();}
    }catch(_){}
}
function ui(context,phase,session,extra={}){
    if(!enabled)return;
    try{
        let position=null;
        if(session.active){const p=UE.GameplayStatics.GetPlayerCharacter(context,0)?.K2_GetActorLocation();if(p)position={X:p.X,Y:p.Y,Z:p.Z};}
        uiEvents.push({phase,time:Date.now(),encounter:session.boss?.id,active:session.active,ux:JSON.parse(JSON.stringify(session.ux||{})),pending:!!session.arrivalAnchorPending,cinematic:!!session.cinematicActive,position,...extra});
        if(session.run)uiEvents[uiEvents.length-1].run=JSON.parse(JSON.stringify(session.run));
        const loader=globalThis.__CodexBossesLoader;
        if(loader)uiEvents[uiEvents.length-1].loader={phase:loader.phase,nativeHooks:loader.hooks.length,achievementAdapterGuard:!!loader.achievementAdapterGuard,achievementStartsSuppressed:loader.achievementStartsSuppressed||0};
        if(session.lastWrite)uiEvents[uiEvents.length-1].lastWrite={...session.lastWrite};
        uiEvents[uiEvents.length-1].cinemaSource=session.cinemaSource||null;
        uiEvents[uiEvents.length-1].engaged={...session.engaged};
        if(uiEvents.length>50)uiEvents.shift();
        // Native callbacks can arrive during load/save locks. Persist the QA
        // trace on a later frame, coalescing same-frame events into one save.
        uiContext=UE.GameplayStatics.GetGameInstance(context);
        if(uiFlush===null)uiFlush=setTimeout(flushUI,100);
    }catch(_){}
}
function menu(context,session,api){
    if(["ux","flow","review"].includes(config.mode)&&!survey.started){survey.started=true;setTimeout(()=>api.showMenu(context),2500);return;}
    if(!enabled||!["survey","arrival","combat","retry","direct","system-flow"].includes(config.mode)||survey.started)return;
    survey.started=true;
    survey.ids=config.ids.length?config.ids:bosses.map(b=>b.id);
    setTimeout(()=>api.replay(context,2,bosses.find(b=>b.id===survey.ids[0]),true,config.skipIntroduction===true),3500);
}
function mark(context,phase){
    try{
        const sl=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZSaveLoadSubsystem.StaticClass());
        const ok=puerts.$ref(false),value=puerts.$ref(new UE.JsonObjectWrapper());
        UE.JSONUtility.ParseStringToJson(JSON.stringify({phase,encounter:survey.lastBoss,index:survey.index,time:Date.now(),results:survey.results,total:survey.ids?.length||0}),ok,value);
        if(puerts.$unref(ok)){sl.SaveAdvancedObjectDataAndSync("CodexBossLabDiagnostics",puerts.$unref(value));sl.SaveAdvancedSaveGameNow();}
    }catch(_){}
}
function surveyTick(context,session,capture,api){
    if(config.mode!=="survey"||!survey.started||survey.done)return;
    if(survey.capturing){
        if(++survey.captureTicks>600){
            const result=survey.pending;
            result.error="checkpoint interrupted by a death or world transition";result.finished=true;
            mark(context,"checkpoint-interrupted");survey.index++;survey.capturing=false;survey.ticks=0;
            if(survey.index>=survey.ids.length){survey.done=true;api.showMenu(context);return;}
            api.travel(context,2,bosses.find(b=>b.id===survey.ids[survey.index]));
        }
        return;
    }
    if(survey.lastBoss!==session.boss.id){survey.lastBoss=session.boss.id;survey.ticks=0;}
    if(++survey.ticks<600)return;
    survey.capturing=true;survey.captureTicks=0;
    mark(context,"before-location");
    let result={id:session.boss.id,bell:session.boss.profile.bell,hooks:session.hooks,expectedLevel:session.boss.balance?.weaponLevel};
    try{
        const p=UE.GameplayStatics.GetPlayerCharacter(context,0).K2_GetActorLocation();
        result.position={X:p.X,Y:p.Y,Z:p.Z};
        result.arrived=true;
    }catch(error){result.error=String(error);}
    survey.results.push(result);
    survey.pending=result;
    mark(context,"before-checkpoint");
    session.validation={survey:{results:survey.results,index:survey.index,total:survey.ids.length,done:survey.index+1>=survey.ids.length}};
    setTimeout(()=>capture(context,()=>{
        if(result.finished)return;result.finished=true;
        result.weapons=Object.entries(session.gear.Inventory.MainWeaponInfos).map(([id,w])=>({id,level:w.WeaponLevel,forged:!!w.AlreadySnapSoul}));
        result.edges=Object.entries(session.gear.Inventory.ShaChiWeaponInfo).map(([id,w])=>({id,level:w.ShaChiWeaponLevel,forged:!!w.AlreadySnapSoul}));
        mark(context,"checkpoint-complete");
        survey.index++;survey.ticks=0;survey.capturing=false;
        if(survey.index>=survey.ids.length){survey.done=true;api.showMenu(context);return;}
        setTimeout(()=>api.travel(context,2,bosses.find(b=>b.id===survey.ids[survey.index])),800);
    }),2000);
}
function selectedActors(context,boss){
    const result=[],seen={};
    const classes=[...boss.classes,...boss.supportClasses||[]];
    if(UE.SGameAIWorldSubsystem){
        const system=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.SGameAIWorldSubsystem.StaticClass());
        const id=boss.profile.nativeSpawnerID||boss.profile.primarySpawnerID,pawn=id&&system?.GetSpawner(id)?.GetPawn();
        if(pawn&&UE.KismetSystemLibrary.IsValid(pawn)){
            const name=pawn.GetName(),path=UE.KismetSystemLibrary.GetPathName(pawn.GetClass());
            if(classes.some(c=>c.toLowerCase()===path.toLowerCase())){result.push({actor:pawn,name,path});seen[name]=true;}
        }
    }
    for(const path of classes){
        const cls=UE.Class.Load(path),actors=puerts.$ref(UE.NewArray(UE.Actor));
        UE.GameplayStatics.GetAllActorsOfClass(context,cls,actors);
        const values=puerts.$unref(actors);
        for(let i=0;i<values.Num();i++){
            const actor=values.Get(i),name=actor.GetName(),path=UE.KismetSystemLibrary.GetPathName(actor.GetClass());
            if(seen[name]||!classes.some(c=>c.toLowerCase()===path.toLowerCase()))continue;
            if(!boss.classes.some(c=>c.toLowerCase()===path.toLowerCase())&&boss.profile.arena){
                const p=actor.K2_GetActorLocation(),at=boss.profile.arena;
                if(Math.hypot(p.X-at.X,p.Y-at.Y,p.Z-at.Z)>(boss.profile.supportRadius||20000))continue;
            }
            seen[name]=true;result.push({actor,name,path});
        }
    }
    return result;
}
function probe(context,boss){
    return selectedActors(context,boss).map(({actor,name,path})=>{
        const p=actor.K2_GetActorLocation(),position={X:p.X,Y:p.Y,Z:p.Z};
        const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor);
        const dead=new UE.GameplayTag();dead.TagName="CharacterState.Dead";
        const inCombat=new UE.GameplayTag();inCombat.TagName="CharacterState.InCombat";
        const attr=name=>UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter(actor,UE.PBZBlueprintFunctionLibrary.MakeAttribute(name,UE.BasicAttributeSet.StaticClass()));
        return {class:path,name,position,hidden:!!actor.bHidden,meshVisible:actor.GetMesh?.()?.IsVisible?.(),controller:actor.GetController?.()?.GetName(),dead:!!asc?.HasMatchingGameplayTag(dead),inCombat:!!asc?.HasMatchingGameplayTag(inCombat),health:attr("Health"),healthMin:attr("Health_Min"),healthMax:attr("Health_Max")};
    });
}
function environmentProbe(context,boss){
    const result={};
    try{
        const manager=UE.WorldPartitionBlueprintLibrary.GetDataLayerManager(context);
        result.layers=(boss.profile.loadLayers||[]).map(path=>{
            const instance=manager.GetDataLayerInstanceFromAsset(UE.DataLayerAsset.Load(path));
            const chain=[];let parent=instance;
            while(parent&&chain.length<8){chain.push({name:parent.GetName(),state:manager.GetDataLayerInstanceRuntimeState(parent),effective:manager.GetDataLayerInstanceEffectiveRuntimeState(parent)});parent=typeof parent.GetParent==="function"?parent.GetParent():null;}
            return {path,chain};
        });
    }catch(error){result.layerError=String(error);}
    try{
        const cls=UE.Class.Load("/SGameAI/Tools/Spawner/BP_AISpawner.BP_AISpawner_C"),out=puerts.$ref(UE.NewArray(UE.Actor));
        UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);const spawners=puerts.$unref(out);result.spawnerCount=spawners.Num();result.selectedSpawners=[];
        for(let i=0;i<spawners.Num();i++){
            const s=spawners.Get(i),name=s.GetName();
            if(!boss.profile.spawners.includes(name)&&String(s.SpawnerID)!==boss.profile.primarySpawnerID)continue;
            result.selectedSpawners.push({name,id:String(s.SpawnerID),shouldSpawn:s.ShouldSpawn,pawn:!!s.GetPawn(),position:s.K2_GetActorLocation()});
        }
    }catch(error){result.spawnerError=String(error);}
    if(boss.profile.nativeController)try{
        const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,UE.Pawn.StaticClass(),out);const pawns=puerts.$unref(out);result.nearbyPawns=[];
        for(let i=0;i<pawns.Num();i++){
            const actor=pawns.Get(i),p=actor.K2_GetActorLocation(),at=boss.profile.arena;
            if(Math.hypot(p.X-at.X,p.Y-at.Y,p.Z-at.Z)>5000)continue;
            result.nearbyPawns.push({name:actor.GetName(),class:UE.KismetSystemLibrary.GetPathName(actor.GetClass()),hidden:!!actor.bHidden});
        }
    }catch(error){result.pawnError=String(error);}
    return result;
}
function combatMark(context,phase){
    try{
        const sl=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZSaveLoadSubsystem.StaticClass());
        const ok=puerts.$ref(false),value=puerts.$ref(new UE.JsonObjectWrapper());
        UE.JSONUtility.ParseStringToJson(JSON.stringify({phase,encounter:combat.lastBoss,index:combat.index,time:Date.now(),results:combat.results,total:survey.ids?.length||0}),ok,value);
        if(puerts.$unref(ok)){sl.SaveAdvancedObjectDataAndSync("CodexBossLabCombatQA",puerts.$unref(value));sl.SaveAdvancedSaveGameNow();}
    }catch(_){}
}
function inventorySummary(gear){
    const inv=gear.Inventory;
    const stats=(infos,key)=>Object.fromEntries(Object.entries(infos).sort(([a],[b])=>a.localeCompare(b)).map(([id,w])=>[id,{level:w[key],forged:!!w.AlreadySnapSoul,cycle:w.ReincarnationCount||0}]));
    return {main:Object.keys(inv.MainWeaponInfos).sort(),edges:Object.keys(inv.ShaChiWeaponInfo).sort(),mainStats:stats(inv.MainWeaponInfos,"WeaponLevel"),edgeStats:stats(inv.ShaChiWeaponInfo,"ShaChiWeaponLevel"),equipped:inv.MainWeapons,edgeSlots:inv.ShaqiWeapons,current:inv.CurrentMainWeaponID,accessories:inv.AccessoryIDs};
}
function inspectQTE(context){
    const cls=UE.Class.Find("/Game/PBZContent/UI/QTE/W_QTEBase.W_QTEBase_C");
    if(!cls)return null;
    const out=puerts.$ref(UE.NewArray(UE.UserWidget));UE.WidgetBlueprintLibrary.GetAllWidgetsOfClass(context,out,cls,false);const widgets=puerts.$unref(out);
    for(let i=0;i<widgets.Num();i++){
        const w=widgets.Get(i);if(!w.IsVisible()||w.QTE_bExited||!w.Extension)continue;
        const extension=w.Extension,methods=[];let p=Object.getPrototypeOf(extension);
        for(let depth=0;p&&depth<3;depth++,p=Object.getPrototypeOf(p))methods.push(...Object.getOwnPropertyNames(p));
        const info={widget:w.GetName(),extension:extension.GetName(),config:String(extension.ConfigRowName),finished:extension.bFinished,extensionClass:UE.KismetSystemLibrary.GetPathName(extension.GetClass()),methods:[...new Set(methods)].slice(0,200)};
        return info;
    }
    return null;
}
function killForValidation(actor){
    const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor);
    if(!asc)throw new Error("Validation: ability system unavailable");
    const cls=UE.Class.Load("/Game/PBZContent/Blueprint/Ability/GameplayEffects/GE_Kill.GE_Kill_C");
    // QA drives the terminal death path directly, including bosses whose real
    // fight requires a finisher at one HP. This never runs in the playable build.
    if(config.mode==="combat"){
        for(const path of config.healthLocks||[]){const lock=UE.Class.Find(path);if(lock)asc.RemoveActiveGameplayEffectBySourceEffect(lock,asc,-1);}
        UE.AttributeUtils.ModifyCharacterAttributeValue(actor,UE.PBZBlueprintFunctionLibrary.MakeAttribute("Health_Min",UE.BasicAttributeSet.StaticClass()),UE.EGameplayModOp.Override,0);
    }
    asc.BP_ApplyGameplayEffectToSelf(cls,1,asc.MakeEffectContext());
}
function retryTick(context,session,capture){
    if(config.mode!=="retry"||!survey.started||retry.done||retry.capturing)return;
    if(session.cinematicActive)return;
    if(++retry.ticks<600)return;
    if(retry.stage==="waiting"){
        retry.stage="checkpoint";retry.capturing=true;retry.beforeDeaths=session.deathRetries||0;
        const pack=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.PBZBackPackSubsystem.StaticClass());
        pack.ReplaceWeaponByIndex("Long",0);
        capture(context,()=>{
            retry.expected=inventorySummary(session.gear);
            combat.lastBoss=session.boss.id;combat.results=[{id:session.boss.id,retryExpected:retry.expected}];
            combatMark(context,"before-player-death");retry.capturing=false;retry.stage="respawn";retry.ticks=0;
            killForValidation(UE.GameplayStatics.GetPlayerCharacter(context,0));
        });return;
    }
    if(retry.stage==="respawn"&&(session.deathRetries||0)>retry.beforeDeaths){
        const actor=UE.GameplayStatics.GetPlayerCharacter(context,0),asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor),dead=new UE.GameplayTag();dead.TagName="CharacterState.Dead";
        if(!asc||asc.HasMatchingGameplayTag(dead))return;
        retry.capturing=true;
        capture(context,()=>{
            const p=UE.GameplayStatics.GetPlayerCharacter(context,0).K2_GetActorLocation();
            const result=combat.results[0];result.position={X:p.X,Y:p.Y,Z:p.Z};result.retryActual=inventorySummary(session.gear);result.deathRetries=session.deathRetries;result.matches=JSON.stringify(result.retryExpected)===JSON.stringify(result.retryActual);
            session.validation={retry:result};retry.done=true;retry.capturing=false;combatMark(context,"retry-complete");
        });
    }
}
function combatTick(context,session,capture,api){
    if(config.mode!=="combat"||!survey.started||combat.done)return;
    if(combat.capturing){
        if(++combat.captureTicks>900){
            combat.current.error="checkpoint interrupted by death or world transition";
            combatMark(context,"checkpoint-interrupted");combat.index++;combat.capturing=false;
            if(combat.index>=survey.ids.length){combat.done=true;return;}
            api.travel(context,2,bosses.find(b=>b.id===survey.ids[combat.index]));
        }
        return;
    }
    if(combat.lastBoss!==session.boss.id){
        combat.lastBoss=session.boss.id;combat.ticks=0;combat.stage="waiting";combat.killed={};combat.forced={};combat.qteCompleted={};combat.lastKill=0;combat.route=null;combat.completedAt=0;
        combat.current={id:session.boss.id,bell:session.boss.profile.bell,probes:[],kills:[],rewardsBefore:session.rewardsSuppressed||0,deathRetries:session.deathRetries||0};
        combat.results.push(combat.current);combatMark(context,"arrival");
    }
    combat.ticks++;
    const result=combat.current;
    if(combat.ticks%10===0)try{const qte=inspectQTE(context);if(qte)result.qte=qte;}catch(error){result.qteError=String(error);}
    if(combat.stage==="waiting"&&combat.ticks>=200){
        combat.stage="capturing";combat.capturing=true;combat.captureTicks=0;
        capture(context,()=>{
            result.before=inventorySummary(session.gear);
            const arena=session.boss.profile.arena;
            if(arena){
                const p=UE.GameplayStatics.GetPlayerCharacter(context,0).K2_GetActorLocation();
                const points=[...(session.boss.profile.entryWaypoints||[]),{X:arena.X-150,Y:arena.Y,Z:arena.Z+120}];
                combat.route={from:{X:p.X,Y:p.Y,Z:p.Z},to:points.shift(),points,step:0};
                combat.route.steps=Math.max(1,Math.ceil(Math.hypot(combat.route.to.X-p.X,combat.route.to.Y-p.Y,combat.route.to.Z-p.Z)/80));
                result.arena=arena;
            }
            combat.stage=combat.route?"approaching":"fighting";combat.capturing=false;combatMark(context,"approaching-arena");
        });return;
    }
    if(combat.stage==="approaching"){
        const route=combat.route,player=UE.GameplayStatics.GetPlayerCharacter(context,0);
        if(session.cinematicActive){route.paused=true;if(combat.ticks%180===0){result.cinematicWait={ticks:combat.ticks,source:session.cinemaSource};combatMark(context,"waiting-native-introduction");}return;}
        if(route.paused){const p=player.K2_GetActorLocation();route.from={X:p.X,Y:p.Y,Z:p.Z};route.step=0;route.steps=Math.max(1,Math.ceil(Math.hypot(route.to.X-p.X,route.to.Y-p.Y,route.to.Z-p.Z)/80));route.paused=false;}
        const t=Math.min(1,++route.step/route.steps),hit=puerts.$ref(new UE.HitResult());
        player.K2_SetActorLocation(new UE.Vector(route.from.X+(route.to.X-route.from.X)*t,route.from.Y+(route.to.Y-route.from.Y)*t,route.from.Z+(route.to.Z-route.from.Z)*t),false,hit,true);
        if(t===1){
            if(route.points.length){const p=player.K2_GetActorLocation();route.from={X:p.X,Y:p.Y,Z:p.Z};route.to=route.points.shift();route.step=0;route.steps=Math.max(1,Math.ceil(Math.hypot(route.to.X-p.X,route.to.Y-p.Y,route.to.Z-p.Z)/80));}
            else{combat.stage="fighting";combatMark(context,"at-arena");}
        }return;
    }
    if(combat.stage!=="fighting")return;
    if(combat.ticks%60===0){
        result.preparation={...session.ux,attempts:session.trialPrepareAttempts||0};
        if(combat.ticks===600)result.environment=environmentProbe(context,session.boss);
        const actors=probe(context,session.boss),p=UE.GameplayStatics.GetPlayerCharacter(context,0).K2_GetActorLocation();result.probes.push({ticks:combat.ticks,actors,player:{X:p.X,Y:p.Y,Z:p.Z},engaged:{...session.engaged},cinematic:!!session.cinematicActive,cinemaSource:session.cinemaSource});
        if(result.probes.length>30)result.probes.shift();
        for(const {actor,name,path}of selectedActors(context,session.boss)){
            const status=actors.find(a=>a.name===name);
            const primary=session.boss.classes.some(p=>p.toLowerCase()===path.toLowerCase());
            if(!status||status.hidden||session.cinematicActive||(primary&&!require("./battle").hasObserved(name)))continue;
            if(status&&!status.dead&&!session.engaged?.[name]&&!combat.forced[name]&&combat.ticks>=500){
                const controller=UE.AIBlueprintHelperLibrary.GetAIController(actor);
                if(controller){
                    const library=puerts.blueprint.tojs(UE.Class.Load("/HuaShira/Animation/Seqs/BP_PBZSequenceFunctionLibrary.BP_PBZSequenceFunctionLibrary_C"));
                    library.StartAI(actor,true,context);combat.forced[name]=true;
                    (result.forcedEngagements??=[]).push({name,path,ticks:combat.ticks});
                }
                else if(!primary&&session.boss.profile.nativeController){
                    combat.forced[name]=true;(result.forcedEngagements??=[]).push({name,path,ticks:combat.ticks,source:"native-controller-group-member"});
                }
            }
            if(status&&!status.dead&&(session.engaged?.[name]||combat.forced[name])&&(!combat.killed[name]||combat.ticks-combat.killed[name]>=150)){
                combat.killed[name]=combat.ticks;result.kills.push({name,path,ticks:combat.ticks});
                killForValidation(actor);
            }
        }
        if(combat.ticks%180===0&&!session.completed)combatMark(context,"fighting");
    }
    if(session.completed){if(!combat.completedAt)combat.completedAt=combat.ticks;}
    const timeoutTicks=["BP_Monster_MuXiaoKui","BP_Monster_ZuoShang_Ending"].includes(session.boss.id)?7200:2700;
    if((session.completed&&session.ux?.resultShown&&combat.ticks-combat.completedAt>=240)||combat.ticks>=timeoutTicks){
        result.completed=!!session.completed;result.victory=session.victory||null;result.rewardsAfter=session.rewardsSuppressed||0;
        result.resultMenuShown=!!session.ux?.resultShown;
        result.engaged={...session.engaged};
        result.retryCount=(session.deathRetries||0)-result.deathRetries;
        combat.stage="capturing";combat.capturing=true;combat.captureTicks=0;
        session.validation={combat:{index:combat.index,results:combat.results}};
        capture(context,()=>{
            result.after=inventorySummary(session.gear);result.loadoutUnchanged=JSON.stringify(result.before)===JSON.stringify(result.after);combatMark(context,"checkpoint-complete");
            combat.index++;combat.completedAt=0;combat.capturing=false;
            if(combat.index>=survey.ids.length){combat.done=true;return;}
            setTimeout(()=>api.travel(context,2,bosses.find(b=>b.id===survey.ids[combat.index])),1500);
        });
    }
}
function tick(context,controller,session,capture,api){
    if(!enabled || !session.active)return;
    if(config.mode==="training"&&session.boss.training&&session.ux?.preparationClosed&&session.inanisInteraction&&!session.inanisQaRequested){
        session.inanisQaTicks=(session.inanisQaTicks||0)+1;
        if(session.inanisQaTicks===90){
            const actor=session.inanisInteraction,player=UE.GameplayStatics.GetPlayerCharacter(context,0),component=UE.PBZInteractComponent.GetInteractComponent(player);
            ui(context,"inanis-native-probe",session,{valid:actor.IsValidInteract(player),outsideValid:actor.IsValidInteractOutOverlap(player),interactType:actor.GetInteractType(),actorClass:UE.KismetSystemLibrary.GetPathName(actor.GetClass()),componentMethods:Object.getOwnPropertyNames(UE.PBZInteractComponent.prototype),currentActor:component.CurrentInteractActor?.GetName(),expectedActor:actor.GetName(),distances:[component.DistanceA,component.DistanceB,component.DistanceC],interactText:{namespace:actor.InteractText.Namespace,key:actor.InteractText.Key,value:UE.KismetTextLibrary.Conv_TextToString(actor.InteractText.ValueCache)}});
        }
        if(session.inanisQaTicks===180){
            session.inanisQaRequested=true;
            ui(context,"inanis-native-dispatch",session);
            UE.PBZInteractComponent.GetInteractComponent(UE.GameplayStatics.GetPlayerCharacter(context,0)).StartInteract();
        }
    }
    if(config.mode==="training-flow"){trainingFlowTick(context,session,capture,api);return;}
    if(["combat","arrival","direct","system-flow","review","ux"].includes(config.mode)){
        const player=UE.GameplayStatics.GetPlayerCharacter(context,0),name=player&&player.GetName();
        if(name&&combat.protectedPlayer!==name){
            UE.AttributeUtils.ModifyCharacterAttributeValue(player,UE.PBZBlueprintFunctionLibrary.MakeAttribute("Health_Min",UE.BasicAttributeSet.StaticClass()),UE.EGameplayModOp.Override,1);
            combat.protectedPlayer=name;
        }
    }
    if(automated&&!session.completed&&(session.arrivalAnchorPending||(config.mode==="survey"&&session.cinematicActive))){
        if(arrivalWait.boss!==session.boss.id){arrivalWait.boss=session.boss.id;arrivalWait.ticks=0;}
        if(++arrivalWait.ticks>=3600&&["survey","combat"].includes(config.mode)){
            const result={id:session.boss.id,bell:session.boss.profile.bell,error:"native introduction did not release the preparation point",expectedLevel:session.boss.balance.weaponLevel};
            const series=config.mode==="combat"?combat:survey;
            series.results.push(result);series.index++;series.lastBoss=session.boss.id;
            if(config.mode==="combat")combatMark(context,"preparation-timeout");else mark(context,"preparation-timeout");
            arrivalWait.ticks=0;
            if(series.index>=survey.ids.length){series.done=true;api.showMenu(context);return;}
            api.travel(context,2,bosses.find(b=>b.id===survey.ids[series.index]));
        }
        return;
    }
    arrivalWait.ticks=0;
    if(["system-flow","review","ux"].includes(config.mode)){
        if(session.boss.training)return;
        cinemaExitTrace(context,session);
        const pawn=UE.GameplayStatics.GetPlayerCharacter(context,0)?.GetName();
        if(session.cinematicActive||!session.ux.directIntroObserved){systemFlowTicks=0;return;}
        if(pawn!==systemFlowPawn&&++systemFlowTicks>=240){systemFlowPawn=pawn;api.prepareEquipment(context);ui(context,'system-flow-inventory',session);}
        return;
    }
    if(config.mode==="direct"){directTick(context,session,capture,api);return;}
    if(config.mode==="arrival")return;
    surveyTick(context,session,capture,api);
    if(config.mode==="survey")return;
    combatTick(context,session,capture,api);
    if(config.mode==="combat")return;
    retryTick(context,session,capture);
    if(config.mode==="retry")return;
    for(const key of ["F7","F9","F10","F11","F12"]){
        const down=controller.IsInputKeyDown(new UE.Key(key));
        if(down&&!held[key]){
            session.validation=session.validation||{};
            session.validation.actors=probe(context,session.boss);
            if(key==="F9")capture(context,()=>{
                killForValidation(UE.GameplayStatics.GetPlayerCharacter(context,0));
            });
            else if(key==="F7"){
                const arena=session.boss.profile.arena;
                if(arena){const player=UE.GameplayStatics.GetPlayerCharacter(context,0),hit=puerts.$ref(new UE.HitResult());player.K2_SetActorLocation(new UE.Vector(arena.X-400,arena.Y,arena.Z+120),false,hit,true);}
            }
            else if(key==="F11"){
                for(const path of session.boss.classes){
                    const ref=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,UE.Class.Load(path),ref);const actors=puerts.$unref(ref);
                    for(let i=0;i<actors.Num();i++)killForValidation(actors.Get(i));
                }
                setTimeout(()=>capture(context),1500);
            }
            else if(key==="F12")api.showMenu(context,"victory");
            else capture(context);
        }
        held[key]=down;
    }
}
function directMark(context,phase){
    const sl=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZSaveLoadSubsystem.StaticClass());
    const ok=puerts.$ref(false),value=puerts.$ref(new UE.JsonObjectWrapper());
    UE.JSONUtility.ParseStringToJson(JSON.stringify({phase,time:Date.now(),results:direct.results,index:direct.index,total:survey.ids?.length||0,done:direct.done}),ok,value);
    if(puerts.$unref(ok)){sl.SaveAdvancedObjectDataAndSync("CodexBossLabDirectQA",puerts.$unref(value));sl.SaveAdvancedSaveGameNow();}
}
function directTick(context,session,capture,api){
    if(direct.done||direct.capturing)return;
    if(direct.lastBoss!==session.boss.id){direct.lastBoss=session.boss.id;direct.ticks=0;direct.result={id:session.boss.id,probes:[]};direct.results.push(direct.result);}
    const result=direct.result;direct.ticks++;
    if(direct.ticks%60!==0)return;
    const actors=probe(context,session.boss),pawn=UE.GameplayStatics.GetPlayerCharacter(context,0),player=pawn.K2_GetActorLocation();
    const health=UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter(pawn,UE.PBZBlueprintFunctionLibrary.MakeAttribute("Health",UE.BasicAttributeSet.StaticClass()));
    if(!session.cinematicActive){
        result.highestPlayerHealth=Math.max(result.highestPlayerHealth||health,health);
        result.playerDamaged=!!result.playerDamaged||health<result.highestPlayerHealth-1;
        result.bossDamaged=!!result.bossDamaged||actors.some(a=>!a.hidden&&!a.dead&&a.health<a.healthMax-1);
    }
    result.probes.push({tick:direct.ticks,cinematic:!!session.cinematicActive,engaged:{...session.engaged},actors,player:{X:player.X,Y:player.Y,Z:player.Z,health}});
    // QA recovery keeps the view readable after a real hit; damage evidence is
    // recorded above before restoring health. Never active in the manual build.
    if(!session.cinematicActive){
        const maximum=UE.PBZBlueprintFunctionLibrary.GetAttributeFromCharacter(pawn,UE.PBZBlueprintFunctionLibrary.MakeAttribute("Health_Max",UE.BasicAttributeSet.StaticClass()));
        if(health<maximum*0.25)UE.AttributeUtils.ModifyCharacterAttributeValue(pawn,UE.PBZBlueprintFunctionLibrary.MakeAttribute("Health",UE.BasicAttributeSet.StaticClass()),UE.EGameplayModOp.Override,maximum);
        // A protected QA pawn can survive throws outside the arena. Bring it
        // back for the next real weapon hit; never change the opponent's HP.
        const opponent=selectedActors(context,session.boss).find(x=>!x.actor.bHidden)?.actor;
        if(result.playerDamaged&&opponent){
            const at=opponent.K2_GetActorLocation();
            if(Math.hypot(at.X-player.X,at.Y-player.Y,at.Z-player.Z)>1500){
                const forward=opponent.GetActorForwardVector(),target=new UE.Vector(at.X-forward.X*240,at.Y-forward.Y*240,at.Z+70),hit=puerts.$ref(new UE.HitResult());
                pawn.K2_SetActorLocation(target,false,hit,true);
                UE.GameplayStatics.GetPlayerController(context,0).SetControlRotation(new UE.Rotator(0,Math.atan2(at.Y-target.Y,at.X-target.X)*180/Math.PI,0));
                result.qaPositionRecoveries=(result.qaPositionRecoveries||0)+1;
            }
        }
    }
    if(UE.SGameAIWorldSubsystem){
        const system=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.SGameAIWorldSubsystem.StaticClass()),id=session.boss.profile.nativeSpawnerID||session.boss.profile.primarySpawnerID;
        const spawner=id&&system?.GetSpawner(id),pawn=spawner?.GetPawn();
        result.nativeSpawner={id,found:!!spawner,pawn:pawn?.GetName(),class:pawn&&UE.KismetSystemLibrary.GetPathName(pawn.GetClass()),position:pawn?.K2_GetActorLocation()};
    }
    result.ux={...session.ux};directMark(context,"observing-native-entry");
    const ready=!session.cinematicActive&&direct.ticks>=360&&result.playerDamaged&&result.bossDamaged&&actors.some(a=>!a.hidden&&!a.dead&&(a.inCombat||Object.keys(session.engaged||{}).length)&&Math.hypot(a.position.X-player.X,a.position.Y-player.Y,a.position.Z-player.Z)<4000);
    const limit=18000;
    if(!ready&&direct.ticks<limit)return;
    result.nativeFightReady=ready;result.introObserved=!!session.ux.directIntroObserved;result.preparationOpened=!!session.preparationShown;
    direct.capturing=true;
    capture(context,()=>{
        result.gear=inventorySummary(session.gear);direct.index++;direct.capturing=false;
        direct.done=direct.index>=survey.ids.length;directMark(context,direct.done?"direct-series-complete":"direct-entry-complete");
        if(direct.done){api.showMenu(context);return;}
        setTimeout(()=>api.travel(context,2,bosses.find(b=>b.id===survey.ids[direct.index]),false),1000);
    });
}
function trainingFlowTick(context,session,capture,api){
    if(trainingFlow.done||trainingFlow.capturing)return;
    if(session.boss.training&&session.ux.preparationClosed&&trainingFlow.phase==="waiting"){
        trainingFlow.before=inventorySummary(session.gear);trainingFlow.phase="travel";trainingFlow.ticks=0;
        api.replay(context,2,bosses.find(b=>b.id==="BP_Monster_MobMan_Elite_Sword"),false);return;
    }
    if(session.boss.training||!["travel","retry"].includes(trainingFlow.phase)||session.arrivalAnchorPending||session.cinematicActive)return;
    if(trainingFlow.phase==="retry"){
        if((session.deathRetries||0)<=trainingFlow.beforeDeaths)return;
        const player=UE.GameplayStatics.GetPlayerCharacter(context,0),asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(player),tag=new UE.GameplayTag();tag.TagName="CharacterState.Dead";
        if(!asc||asc.HasMatchingGameplayTag(tag))return;
    }
    if(++trainingFlow.ticks<120)return;
    trainingFlow.capturing=true;
    capture(context,()=>{
        const after=inventorySummary(session.gear),before=trainingFlow.before;
        if(trainingFlow.phase==="retry"){
            const result=trainingFlow.result,position=UE.GameplayStatics.GetPlayerCharacter(context,0).K2_GetActorLocation();
            result.retry=after;result.retryEquipmentPreserved=JSON.stringify(result.after)===JSON.stringify(after);result.deathRetries=session.deathRetries;result.retryPosition={X:position.X,Y:position.Y,Z:position.Z};
            trainingFlow.done=true;trainingFlow.capturing=false;trainingFlowMark(context,result);api.showMenu(context);return;
        }
        const result={before,after,choiceApplied:before.equipped[0]==="Long",equipmentPreserved:JSON.stringify(before.equipped)===JSON.stringify(after.equipped)&&JSON.stringify(before.edgeSlots)===JSON.stringify(after.edgeSlots),beforeLevel:before.mainStats.Long.level,afterLevel:after.mainStats.Long.level,expectedLevel:session.boss.balance.weaponLevel,forgePreserved:before.mainStats.Long.forged===after.mainStats.Long.forged};
        trainingFlow.result=result;trainingFlow.beforeDeaths=session.deathRetries||0;trainingFlow.phase="retry";trainingFlow.ticks=0;trainingFlow.capturing=false;
        trainingFlowMark(context,result);killForValidation(UE.GameplayStatics.GetPlayerCharacter(context,0));
    });
}
function trainingFlowMark(context,result){
    const sl=UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context,UE.PBZSaveLoadSubsystem.StaticClass()),ok=puerts.$ref(false),value=puerts.$ref(new UE.JsonObjectWrapper());
    UE.JSONUtility.ParseStringToJson(JSON.stringify(result),ok,value);
    if(puerts.$unref(ok)){sl.SaveAdvancedObjectDataAndSync("CodexBossLabTrainingFlowQA",puerts.$unref(value));sl.SaveAdvancedSaveGameNow();}
}
exports.tick=tick;
exports.enabled=enabled;
exports.automated=automated;
exports.mode=config.mode;
exports.ui=ui;
exports.focusSelector=widget=>{
    if(!["ux","flow","review","training"].includes(config.mode)||!config.ids.length||!widget?.codexBossItems||widget.codexScreen==="victory")return;
    const item=widget.codexBossItems.find(item=>item.codexBossEntry?.id===config.ids[0]);
    if(item){widget.CommonListView_89.BP_SetSelectedItem(item);widget.CommonListView_89.BP_ScrollItemIntoView(item);}
    if(item&&["flow","review","training"].includes(config.mode))setTimeout(()=>{if(UE.KismetSystemLibrary.IsValid(widget)&&widget.IsActivated())widget.codexSelectBoss(item.codexBossEntry,widget);},3000);
};
exports.menu=menu;
exports.mark=mark;
