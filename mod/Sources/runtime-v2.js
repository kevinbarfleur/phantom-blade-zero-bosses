"use strict";
const UE = require("ue"), puerts = require("puerts"), cpp = require("cpp");
const snapshot = require("./snapshot"), model = require("./model"), arsenal = require("./arsenal");
const selector = require("./selector");
const validation = require("./validation");
const battle = require("./battle"), hold = require("./hold");
const gearReader = require("./gear");
const cinema=require("./cinema");
const training=require("./training"),arrival=require("./arrival");
const inanis=require("./inanis");
const arena=require("./arena");
const runs=require("./run-driver");
const entryWatchdog=require('./entry-watchdog');
const entryProtection=require('./entry-protection');
let pending = null, busy = false, activeDialog = null;
let difficultyFlow = null;
let menuPause = null;
let queuedDeath = false;
let keyTimer = null, keyHeld = false, worldContext = null, worldGeneration = 0;
const session = { active: false, initialized: false, gear: null, difficulty: UE.EDifficultMode.Normal, report: "", arsenal: null };
session.boss = selector.bosses.find(b=>b.id==="BP_Monster_ZuoShang_Ending");
if(snapshot.CodexBossLabPreparedArsenal){session.initialized=true;session.arsenal=snapshot.CodexBossLabPreparedArsenal;}
const difficulties = [UE.EDifficultMode.Easy, UE.EDifficultMode.Normal, UE.EDifficultMode.Hard];
const text = value => cpp.FText.FromString(value);
const ignoreOldSelection=()=>false;
const log = message => console.log("[CodexBossLab] " + message);
function valid(object) { try { return !!object && UE.KismetSystemLibrary.IsValid(object); } catch (_) { return false; } }
function saveLoadFor(context) { return UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context, UE.PBZSaveLoadSubsystem.StaticClass()); }
function slotFor(difficulty) { return difficulty === UE.EDifficultMode.NightMare ? "NightmareRun0" : "ManualSave3"; }
function fail(context, message) {
    session.pendingRunOptions=null;
    delete session.pendingAutoNext;
    if(hold.endLaunch)hold.endLaunch(session,true);
    if (pending && pending.timer) clearTimeout(pending.timer);
    if (pending && pending.retryTimer) clearTimeout(pending.retryTimer);
    pending = null; busy = false; log("ERROR " + message);
    if(validation.ui)validation.ui(context,"operation-error",session,{message});
    const recovery=recoverFailedChallenge(context,message);
    if(recovery==='retry')return;
    if(recovery==='exhausted')message="Returning to Training failed after three attempts. The challenge is over. Press F8 and choose TRAINING to try again.\n\n"+message;
    try {
        if (!valid(context)) return;
        const action = UE.AsyncAction_ShowConfirmation.ShowConfirmationOk(context, text("BOSSES"), text(message));
        action.Activate();
    } catch (error) { log(String(error)); }
}
function requestFor(instance, kind) {
    const request = { instance, kind, applied: false, timer: null,retryTimer:null,attempts:0 }; pending = request;
    request.timer = setTimeout(() => {
        if (pending === request) fail(instance, "The game did not finish saving. No new fight was loaded. Press F8 to try again.");
    }, 20000);
    return request;
}
function finishRequest(request) {
    if (!request || pending !== request || request.applied) return false;
    request.applied = true; clearTimeout(request.timer);if(request.retryTimer)clearTimeout(request.retryTimer);pending = null; return true;
}
function replaceWhenReady(saveLoad,param,json,request,callback){
    const submit=()=>{
        if(pending!==request||request.applied)return;
        request.attempts++;
        let result;
        try{result=saveLoad.ReplaceSaveString(param,puerts.toDelegate(request.instance,callback),json);}
        catch(error){fail(request.instance,"Save interrupted: "+String(error));return;}
        session.lastWrite={kind:request.kind,attempts:request.attempts,result:result?.ResultType};
        // The native save master can reject a simultaneous advanced/slot write
        // without a completion delegate. Re-submit the same immutable checkpoint;
        // request tokens still guarantee one load if callbacks arrive late.
        if(pending===request&&!request.applied)request.retryTimer=setTimeout(submit,result?.ResultType===UE.ESaveLoadResultType.Success?2000:500);
    };
    submit();
}
function closeMenus(instance,done){
    if(!UE.PBZBlueprintFunctionLibrary?.GetUILayOut){done();return;}
    let count=0;
    const step=()=>{
        const layout=UE.PBZBlueprintFunctionLibrary.GetUILayOut(instance);
        for(const tag of ["UI.Layer.Menu","UI.Layer.GameSystem"]){
            const layer=layout&&layout.Layers.Get(gameplayTag(tag)),widget=layer&&layer.GetActiveWidget();
            if(valid(widget)){
                if(++count>24){fail(instance,"The menu could not close.");return;}
                widget.DeactivateWidget();setTimeout(step,0);return;
            }
        }
        UE.WidgetBlueprintLibrary.SetFocusToGameViewport();done();
    };
    step();
}
function writeEncounter(context, difficulty, boss = session.boss, prepare = true, skipIntroduction = false) {
    try {
        const instance = UE.GameplayStatics.GetGameInstance(context), saveLoad = saveLoadFor(instance), slot = slotFor(difficulty);
        if (!valid(instance) || !saveLoad) throw new Error("Save interface unavailable");
        busy = true;
        const pristine = model.bossSnapshot(snapshot, boss,{direct:!boss.training});
        const root = model.encounterSave(pristine, session.gear, difficulty, session.initialized, difficulty === UE.EDifficultMode.NightMare, boss.balance);
        const request = requestFor(instance, "encounter"), param = new UE.SaveGameParam();
        param.SaveSlotName = slot; param.bShowSaveTip = false;
        replaceWhenReady(saveLoad,param,JSON.stringify(root),request,(slotName, _json, _index, success) => {
            if (slotName !== slot || !finishRequest(request)) return;
            if (!success) return fail(instance, "The fight starting point could not be saved.");
            if(session.run?.phase==='failed'&&!boss.training&&!session.pendingRunOptions){busy=false;return;}
            try {
                closeMenus(instance,()=>{
                try {
                // Native menu deactivation yields. A final QTE hit may exhaust
                // the run after the save callback's earlier terminal check.
                if(session.run?.phase==='failed'&&!boss.training&&!session.pendingRunOptions){busy=false;return;}
                entryProtection.stop('encounter-change');
                const resultRef = puerts.$ref(new UE.LoadGameResultParam()); instance.LoadGame(slot, resultRef);
                const result = puerts.$unref(resultRef);
                if (!result || result.ResultType !== UE.ESaveLoadResultType.Success || String(result.LevelName) !== pristine.PBZGameSystem.CurrentLevelName) throw new Error("The starting point was not recognized");
                session.active = true; session.difficulty = difficulty; session.boss = boss; session.completed = false;session.completionToken=null;session.victory=null;
                runs.enter(session,boss,session.pendingRunOptions);session.runOptions=session.run?.options||session.runOptions;session.pendingRunOptions=null;session.runFailureShown=false;session.runRuntimeError=null;
                session.entryProtectionExpired=false;
                if(boss.training&&session.runFailureReturn&&session.runFailureReturn.run===session.run){session.runFailureReturn.inFlight=false;session.runFailureReturn.returned=true;}
                if(session.pendingAutoNext!==undefined)session.autoNext=session.pendingAutoNext;
                delete session.pendingAutoNext;
                session.prepareOnArrival=!!boss.training&&!session.runFailureReturn;
                session.mode=boss.training?"training":"direct-fight";
                session.skipIntroduction=skipIntroduction;
                session.introPresentation=null;
                delete session.ux?.introPresentationReleased;
                delete session.ux?.introAdditionalLoadingHidden;
                delete session.ux?.introAdditionalLoadingReleased;
                delete session.ux?.introAdditionalLoadingTimer;
                delete session.ux?.controls;
                delete session.ux?.controlExercise;
                delete session.ux?.introRevealReady;
                delete session.ux?.arrivalAdditionalLoadingReleased;
                delete session.ux?.arrivalAdditionalLoadingTimer;
                session.cinematicActive=false;session.cinemaSource=null;
                session.trainingInteractionsDisabled=false;
                session.trainingTicks=0;
                session.trainingTipShown=false;session.inanisInteraction=null;session.inanisSpawnRequested=0;
                session.arrivalAnchorPending=true;
                session.preparationShown=false;
                session.trialReady=false;session.nativeSpawnerReady=false;session.entranceFlowPrepared=false;session.entranceSignalSent=false;session.entranceSignalInstances=[];session.entranceQuestSignals=null;session.entranceOwner=null;session.entryBoundaryPending=false;session.entryWatch=null;session.trialPrepareAttempts=0;session.layersPrepared=false;session.layersRestoredAfterArrival=false;
                session.ux={...session.ux,nativeTrialPrepared:false,nativeLayersPrepared:false,preparationPaused:false,preparationClosed:false,resultShown:false,prepareRequested:!!boss.training,automatedQA:validation.automated};
                for(const key of Object.keys(session.ux))if(key.startsWith('entryProtection')||key==='entryAIHeld'||key==='entryAIResumed')delete session.ux[key];
                delete session.ux.trialPreparationError;delete session.ux.layerPreparationError;delete session.ux.nativeEncounterPrepared;delete session.ux.nativeSpawnerFound;
                for(const key of ["introExitBlackSuppressed","introExitBlackDuration","introExitSequence","systemLabActionsReady","systemLabActionsVisible","directReady","directPlacement","directIntroObserved","directKind","nativeArrivalLoaded","nativeEntryCrossed","arrivalEvents","introPreparationTimedOut","introPreparationCancelled","arenaBellsSuppressed","directCombatStarted","inanisVisible","inanisInteractionReady","inanisSelections","trainingExitBlocked","trainingHiddenActors","trainingDisabledActors","trainingHiddenEffects","trainingBoundaryReturns"])delete session.ux[key];
                for(const key of ['nativeEntranceSignalInstances','entranceInstanceDispatchLimit','nativeEntranceSignalPin','nativeEntranceFlowExisting','nativeEntranceFlowInitialized','nativeEntranceTriggered','entranceGateKey','entranceFlowError','layersRestoredAfterArrival','entryFailure','entryFacing','entryFacingObserved','nativeEntryPoseCommitted','nativeEntryPoseCommitError','nativeEntryFacingObserved','nativeEntryFacingInitial','nativeEntryFacingAfterMs','observedIntroduction','entryClearance','arrivalAISuppressed','arrivalAIHeld'])delete session.ux[key];
                battle.install(session,victory);
                instance.SetLoadingScreen("PBZ_WP"); busy = false;
                log("Loading " + boss.id + "; difficulty=" + difficulty);
                // LoadGame above validates the saved destination. Only now,
                // at the committed travel boundary, retire old-world JS
                // ownership before OpenLevel runs its native garbage pass.
                stopKeys();releaseWorldReferences();
                UE.GameplayStatics.OpenLevel(instance, String(result.LevelName), true, String(result.GameModeOptions || ""));
                }catch(error){fail(instance,String(error));}
                });
            } catch (error) { fail(instance, String(error)); }
        });
        return true;
    } catch (error) { fail(context, "Loading interrupted: " + String(error)); return false; }
}
// Capture the current backpack and persist a pristine encounter checkpoint.
function captureCheckpoint(context, then) {
    if (busy) return false;
    try {
        const instance = UE.GameplayStatics.GetGameInstance(context), saveLoad = saveLoadFor(instance);
        busy = true;
        const request = requestFor(instance, "equipment"), param = new UE.SaveGameParam();
        const metadata = {version:"0.6-prototype", encounter:session.boss.id, initialized:session.initialized, difficulty:session.difficulty, balance:session.boss.balance, arsenal:session.arsenal, nativeDifficulties:difficulties, deathRetries:session.deathRetries||0, validation:session.validation||null,ux:{...session.ux,preparationShown:!!session.preparationShown,arrivalAnchored:!session.arrivalAnchorPending,cinematicsSkipped:session.cinematicsSkipped||0},rewardsSuppressed:session.rewardsSuppressed||0,completed:!!session.completed,hooks:battle.status?battle.status():session.hooks||null};
        metadata.run=session.run||null;
        param.SaveSlotName = slotFor(session.difficulty); param.bShowSaveTip = false;
        session.gear=model.captureGear(gearReader.capture(context,saveLoad,param));
        const pristine=model.bossSnapshot(snapshot,session.boss,{direct:!session.boss.training});
        const root=model.encounterSave(pristine,session.gear,session.difficulty,true,false,session.boss.balance);
        root.CodexBossLabSession=metadata;
        replaceWhenReady(saveLoad,param,JSON.stringify(root),request,(_slot, _json, _index, success) => {
            if(_slot!==param.SaveSlotName)return;
            if (!finishRequest(request)) return;
            if (!success) return fail(instance, "Your equipment could not be saved. The fight was not reset.");
            try {
                busy = false;
                log("Loadout checkpoint captured");
                const died=queuedDeath;queuedDeath=false;
                if (died && session.run?.phase!=='failed') { writeEncounter(instance, session.difficulty,session.boss,false,true); }
                else if (then) then(instance);
            } catch (error) { fail(instance, "Equipment not saved: " + String(error)); }
        });
        return true;
    } catch (error) { fail(context, String(error)); return false; }
}
function replay(context, difficulty = session.difficulty, boss = session.boss, prepare = true, skipIntroduction = false) {
    if (busy || !difficulties.includes(difficulty)) return false;
    // A failed challenge is terminal. Only a deliberate new configuration may
    // start another one; stale retry/next callbacks cannot reset its budget.
    if(session.run?.phase==='failed'&&!boss.training&&!session.pendingRunOptions)return false;
    if (session.active && valid(worldContext)&&valid(UE.GameplayStatics.GetPlayerCharacter(worldContext,0))) return captureCheckpoint(worldContext, instance => writeEncounter(instance, difficulty, boss,prepare,skipIntroduction));
    return writeEncounter(context, difficulty, boss,prepare,skipIntroduction);
}
function gameplayTag(name) { const tag = new UE.GameplayTag(); tag.TagName = name; return tag; }
function openTraining(context){
    const live=valid(worldContext)&&valid(UE.GameplayStatics.GetPlayerCharacter(worldContext,0))?worldContext:null;
    if(session.active&&session.boss.training&&live){prepareEquipment(live);return true;}
    return replay(context,session.difficulty,training.destination,false);
}
function finishFailedChallenge(context,nativeDeath=false){
    if(!session.active||session.boss.training||session.run?.phase!=='failed')return;
    session.autoNext=false;queuedDeath=false;
    if(session.completionToken)session.completionToken.cancelled=true;
    let state=session.runFailureReturn;
    if(!state||state.run!==session.run){
        const boss=session.boss,helper=require('../Library/UIHelper').default;
        let name=boss.label||boss.id;
        try{name=require('./boss-label').resolve(boss,key=>UE.KismetTextLibrary.Conv_TextToString(helper.GetTextByID(key)));}catch(_){}
        state=session.runFailureReturn={run:session.run,generation:worldGeneration,boss:boss.id,name:name+(boss.variant?' · '+boss.variant:''),firstSeen:Date.now(),queued:false,requested:false,noticeShown:false,returnAttempts:0};
    }
    if(state.requested||state.queued||state.error)return;
    // Prefer the actual native death screen. The Dead tag is only a backstop
    // if that screen's activation callback never arrives; never travel alive.
    if(!nativeDeath){
        const player=UE.GameplayStatics.GetPlayerCharacter(context,0),asc=valid(player)&&UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(player);
        if(!asc?.HasMatchingGameplayTag(gameplayTag('CharacterState.Dead'))){state.deadSince=null;return;}
        if(state.deadSince==null)state.deadSince=Date.now();
        if(Date.now()-state.deadSince<3000)return;
    }
    state.queued=true;let attempts=0;
    const back=()=>{
        if(session.run!==state.run||!session.active||session.boss.training||worldGeneration!==state.generation)return;
        const live=valid(worldContext)?worldContext:context;
        if(!busy&&valid(live)){
            state.queued=false;state.requested=true;state.inFlight=true;state.returnAttempts++;
            // Claim this attempt before calling into the save subsystem: it
            // may report a synchronous error as well as an async failure.
            if(openTraining(live))return;
            if(state.inFlight)fail(live,"Returning to Training could not begin.");
            return;
        }
        if(++attempts<120)setTimeout(back,250);
        else{state.queued=false;state.error=true;fail(live,"Returning to Training failed. Choose TRAINING to leave the completed challenge.");}
    };
    setTimeout(back,250);
}
function recoverFailedChallenge(context,message){
    const state=session.runFailureReturn;
    if(!state?.inFlight||state.run!==session.run||!session.active||session.boss.training||session.run?.phase!=='failed')return null;
    state.inFlight=false;state.requested=false;state.queued=false;state.lastError=message;
    if(state.returnAttempts>=3){state.error=true;return 'exhausted';}
    // Retry only this terminal run, after its failed save request has been
    // cancelled. A later new run/world invalidates the scheduled recovery.
    state.queued=true;
    setTimeout(()=>{
        if(session.run!==state.run||!session.active||session.boss.training||worldGeneration!==state.generation)return;
        state.queued=false;finishFailedChallenge(valid(worldContext)?worldContext:context,true);
    },750);
    return 'retry';
}
function showFailedChallengeNotice(context){
    const result=session.runFailureReturn;
    if(!result||result.noticeShown||session.run!==result.run||!session.boss.training||!session.worldLoadingComplete||session.arrivalAnchorPending||busy||activeDialog)return;
    const message='Challenge over · 66 hits taken.\nFight reached: '+result.name+'\nFights won: '+result.run.splits.length+'\n\n'+runs.summary(session)+'\n\nBack at Inanis’ refuge. Prepare for another attempt.';
    const action=UE.AsyncAction_ShowConfirmation.ShowConfirmationOk(context,text('66 HITS · CHALLENGE OVER'),text(message));
    action.Activate();result.noticeShown=true;session.lastRunResult={boss:result.boss,name:result.name,hits:result.run.hits,totalMs:result.run.totalMs,completed:result.run.splits.length,result:'66hits'};
    session.ux={...session.ux,runFailureReturned:true,runFailureNoticeShown:true};
    if(validation.ui)validation.ui(context,'challenge-ended-in-training',session,{result:session.lastRunResult});
}
function pauseMenu(context,widget){
    // CommonUI deactivates the selector when it pushes difficulty, then
    // reactivates it on Back. Those screens share one pause lifetime.
    if(!menuPause||menuPause.generation!==worldGeneration)menuPause={generation:worldGeneration,context:valid(worldContext)?worldContext:context,pausedBefore:UE.GameplayStatics.IsGamePaused(context),records:[]};
    const group=menuPause;
    if(group.records.some(record=>record.widget===widget))return UE.GameplayStatics.IsGamePaused(context);
    const record={widget,active:true};
    const activate=()=>{record.active=true;if(menuPause===group&&valid(group.context))UE.GameplayStatics.SetGamePaused(group.context,true);};
    const close=()=>{
        record.active=false;
        setTimeout(()=>{
            if(menuPause!==group||group.generation!==worldGeneration||!valid(group.context))return;
            const open=group.records.some(r=>valid(r.widget)&&(r.active||r.widget.IsActivated?.()));
            if(open||difficultyFlow){UE.GameplayStatics.SetGamePaused(group.context,true);return;}
            UE.GameplayStatics.SetGamePaused(group.context,group.pausedBefore);
            clearMenuPause();
        },0);
    };
    record.activate=activate;record.close=close;group.records.push(record);
    widget.BP_OnWidgetActivated?.Add(activate);widget.BP_OnWidgetDeactivated.Add(close);
    activate();
    return UE.GameplayStatics.IsGamePaused(context);
}
function clearMenuPause(){
    if(!menuPause)return;
    for(const r of menuPause.records)if(valid(r.widget)){r.widget.BP_OnWidgetActivated?.Remove(r.activate);r.widget.BP_OnWidgetDeactivated.Remove(r.close);}
    menuPause=null;
}
function prepareEquipment(context){
    try{
        const player=UE.GameplayStatics.GetPlayerCharacter(context,0);
        if(!valid(player))return openTraining(context);
        const controller=UE.GameplayStatics.GetPlayerController(context,0);
        const path=UE.KismetSystemLibrary.MakeSoftClassPath("/Game/PBZContent/UI/UINew/System/W_Systembase.W_Systembase_C");
        const klass=UE.KismetSystemLibrary.Conv_SoftClassPathToSoftClassRef(path);
        const action=UE.AsyncAction_PushContentToLayerForPlayer.PushContentToLayerForPlayer(controller,klass,gameplayTag("UI.Layer.GameSystem"),false);
        activeDialog=action;
        action.BeforePush.Add(widget=>{
            if(!valid(widget))return;
            if(valid(player))player.BeforePushSystemV1(widget,false);
        });
        action.AfterPush.Add(widget=>{
            activeDialog=null;if(!valid(widget)){if(validation.ui)validation.ui(context,"preparation-error",session,{error:"Native system screen was not created"});return;}
            session.preparationShown=true;
            const generation=worldGeneration;
            // This is the same activatable system host used by RenewalPlayer.
            // Its bPauseGameWhenOpen owns pause and restores input on close.
            session.ux={...session.ux,preparationPaused:UE.GameplayStatics.IsGamePaused(context)};
            if(validation.ui)validation.ui(context,"preparation-opened",session);
            const close=()=>{
                widget.BP_OnWidgetDeactivated.Remove(close);
                session.ux.preparationClosed=true;
                if(validation.ui)validation.ui(context,"preparation-closed",session,{paused:UE.GameplayStatics.IsGamePaused(context)});
                if(!busy&&generation===worldGeneration&&valid(worldContext))captureCheckpoint(worldContext);
            };
            widget.BP_OnWidgetDeactivated.Add(close);
            if(["ux","flow","training-flow","training"].includes(validation.mode)){
                if(validation.mode==="training-flow")setTimeout(()=>{
                    if(generation!==worldGeneration||!valid(context))return;
                    const pack=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.PBZBackPackSubsystem.StaticClass());
                    pack.ReplaceWeaponByIndex("Long",0);
                    session.ux.trainingQaChoice=String(pack.MainWeapons.Get(0));
                },2000);
                setTimeout(()=>{if(generation===worldGeneration&&valid(context))captureCheckpoint(context);},4000);
                setTimeout(()=>{if(generation===worldGeneration&&valid(widget))widget.DeactivateWidget();},12000);
            }
        });action.Activate();
    }catch(error){activeDialog=null;log("Preparation: "+String(error));if(validation.ui)validation.ui(context,"preparation-error",session,{error:String(error)});}
}
function chooseDifficulty(context, boss = session.boss) {
    if (busy || activeDialog || !valid(context)) return false;
    try {
        const controller = UE.GameplayStatics.GetPlayerController(context, 0), instance = UE.GameplayStatics.GetGameInstance(context);
        const path = UE.KismetSystemLibrary.MakeSoftClassPath("/Game/PBZContent/UI/Menu/StartMenu/WB_DifficultySelect_V2.WB_DifficultySelect_V2_C");
        const klass = UE.KismetSystemLibrary.Conv_SoftClassPathToSoftClassRef(path);
        const action = UE.AsyncAction_PushContentToLayerForPlayer.PushContentToLayerForPlayer(controller, klass, gameplayTag("UI.Layer.Menu"), false);
        activeDialog = action;
        const flow = {}; difficultyFlow = flow;
        const hideCampaignMode = widget => {
            if (!widget) return;
            widget.bHideEasyDifficulty = false; widget.DefaultFocusDifficulty = session.difficulty;
            if (widget.Nightmare) { widget.Nightmare.SetVisibility(UE.ESlateVisibility.Collapsed); widget.Nightmare.SetIsEnabled(false); }
        };
        action.BeforePush.Add(hideCampaignMode);
        action.AfterPush.Add(widget => {
            if (!widget) { activeDialog = null; return; }
            hideCampaignMode(widget);
            let selected = null, ended = false;
            const onSelect = difficulty => {
                if(ended||selected!==null||!difficulties.includes(difficulty))return;
                selected=widget.codexHits66?UE.EDifficultMode.Hard:difficulty;
                session.pendingAutoNext=!!widget.codexAutoNext;
                session.pendingRunOptions={timer:widget.codexTimerMode||"off",hits66:!!widget.codexHits66};
                try{
                    hold.beginLaunch(widget,session);
                    if(!replay(instance,selected,boss))fail(instance,"The fight could not begin loading. Try again from Boss Select.");
                }catch(error){fail(instance,"Transition interrupted: "+String(error));}
            };
            const onEnd = () => {
                if (ended) return; ended = true; activeDialog = null;
                if (difficultyFlow === flow) difficultyFlow = null;
                try { widget["Change Difficult Delegate"].Remove(onSelect); widget.BP_OnWidgetDeactivated.Remove(onEnd); } catch (_) {}
            };
            widget["Change Difficult Delegate"].Add(onSelect); widget.BP_OnWidgetDeactivated.Add(onEnd);
            if(session.active&&valid(widget))pauseMenu(context,widget);
            if(validation.ui)validation.ui(context,"difficulty-opened",session,{paused:UE.GameplayStatics.IsGamePaused(context)});
            try { hold.configure(widget,session,boss); }
            catch(error) { log("Hold UI: "+String(error));session.ux={error:String(error)};widget.DeactivateWidget();fail(instance,"The fight confirmation could not open. Try again from Boss Select."); }
        });
        action.Activate(); return true;
    } catch (error) { activeDialog = null; difficultyFlow = null; fail(context, "Difficulty selection unavailable: " + String(error)); return false; }
}
function showMenu(context, screen = "bosses") {
    if (busy || activeDialog || !valid(context)) return false;
    if(screen==="bosses"){
        if(session.completionToken)session.completionToken.cancelled=true;
    }
    try {
        const controller=UE.GameplayStatics.GetPlayerController(context,0);
        const path=UE.KismetSystemLibrary.MakeSoftClassPath("/Game/PBZContent/UI/InGame/SaveLoad/WB_LoadGame.WB_LoadGame_C");
        const klass=UE.KismetSystemLibrary.Conv_SoftClassPathToSoftClassRef(path);
        const action=UE.AsyncAction_PushContentToLayerForPlayer.PushContentToLayerForPlayer(controller,klass,gameplayTag("UI.Layer.Menu"),false);
        activeDialog = action;
        action.BeforePush.Add(widget=>{
            widget.codexBossSelector=true;
            widget.codexScreen=screen;
            widget.codexCurrentBoss=session.boss;
            widget.codexInTraining=!!session.boss.training;
            widget.codexAutoNext=!!session.autoNext;
            widget.codexRunSummary=runs.summary(session);
            widget.codexSelectBoss=(boss,owner)=>{
                if(boss.action){
                    if(boss.action==="auto") {session.autoNext=!session.autoNext;owner.codexAutoNext=!!session.autoNext;selector.refreshActions(owner);return;}
                    owner.codexActionChosen=true;
                    owner.DeactivateWidget();
                    setTimeout(()=>{
                        if(boss.action==="replay")replay(context,session.difficulty,session.boss,false,true);
                        if(boss.action==="restart-run"){
                            const first=selector.bosses.find(b=>b.id===session.run?.firstBoss)||session.boss;
                            session.pendingRunOptions={...session.run.options};replay(context,session.difficulty,first,false,true);
                        }
                        if(boss.action==="next"){const next=nextBoss();if(next)replay(context,session.difficulty,next);}
                        if(boss.action==="select")showMenu(context);
                        if(boss.action==="training")openTraining(context);
                        if(boss.action==="main")captureCheckpoint(context,()=>{session.active=false;runs.stop();require("../Library/TsHelper").default.returnStart(context);});
                    },0);return;
                }
                if(!boss.profile)return fail(owner,"The starting point for this fight is not ready yet.");
                chooseDifficulty(owner,boss);
            };
        });
        action.AfterPush.Add(widget=>{
            activeDialog=null;
            session.selectorWidget=widget;
            if(session.active&&valid(widget))pauseMenu(context,widget);
            if(screen!=="victory"&&validation.ui)validation.ui(context,"boss-menu",session,{paused:UE.GameplayStatics.IsGamePaused(context)});
            if(["victory","failure","entry-error"].includes(screen)&&valid(widget)){
                session.ux={...session.ux,resultShown:true};
                if(validation.ui)validation.ui(context,"victory-menu",session);
                const generation=worldGeneration;
                const back=()=>{widget.BP_OnWidgetDeactivated.Remove(back);if(widget.codexActionChosen)return;setTimeout(()=>{if(generation===worldGeneration&&session.active&&!busy&&valid(context))showMenu(context,session.run?.phase==='failed'?'failure':'bosses');},0);};
                widget.BP_OnWidgetDeactivated.Add(back);
            }
            if(validation.focusSelector)validation.focusSelector(widget);
            if(validation.enabled)setTimeout(()=>{
                if(valid(widget)&&widget.IsActivated()&&validation.ui)validation.ui(widget,"selector-layout",session,{layout:selector.inspect(widget)});
            },1700);
        });
        action.Activate();return true;
    } catch (error) { activeDialog = null; fail(context, String(error)); return false; }
}
function nextBoss(){return selector.bosses[selector.bosses.findIndex(b=>b.id===session.boss.id)+1]||null;}
function victory(context,record){
    if(!session.active||session.completed||session.run?.phase==='failed')return;
    const boss=session.boss;
    // Multi-phase codex rows are ordered by the native fight, with the terminal
    // phase last. A first-phase kill must never open the results screen.
    const authoritative=boss.unlockTag&&boss.unlockTag!=="None";
    const alternative=boss.id==="BP_Monster_MBoss";
    if(!authoritative&&!alternative&&boss.classes.length>1 && String(record.path).toLowerCase()!==boss.classes[boss.classes.length-1].toLowerCase())return;
    runs.victory(context,session);session.completed=true;session.victory=record;
    const token={cancelled:false,retries:0};session.completionToken=token;
    scheduleCompletion(context,token,4500);
}
function scheduleCompletion(context,token,delay){
    const generation=worldGeneration;
    const finish=()=>{
        if(generation!==worldGeneration||session.completionToken!==token||token.cancelled||!valid(context))return;
        if(busy||activeDialog||session.cinematicActive||session.runInteractiveActive||(cinema.presentationActive&&cinema.presentationActive(context))){token.retries++;setTimeout(finish,250);return;}
        runs.finishVictory(session,!!nextBoss());
        if(session.autoNext&&nextBoss())replay(context,session.difficulty,nextBoss());
        else showMenu(context,"victory");
    };
    setTimeout(finish,delay);
}
function stopKeys() {
    if(validation.stop)validation.stop();
    entryProtection.stop();
    runs.stop();
    arrival.release(session);
    clearMenuPause();
    if(session.loadingScreenListener){
        const {instance,handler}=session.loadingScreenListener;
        if(valid(instance))instance.OnEndLoadingScreen.Remove(handler);
        session.loadingScreenListener=null;
    }
    worldGeneration++; if (keyTimer !== null) clearInterval(keyTimer);
    keyTimer = null; worldContext = null; keyHeld = false;
}
function releaseWorldReferences(){
    if(entryProtection.forgetWorldReferences)entryProtection.forgetWorldReferences('committed-world-exit');
    if(arrival.dispose)arrival.dispose(session);
    if(battle.stop)battle.stop();
    // The loading handoff already owns presentation. Forget old wrappers;
    // do not fade, deactivate or otherwise finish native loading here.
    const widget=session.selectorWidget;
    try{if(valid(widget))widget.codexSelectBoss=ignoreOldSelection;}catch(_){}
    session.selectorWidget=null;session.introPresentation=null;
    session.launchUI=null;session.inanisInteraction=null;session.entranceOwner=null;
    activeDialog=null;difficultyFlow=null;
}
function beginKeys(context) {
    stopKeys(); worldContext = context;
    session.entryProtectionExpired=false;
    if(session.active)runs.install(context,session);
    if(hold.endLaunch)hold.endLaunch(session);
    const diagnosticContext=UE.GameplayStatics.GetGameInstance(context);
    if(session.active)try{battle.install(session,victory);session.hooks=battle.status?battle.status():{};}catch(error){session.hooks={error:String(error)};log("Battle hooks: "+String(error));}
    const generation = worldGeneration, key = new UE.Key("F8"); let ticks = 0, arrivalTicks=0, stableTicks=0, preparing = false,lastPosition=null;
    if(session.active){
        session.worldLoadingComplete=false;
        const handler=()=>{
            if(generation!==worldGeneration)return;
            session.worldLoadingComplete=true;
            if(validation.ui)validation.ui(diagnosticContext,"loading-ended",session);
        };
        diagnosticContext.OnEndLoadingScreen.Add(handler);
        session.loadingScreenListener={instance:diagnosticContext,handler};
        arrival.begin(context,session);
    }
    keyTimer = setInterval(() => {
        try {
            if (generation !== worldGeneration || !valid(context)) { if(validation.ui)validation.ui(diagnosticContext,"input-context-ended",session,{generation,currentGeneration:worldGeneration,contextValid:valid(context)});stopKeys(); return; }
            const player = UE.GameplayStatics.GetPlayerCharacter(context, 0);
            if(session.active&&valid(player)){
                arrivalTicks++;
                if(arrivalTicks%5===0)arena.tick(context,session);
                if(arrivalTicks%10===0&&battle.prepareEncounter)battle.prepareEncounter(context,session);
                if(arrivalTicks%15===0&&battle.poll)battle.poll(context,session);
                if(arrivalTicks%10===0){session.cinematicActive=cinema.tick(context,session);if(session.cinematicActive&&!session.boss.training)session.ux.directIntroObserved=true;}
                if(arrivalTicks%5===0)battle.holdDirectCombat(context,session);
                arrival.tick(context,session);
                if(cinema.releaseArrivalLoading)cinema.releaseArrivalLoading(context,session);
                training.tick(context,session);
                entryProtection.tick(context,session);
                if(arrivalTicks%15===0&&battle.activateDirectCombat&&!cinema.entryLoadingActive(context,session))battle.activateDirectCombat(context,session);
                if(!session.runRuntimeError)try{runs.tick(context,session);}catch(error){session.runRuntimeError=String(error);session.autoNext=false;fail(context,"Timer / 66 HITS unavailable: "+String(error));}
                if(session.run?.phase==='failed'){finishFailedChallenge(context);showFailedChallengeNotice(context);}
                if(arrivalTicks%15===0&&!session.boss.training&&session.boss.profile.directEntry){
                    const tag=gameplayTag('CharacterState.InCombat'),asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(player);
                    if(entryWatchdog.tick(session,Date.now(),{loaded:session.worldLoadingComplete&&(session.directArrival?.released||session.directArrival?.streamingReady),cinematic:session.cinematicActive||cinema.pending(context),paused:UE.GameplayStatics.IsGamePaused(context),menu:busy||!!activeDialog||session.selectorWidget?.IsActivated?.(),combat:session.directArrival?.released&&(Object.keys(session.engaged||{}).length>0||asc?.HasMatchingGameplayTag(tag)||session.runInteractiveActive)})){
                        session.autoNext=false;arrival.release(session);session.ux.entryFailure=true;
                        if(validation.ui)validation.ui(context,'entry-timeout',session);
                        showMenu(context,'entry-error');
                    }
                }
                if(session.boss.training&&!session.arrivalAnchorPending&&!session.trainingTipShown){
                    session.trainingTipShown=true;
                    const helper=require("../Library/UIHelper").default;
                    if(typeof helper.showTipsText==="function")helper.showTipsText(context,text("TRAINING · LV. 30\nInventory · Equipment    Inanis · Fights"));
                }
                if(validation.enabled&&arrivalTicks%180===0)validation.ui(diagnosticContext,"input-heartbeat",session,{ticks:arrivalTicks,paused:UE.GameplayStatics.IsGamePaused(context),busy,activeDialog:!!activeDialog});
                if(session.arrivalAnchorPending&&!busy){
                    const p=player.K2_GetActorLocation(),position={X:p.X,Y:p.Y,Z:p.Z};
                    const moving=lastPosition&&Math.hypot(position.X-lastPosition.X,position.Y-lastPosition.Y,position.Z-lastPosition.Z)>3;
                    lastPosition=position;
                    stableTicks=session.cinematicActive||moving?0:stableTicks+1;
                    if(arrivalTicks%90===0&&validation.ui)validation.ui(context,"arrival-wait",session,{ticks:arrivalTicks,stableTicks});
                    const engaged=Object.keys(session.engaged||{}).length>0;
                    if(arrivalTicks>=90&&!session.cinematicActive&&(stableTicks>=45||(engaged&&stableTicks>=3))){
                        const anchor=session.boss.profile.transform||snapshot.PBZGameSystem.PlayerTransform,at=anchor.Location;
                        if(Math.hypot(position.X-at.X,position.Y-at.Y,position.Z-at.Z)>150){
                            const hit=puerts.$ref(new UE.HitResult());player.K2_SetActorLocation(new UE.Vector(at.X,at.Y,at.Z),false,hit,true);
                        }
                        session.arrivalAnchorPending=false;
                        if(validation.ui)validation.ui(context,"arrival-anchored",session,{stableTicks});
                    }
                }
                // The native equipment host pauses the world. Opening it while
                // MoviePlayer is still finishing the map can stall loading.
                if(session.prepareOnArrival&&!validation.automated&&!session.arrivalAnchorPending&&session.worldLoadingComplete){
                    session.prepareOnArrival=false;prepareEquipment(context);
                }
            }
            if (session.active && !session.initialized && !preparing && valid(player) && ++ticks >= 45) {
                preparing = true;
                try {
                    const counts = arsenal.initialize(context); session.initialized = true; session.arsenal = counts;
                    session.report = counts.weapons + " weapons · " + counts.edges + " phantom edges · " + counts.accessories + " accessories · " + counts.medicines + " medicines";
                    captureCheckpoint(context);
                } catch (error) { fail(context, "Arsenal: " + String(error)); }
            }
            const controller = UE.GameplayStatics.GetPlayerController(context, 0);
            if (!valid(controller)) return;
            const down = controller.IsInputKeyDown(key); if (down && !keyHeld) showMenu(context); keyHeld = down;
            if(!busy)validation.tick(context,controller,session,captureCheckpoint,{replay,showMenu,victory,travel:writeEncounter,openTraining,prepareEquipment});
        } catch (error) {
            log("Input: " + String(error));
            if(validation.ui)validation.ui(diagnosticContext,"runtime-error",session,{error:String(error),stack:error?.stack});
            session.autoNext=false;
            if(arrival.abort)arrival.abort(session);
            stopKeys();
            // A native wrapper invalidated by streaming must not leave the
            // player behind a cover with no functioning selection shortcut.
            if(session.active&&valid(context)){
                session.ux={...session.ux,entryFailure:true};
                try{showMenu(context,'entry-error');}catch(recovery){log('Recovery menu: '+String(recovery));}
            }
        }
    }, 33);
    // Some native victories return from an instanced arena to the campaign map.
    // Carry the result across that world change, using the new live context.
    if(session.active&&session.completed&&session.completionToken&&!session.completionToken.cancelled)scheduleCompletion(context,session.completionToken,700);
}
function wrap(proto, name, after) {
    const original = proto[name]; if (typeof original !== "function") throw new Error("Missing game method " + name);
    proto[name] = function (...args) { const result = original.apply(this, args); after.apply(this, args); return result; };
}
function labelMenu(menu) {
    if (menu.ContinueGame) menu.ContinueGame.SetButtonText(text("BOSSES"));
    for (const name of ["NewGame", "BonusCollection"]) if (menu[name]) menu[name].SetVisibility(UE.ESlateVisibility.Collapsed);
    if(menu.LoadGame)menu.LoadGame.SetVisibility(UE.ESlateVisibility.Collapsed);
    if (menu.Version) menu.Version.SetText(text("BOSSES"+(globalThis.__CodexBossesLoader?.version?" "+globalThis.__CodexBossesLoader.version:"")));
}
function patchStartMenu(Type) {
    const p = Type.prototype, bind = p.bindButtonClicked;
    p.bindButtonClicked = function (name, handler) { if (name === "ContinueGame"||name==="LoadGame") handler = () => openTraining(this); return bind.call(this, name, handler); };
    for (const method of ["InitText", "BP_OnActivated", "CheckTag", "UpdateVersionText"]) wrap(p, method, function () { labelMenu(this); });
    wrap(p,"BP_OnActivated",function(){if(validation.menu)validation.menu(this,session,{replay,showMenu});});
    wrap(p,"BP_OnActivated",function(){if(["training","training-flow","settings-probe"].includes(validation.mode)&&!session.trainingAutoStarted){session.trainingAutoStarted=true;setTimeout(()=>openTraining(this),2500);}});
}
function patchGameMode(Type) {
    const p = Type.prototype;
    const achievements=p.startAchievementProgression;
    if(typeof achievements==="function")p.startAchievementProgression=function(...args){if(!session.active)return achievements.apply(this,args);};
    wrap(p, "bindSaveTipExtension", function () { beginKeys(this); });
    const end = p.ReceiveEndPlay;
    p.ReceiveEndPlay = function (...args) { if(worldContext===this){stopKeys();releaseWorldReferences();}return end.apply(this, args); };
}
function patchDeathMenu(Type) {
    const p = Type.prototype, activate = p.BP_OnActivated, tick = p.Tick, destruct = p.Destruct;
    p.BP_OnActivated = function (...args) {
        if (!session.active) return activate.apply(this, args);
        this.codexLabDeath = true; this.isAlreadyReSpawn = true;
        runs.death(this,session);
        if(session.run?.phase==='failed'){
            finishFailedChallenge(valid(worldContext)?worldContext:this,true);
            return;
        }
        session.deathRetries=(session.deathRetries||0)+1;
        log("Death: restoring encounter and retaining loadout");
        if (busy) { if (pending && pending.kind === "equipment") queuedDeath = true; }
        else replay(this, session.difficulty,session.boss,false,true);
    };
    p.Tick = function (...args) { if (!this.codexLabDeath) return tick.apply(this, args); };
    p.Destruct = function (...args) { if (!this.codexLabDeath) return destruct.apply(this, args); };
}
function patchEquipment(Type) {
    wrap(Type.prototype, "Destruct", function () { if (session.active && session.initialized && !busy && valid(worldContext)) captureCheckpoint(worldContext); });
}
function patchBell(Type){
    wrap(Type.prototype,"BP_OnActivated",function(){
        if(!session.active)return;
        const button=this.TeleportBtn;
        button.SetVisibility(UE.ESlateVisibility.Visible);button.SetButtonText(text("BOSSES"));
        this.TeleportBtn_BrokenBell.SetVisibility(UE.ESlateVisibility.Collapsed);
        button.OnButtonBaseClicked.Clear();
        button.OnButtonBaseClicked.Add(()=>showMenu(this));
        for(const id of ["ItemUpgradeButton","ShopButton","AbilityCultivation","ManualSave"])if(this[id])this[id].SetVisibility(UE.ESlateVisibility.Collapsed);
        if(this.JhsyButton){
            this.JhsyButton.SetVisibility(UE.ESlateVisibility.Visible);this.JhsyButton.SetButtonText(text(session.boss.training?"EQUIPMENT":"TRAINING"));
            this.JhsyButton.OnButtonBaseClicked.Clear();this.JhsyButton.OnButtonBaseClicked.Add(()=>{this.DeactivateWidget();setTimeout(()=>openTraining(this),0);});
        }
    });
}
function patchConfirmation(Type) {
    // Remove only the prologue question opened by our difficulty selector.
    // Other confirmations, including settings and quitting, retain their native behavior.
    wrap(Type.prototype, "OnDialogSetup", function (descriptor) {
        this.codexSkipPrologue = false;
        if (!difficultyFlow) return;
        try {
            const helper = require("../Library/UIHelper").default;
            const expected = UE.KismetTextLibrary.Conv_TextToString(helper.GetTextByID("UI_SelectDifficutly_14"));
            this.codexSkipPrologue = !!expected && UE.KismetTextLibrary.Conv_TextToString(descriptor.Body) === expected;
        } catch (_) {}
    });
    wrap(Type.prototype, "BP_OnActivated", function () {
        if (!this.codexSkipPrologue) return;
        this.SetRenderOpacity(0);
        setTimeout(() => { if (valid(this) && this.codexSkipPrologue) this.CloseWindowByConfirmation(); }, 0);
    });
}
exports.patchStartMenu = patchStartMenu; exports.patchGameMode = patchGameMode;
exports.patchDeathMenu = patchDeathMenu; exports.patchEquipment = patchEquipment;
exports.patchConfirmation = patchConfirmation;
exports.patchSelector=selector.patchSelector; exports.patchEntry=selector.patchEntry;
exports.patchRecorder=battle.patchRecorder;
exports.patchLoot=battle.patchLoot;
exports.patchPickup=battle.patchPickup;
exports.patchSettlement=battle.patchSettlement;
exports.patchBell=patchBell;
exports.showMenu = showMenu; exports.chooseDifficulty = chooseDifficulty;
exports.replay = replay; exports.captureCheckpoint = captureCheckpoint; exports.stop = stopKeys;
inanis.configure(()=>session,context=>showMenu(valid(worldContext)?worldContext:context));
exports.isActive=()=>session.active;
exports.patchTeleport=Type=>training.patchTeleport(Type,()=>session.active&&!!session.boss.training,context=>showMenu(context));
exports.patchSettings=Type=>require("./system-menu").patch(Type,()=>session,{replay,openTraining,fail});
exports.openTraining=openTraining;
