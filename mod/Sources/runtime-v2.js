"use strict";
const UE = require("ue"), puerts = require("puerts"), cpp = require("cpp");
const snapshot = require("./snapshot"), model = require("./model"), arsenal = require("./arsenal");
const selector = require("./selector");
const validation = require("./validation");
const battle = require("./battle"), hold = require("./hold");
const gearReader = require("./gear");
const cinema=require("./cinema");
let pending = null, busy = false, activeDialog = null;
let difficultyFlow = null;
let queuedDeath = false;
let keyTimer = null, keyHeld = false, worldContext = null, worldGeneration = 0;
const session = { active: false, initialized: false, gear: null, difficulty: UE.EDifficultMode.Normal, report: "", arsenal: null };
session.boss = selector.bosses.find(b=>b.id==="BP_Monster_ZuoShang_Ending");
if(snapshot.CodexBossLabPreparedArsenal){session.initialized=true;session.arsenal=snapshot.CodexBossLabPreparedArsenal;}
const difficulties = [UE.EDifficultMode.Easy, UE.EDifficultMode.Normal, UE.EDifficultMode.Hard];
const text = value => cpp.FText.FromString(value);
const log = message => console.log("[CodexBossLab] " + message);
function valid(object) { try { return !!object && UE.KismetSystemLibrary.IsValid(object); } catch (_) { return false; } }
function saveLoadFor(context) { return UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem(context, UE.PBZSaveLoadSubsystem.StaticClass()); }
function slotFor(difficulty) { return difficulty === UE.EDifficultMode.NightMare ? "NightmareRun0" : "ManualSave3"; }
function fail(context, message) {
    if (pending && pending.timer) clearTimeout(pending.timer);
    if (pending && pending.retryTimer) clearTimeout(pending.retryTimer);
    pending = null; busy = false; log("ERROR " + message);
    if(validation.ui)validation.ui(context,"operation-error",session,{message});
    try {
        if (!valid(context)) return;
        const action = UE.AsyncAction_ShowConfirmation.ShowConfirmationOk(context, text("BOSSES"), text(message));
        action.Activate();
    } catch (error) { log(String(error)); }
}
function requestFor(instance, kind) {
    const request = { instance, kind, applied: false, timer: null,retryTimer:null,attempts:0 }; pending = request;
    request.timer = setTimeout(() => {
        if (pending === request) fail(instance, "Le jeu n'a pas terminé la sauvegarde. Aucun nouveau combat n'a été chargé. Réessaie avec F8.");
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
        catch(error){fail(request.instance,"Écriture interrompue : "+String(error));return;}
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
                if(++count>24){fail(instance,"La fermeture du menu n'a pas abouti.");return;}
                widget.DeactivateWidget();setTimeout(step,0);return;
            }
        }
        UE.WidgetBlueprintLibrary.SetFocusToGameViewport();done();
    };
    step();
}
function writeEncounter(context, difficulty, boss = session.boss, prepare = true) {
    try {
        const instance = UE.GameplayStatics.GetGameInstance(context), saveLoad = saveLoadFor(instance), slot = slotFor(difficulty);
        if (!valid(instance) || !saveLoad) throw new Error("Interface de sauvegarde indisponible");
        busy = true;
        const pristine = model.bossSnapshot(snapshot, boss);
        const root = model.encounterSave(pristine, session.gear, difficulty, session.initialized, difficulty === UE.EDifficultMode.NightMare, boss.balance);
        const request = requestFor(instance, "encounter"), param = new UE.SaveGameParam();
        param.SaveSlotName = slot; param.bShowSaveTip = false;
        replaceWhenReady(saveLoad,param,JSON.stringify(root),request,(slotName, _json, _index, success) => {
            if (slotName !== slot || !finishRequest(request)) return;
            if (!success) return fail(instance, "Le point de départ du combat n'a pas pu être écrit.");
            try {
                closeMenus(instance,()=>{
                try {
                const resultRef = puerts.$ref(new UE.LoadGameResultParam()); instance.LoadGame(slot, resultRef);
                const result = puerts.$unref(resultRef);
                if (!result || result.ResultType !== UE.ESaveLoadResultType.Success || String(result.LevelName) !== pristine.PBZGameSystem.CurrentLevelName) throw new Error("Le point de départ n'a pas été reconnu");
                session.active = true; session.difficulty = difficulty; session.boss = boss; session.completed = false;session.completionToken=null;session.victory=null;
                session.prepareOnArrival=prepare;
                session.arrivalAnchorPending=true;
                session.preparationShown=false;
                session.trialReady=false;session.nativeSpawnerReady=false;session.trialPrepareAttempts=0;session.layersPrepared=false;
                session.ux={...session.ux,nativeTrialPrepared:false,nativeLayersPrepared:false,preparationPaused:false,preparationClosed:false,resultShown:false,prepareRequested:prepare,automatedQA:validation.automated};
                delete session.ux.trialPreparationError;delete session.ux.layerPreparationError;delete session.ux.nativeEncounterPrepared;delete session.ux.nativeSpawnerFound;
                battle.install(session,victory);
                instance.SetLoadingScreen("PBZ_WP"); busy = false;
                log("Loading " + boss.id + "; difficulty=" + difficulty);
                UE.GameplayStatics.OpenLevel(instance, String(result.LevelName), true, String(result.GameModeOptions || ""));
                }catch(error){fail(instance,String(error));}
                });
            } catch (error) { fail(instance, String(error)); }
        });
        return true;
    } catch (error) { fail(context, "Chargement interrompu : " + String(error)); return false; }
}
// Capture the current backpack and persist a pristine encounter checkpoint.
function captureCheckpoint(context, then) {
    if (busy) return false;
    try {
        const instance = UE.GameplayStatics.GetGameInstance(context), saveLoad = saveLoadFor(instance);
        busy = true;
        const request = requestFor(instance, "equipment"), param = new UE.SaveGameParam();
        const metadata = {version:"0.5", encounter:session.boss.id, initialized:session.initialized, difficulty:session.difficulty, balance:session.boss.balance, arsenal:session.arsenal, nativeDifficulties:difficulties, deathRetries:session.deathRetries||0, validation:session.validation||null,ux:{...session.ux,preparationShown:!!session.preparationShown,arrivalAnchored:!session.arrivalAnchorPending,cinematicsSkipped:session.cinematicsSkipped||0},rewardsSuppressed:session.rewardsSuppressed||0,completed:!!session.completed,hooks:battle.status?battle.status():session.hooks||null};
        param.SaveSlotName = slotFor(session.difficulty); param.bShowSaveTip = false;
        session.gear=model.captureGear(gearReader.capture(context,saveLoad,param));
        const pristine=model.bossSnapshot(snapshot,session.boss);
        const root=model.encounterSave(pristine,session.gear,session.difficulty,true,false,session.boss.balance);
        root.CodexBossLabSession=metadata;
        replaceWhenReady(saveLoad,param,JSON.stringify(root),request,(_slot, _json, _index, success) => {
            if(_slot!==param.SaveSlotName)return;
            if (!finishRequest(request)) return;
            if (!success) return fail(instance, "Ton équipement n'a pas pu être mémorisé. Le combat n'a pas été réinitialisé.");
            try {
                busy = false;
                log("Loadout checkpoint captured");
                if (queuedDeath) { queuedDeath = false; writeEncounter(instance, session.difficulty,session.boss,false); }
                else if (then) then(instance);
            } catch (error) { fail(instance, "Équipement non enregistré : " + String(error)); }
        });
        return true;
    } catch (error) { fail(context, String(error)); return false; }
}
function replay(context, difficulty = session.difficulty, boss = session.boss, prepare = true) {
    if (busy || !difficulties.includes(difficulty)) return false;
    if (session.active && valid(worldContext)) return captureCheckpoint(context, instance => writeEncounter(instance, difficulty, boss,prepare));
    return writeEncounter(context, difficulty, boss,prepare);
}
function gameplayTag(name) { const tag = new UE.GameplayTag(); tag.TagName = name; return tag; }
function pauseMenu(context,widget){
    const pausedBefore=UE.GameplayStatics.IsGamePaused(context),generation=worldGeneration;
    if(!pausedBefore)UE.GameplayStatics.SetGamePaused(context,true);
    const close=()=>{
        widget.BP_OnWidgetDeactivated.Remove(close);
        if(!pausedBefore&&generation===worldGeneration&&valid(worldContext))UE.GameplayStatics.SetGamePaused(worldContext,false);
    };
    widget.BP_OnWidgetDeactivated.Add(close);
    return UE.GameplayStatics.IsGamePaused(context);
}
function prepareEquipment(context){
    try{
        const controller=UE.GameplayStatics.GetPlayerController(context,0);
        const path=UE.KismetSystemLibrary.MakeSoftClassPath("/Game/PBZContent/UI/UINew/System/W_Systembase.W_Systembase_C");
        const klass=UE.KismetSystemLibrary.Conv_SoftClassPathToSoftClassRef(path);
        const action=UE.AsyncAction_PushContentToLayerForPlayer.PushContentToLayerForPlayer(controller,klass,gameplayTag("UI.Layer.GameSystem"),false);
        activeDialog=action;
        action.BeforePush.Add(widget=>{if(valid(widget))UE.GameplayStatics.GetPlayerCharacter(context,0).BeforePushSystemV1(widget,false);});
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
            if(["ux","flow"].includes(validation.mode)){
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
            const onSelect = difficulty => { if (difficulties.includes(difficulty)) selected = difficulty; };
            const onEnd = () => {
                if (ended) return; ended = true; activeDialog = null;
                if (difficultyFlow === flow) difficultyFlow = null;
                try { widget["Change Difficult Delegate"].Remove(onSelect); widget.BP_OnWidgetDeactivated.Remove(onEnd); } catch (_) {}
                if (selected !== null) setTimeout(() => replay(instance, selected, boss), 0);
            };
            widget["Change Difficult Delegate"].Add(onSelect); widget.BP_OnWidgetDeactivated.Add(onEnd);
            try { hold.configure(widget,session,boss); }
            catch(error) { log("Hold UI: "+String(error));session.ux={error:String(error)};widget.DeactivateWidget();fail(instance,"La confirmation du combat n'a pas pu s'ouvrir. Réessaie depuis la sélection."); }
        });
        action.Activate(); return true;
    } catch (error) { activeDialog = null; difficultyFlow = null; fail(context, "Choix de difficulté indisponible : " + String(error)); return false; }
}
function showMenu(context, screen = "bosses") {
    if (busy || activeDialog || !valid(context)) return false;
    if(screen==="bosses"){
        if(session.completionToken)session.completionToken.cancelled=true;
        session.autoNext=false;
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
            widget.codexAutoNext=!!session.autoNext;
            widget.codexSelectBoss=(boss,owner)=>{
                if(boss.action){
                    if(boss.action==="auto") {session.autoNext=!session.autoNext;owner.codexAutoNext=!!session.autoNext;selector.refreshActions(owner);return;}
                    owner.codexActionChosen=true;
                    owner.DeactivateWidget();
                    setTimeout(()=>{
                        if(boss.action==="replay")replay(context);
                        if(boss.action==="next"){const next=nextBoss();if(next)replay(context,session.difficulty,next);}
                        if(boss.action==="select")showMenu(context);
                        if(boss.action==="main")captureCheckpoint(context,()=>{session.active=false;require("../Library/TsHelper").default.returnStart(context);});
                    },0);return;
                }
                if(!boss.profile)return fail(owner,"Le point de départ de ce combat est encore en préparation.");
                chooseDifficulty(owner,boss);
            };
        });
        action.AfterPush.Add(widget=>{
            activeDialog=null;
            if(session.active&&valid(widget))pauseMenu(context,widget);
            if(screen!=="victory"&&validation.ui)validation.ui(context,"boss-menu",session,{paused:UE.GameplayStatics.IsGamePaused(context)});
            if(screen==="victory"&&valid(widget)){
                session.ux={...session.ux,resultShown:true};
                if(validation.ui)validation.ui(context,"victory-menu",session);
                const generation=worldGeneration;
                const back=()=>{widget.BP_OnWidgetDeactivated.Remove(back);if(widget.codexActionChosen)return;setTimeout(()=>{if(generation===worldGeneration&&session.active&&!busy&&valid(context))showMenu(context);},0);};
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
    if(!session.active||session.completed)return;
    const boss=session.boss;
    // Multi-phase codex rows are ordered by the native fight, with the terminal
    // phase last. A first-phase kill must never open the results screen.
    const authoritative=boss.unlockTag&&boss.unlockTag!=="None";
    const alternative=boss.id==="BP_Monster_MBoss";
    if(!authoritative&&!alternative&&boss.classes.length>1 && String(record.path).toLowerCase()!==boss.classes[boss.classes.length-1].toLowerCase())return;
    session.completed=true;session.victory=record;
    const token={cancelled:false,retries:0};session.completionToken=token;
    scheduleCompletion(context,token,4500);
}
function scheduleCompletion(context,token,delay){
    const generation=worldGeneration;
    const finish=()=>{
        if(generation!==worldGeneration||session.completionToken!==token||token.cancelled||!valid(context))return;
        if(busy||activeDialog||session.cinematicActive||(cinema.presentationActive&&cinema.presentationActive(context))){token.retries++;setTimeout(finish,250);return;}
        if(session.autoNext&&nextBoss())replay(context,session.difficulty,nextBoss());
        else showMenu(context,"victory");
    };
    setTimeout(finish,delay);
}
function stopKeys() {
    worldGeneration++; if (keyTimer !== null) clearInterval(keyTimer);
    keyTimer = null; worldContext = null; keyHeld = false;
}
function beginKeys(context) {
    stopKeys(); worldContext = context;
    const diagnosticContext=UE.GameplayStatics.GetGameInstance(context);
    if(session.active)try{battle.install(session,victory);session.hooks=battle.status?battle.status():{};}catch(error){session.hooks={error:String(error)};log("Battle hooks: "+String(error));}
    const generation = worldGeneration, key = new UE.Key("F8"); let ticks = 0, arrivalTicks=0, stableTicks=0, preparing = false,lastPosition=null;
    keyTimer = setInterval(() => {
        try {
            if (generation !== worldGeneration || !valid(context)) { if(validation.ui)validation.ui(diagnosticContext,"input-context-ended",session,{generation,currentGeneration:worldGeneration,contextValid:valid(context)});stopKeys(); return; }
            const player = UE.GameplayStatics.GetPlayerCharacter(context, 0);
            if(session.active&&valid(player)){
                arrivalTicks++;
                if(arrivalTicks%10===0&&battle.prepareEncounter)battle.prepareEncounter(context,session);
                if(arrivalTicks%15===0&&battle.poll)battle.poll(context,session);
                if(arrivalTicks%10===0)session.cinematicActive=cinema.tick(context,session);
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
                        if(session.prepareOnArrival&&!validation.automated){session.prepareOnArrival=false;prepareEquipment(context);}
                    }
                }
            }
            if (session.active && !session.initialized && !preparing && valid(player) && ++ticks >= 45) {
                preparing = true;
                try {
                    const counts = arsenal.initialize(context); session.initialized = true; session.arsenal = counts;
                    session.report = counts.weapons + " armes · " + counts.edges + " lames · " + counts.accessories + " accessoires · " + counts.medicines + " remèdes";
                    captureCheckpoint(context);
                } catch (error) { fail(context, "Arsenal : " + String(error)); }
            }
            const controller = UE.GameplayStatics.GetPlayerController(context, 0);
            if (!valid(controller)) return;
            const down = controller.IsInputKeyDown(key); if (down && !keyHeld) showMenu(context); keyHeld = down;
            if(!busy)validation.tick(context,controller,session,captureCheckpoint,{replay,showMenu,victory,travel:writeEncounter});
        } catch (error) { log("Input: " + String(error));if(validation.ui)validation.ui(diagnosticContext,"runtime-error",session,{error:String(error),stack:error?.stack});stopKeys(); }
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
    for (const name of ["NewGame", "LoadGame", "BonusCollection"]) if (menu[name]) menu[name].SetVisibility(UE.ESlateVisibility.Collapsed);
    if (menu.Version) menu.Version.SetText(text(""));
}
function patchStartMenu(Type) {
    const p = Type.prototype, bind = p.bindButtonClicked;
    p.bindButtonClicked = function (name, handler) { if (name === "ContinueGame") handler = () => showMenu(this); return bind.call(this, name, handler); };
    for (const method of ["InitText", "BP_OnActivated", "CheckTag", "UpdateVersionText"]) wrap(p, method, function () { labelMenu(this); });
    wrap(p,"BP_OnActivated",function(){if(validation.menu)validation.menu(this,session,{replay,showMenu});});
}
function patchGameMode(Type) {
    const p = Type.prototype;
    const achievements=p.startAchievementProgression;
    if(typeof achievements==="function")p.startAchievementProgression=function(...args){if(!session.active)return achievements.apply(this,args);};
    wrap(p, "bindSaveTipExtension", function () { beginKeys(this); });
    const end = p.ReceiveEndPlay;
    p.ReceiveEndPlay = function (...args) { if(worldContext===this){stopKeys(); activeDialog = null;if(battle.stop)battle.stop();}return end.apply(this, args); };
}
function patchDeathMenu(Type) {
    const p = Type.prototype, activate = p.BP_OnActivated, tick = p.Tick, destruct = p.Destruct;
    p.BP_OnActivated = function (...args) {
        if (!session.active) return activate.apply(this, args);
        this.codexLabDeath = true; this.isAlreadyReSpawn = true;
        session.deathRetries=(session.deathRetries||0)+1;
        log("Death: restoring encounter and retaining loadout");
        if (busy) { if (pending && pending.kind === "equipment") queuedDeath = true; }
        else replay(this, session.difficulty,session.boss,false);
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
exports.isActive=()=>session.active;
