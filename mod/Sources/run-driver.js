"use strict";
const UE=require('ue'),puerts=require('puerts'),model=require('./run-model'),hud=require('./run-hud'),cinema=require('./cinema');
let scope=null;
function valid(w){try{return !!w&&UE.KismetSystemLibrary.IsValid(w);}catch(_){return false;}}
function tag(name){const t=new UE.GameplayTag();t.TagName=name;return t;}
function stop(){
    if(scope?.task)try{scope.task.EventReceived.Remove(scope.onHit);scope.task.Cancel();}catch(_){}
    scope=null;hud.stop();
}
function install(context,session){stop();session.runInteractiveActive=false;scope={context,session,player:null,task:null,last:null,interactive:false};}
function interactive(context,session){
    for(const name of ['WB_QTEWidget','W_QTEActivateWidget']){
        const cls=UE.Class.Find('/Game/PBZContent/UI/QTE/'+name+'.'+name+'_C');if(!cls)continue;
        const out=puerts.$ref(UE.NewArray(UE.UserWidget));UE.WidgetBlueprintLibrary.GetAllWidgetsOfClass(context,out,cls,false);const list=puerts.$unref(out);
        for(let i=0;i<list.Num();i++){const w=list.Get(i);if(!valid(w)||!w.IsVisible()||w.GetRenderOpacity()<=0.01)continue;if(name==='W_QTEActivateWidget'){if(w['User Widget']?.Num()>0)return true;}else if(!w.IsActivated||w.IsActivated())return true;}
    }
    const manager=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.PBZLevelSequenceManager.StaticClass()),sequence=manager?.GetCurrentSequence?.();
    return valid(sequence)&&/qte/i.test(UE.KismetSystemLibrary.GetPathName(sequence));
}
function flags(context,session,player){
    const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(player),now=UE.GameplayStatics.GetRealTimeSeconds(context)*1000;
    if(scope.qteSampleAt===undefined||now<scope.qteSampleAt||now-scope.qteSampleAt>=100){scope.qteSampleAt=now;scope.qteSample=interactive(context,session);}
    const qte=scope.qteSample;
    const manager=UE.SubsystemBlueprintLibrary.GetWorldSubsystem(context,UE.PBZLevelSequenceManager.StaticClass());
    const sequence=!!manager?.IsInSequence()||!!asc?.HasMatchingGameplayTag(tag('CharacterState.InLevelSequence'))||cinema.pending(context)||!!(session.cinematicActive&&!['sequence','player-state'].includes(session.cinemaSource));
    const introduced=!session.boss.profile.directEntry?.sequences?.length||!!session.ux?.directIntroObserved;
    const visible=!session.directArrival?.releasedAt||Date.now()-session.directArrival.releasedAt>=300;
    // The native post-intro cover can still own input after our arrival has
    // yielded. Query the same exact entry-loading owners as combat gating;
    // a visible QTE must never turn an actual loading interval into play time.
    const entryLoading=cinema.entryLoadingActive(context,session);
    const arrived=!entryLoading&&!!session.worldLoadingComplete&&!session.arrivalAnchorPending&&(!session.boss.profile.directEntry||(!!session.directArrival?.released&&!!session.ux?.directReady&&visible));
    const combat=['combat','finishing'].includes(session.run.phase)||!!session.ux?.directCombatStarted||Object.keys(session.engaged||{}).length>0||!!asc?.HasMatchingGameplayTag(tag('CharacterState.InCombat'))||(qte&&session.ux?.directReady);
    session.runInteractiveActive=qte;
    return {ready:arrived&&combat&&introduced&&(!sequence||qte),interactive:qte,cinematic:sequence,paused:UE.GameplayStatics.IsGamePaused(context),loading:!arrived,dead:!!asc?.HasMatchingGameplayTag(tag('CharacterState.Dead'))};
}
function hostileSource(source,player,session){
    const queue=[source],seen=new Set(),known=[...(session.boss.classes||[]),...(session.boss.supportClasses||[])].map(p=>p.toLowerCase());
    for(let n=0;queue.length&&n<16;n++){
        const candidate=queue.shift();if(!valid(candidate)||seen.has(candidate))continue;seen.add(candidate);
        if(candidate===player)return false;
        // The bullet interface identifies its current avatar, including after
        // reflection. Its old faction or instigator may still name the enemy.
        try{const avatar=candidate.GetOwnerAvatar?.();if(valid(avatar)&&avatar!==candidate){queue.unshift(avatar);continue;}}catch(_){}
        try{
            const mine=UE.FactionUtils.GetFaction(player),theirs=UE.FactionUtils.GetFaction(candidate);
            if(UE.BlueprintGameplayTagLibrary.IsGameplayTagValid(mine)&&UE.BlueprintGameplayTagLibrary.IsGameplayTagValid(theirs)){
                const relation=UE.FactionUtils.GetFactionRelation(player,candidate);
                if(relation===UE.ETeamAttitude.Hostile)return true;
                if(relation===UE.ETeamAttitude.Friendly)return false;
            }
        }catch(_){}
        try{if(known.includes(UE.KismetSystemLibrary.GetPathName(candidate.GetClass()).toLowerCase()))return true;}catch(_){}
        for(const name of ['GetInstigator','GetOwner'])try{if(typeof candidate[name]==='function')queue.push(candidate[name]());}catch(_){}
    }
    return null;
}
function kill(player){
    const asc=UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(player);if(!asc)throw Error('Health system unavailable');
    UE.AttributeUtils.ModifyCharacterAttributeValue(player,UE.PBZBlueprintFunctionLibrary.MakeAttribute('Health_Min',UE.BasicAttributeSet.StaticClass()),UE.EGameplayModOp.Override,0);
    asc.BP_ApplyGameplayEffectToSelf(UE.Class.Load('/Game/PBZContent/Blueprint/Ability/GameplayEffects/GE_Kill.GE_Kill_C'),1,asc.MakeEffectContext());
}
function bind(context,session,player){
    if(scope.player===player)return;
    if(scope.task)try{scope.task.EventReceived.Remove(scope.onHit);scope.task.Cancel();}catch(_){}
    scope.player=player;scope.task=null;
    if(!session.run.options.hits66)return;
    const owner=scope,task=UE.AbilityAsync_WaitGameplayEvent.WaitGameplayEventToActor(player,tag('GameplayEvent.Actor.Hit.Target'),false,true);
    if(!task)throw Error('Incoming hit event unavailable');
    owner.task=task;owner.onHit=payload=>{try{
        if(scope!==owner||!session.active||session.boss.training||!valid(player)||session.run.phase==='failed')return;
        if(valid(payload.Target)&&payload.Target!==player)return;
        const current=sample(context,session,player);if(current.paused||current.loading||(current.cinematic&&!current.interactive)||!(session.run.phase==='combat'||(session.run.phase==='finishing'&&current.interactive)))return;
        const source=hostileSource(payload.Instigator,player,session);
        if(source===false)return;
        if(source===null){session.run.invalid=true;session.run.invalidReason='Hit source could not be identified';session.run.unknownSources=(session.run.unknownSources||0)+1;return;}
        if(model.hit(session.run,session.runInteractiveActive)){
            session.autoNext=false;if(session.completionToken)session.completionToken.cancelled=true;
            kill(player);
        }
        hud.update(session,context);
    }catch(error){session.run.invalid=true;session.run.engineError=String(error);}
    };
    task.EventReceived.Add(owner.onHit);task.Activate();
}
function sample(context,session,player){
    const now=UE.GameplayStatics.GetRealTimeSeconds(context)*1000;
    const delta=scope.last===null||now<scope.last?0:now-scope.last;scope.last=now;
    const state=flags(context,session,player);scope.interactive=state.interactive;
    model.advance(session.run,delta,state);return state;
}
function tick(context,session){
    if(!session.active||session.boss.training||!model.enabled(session.run)){if(scope)scope.last=null;session.runInteractiveActive=false;hud.update(session,context);return;}
    if(!scope||scope.session!==session)install(context,session);
    if(session.run.engineError)throw Error(session.run.engineError);
    const player=UE.GameplayStatics.GetPlayerCharacter(context,0);if(!valid(player)){scope.last=null;return;}
    bind(context,session,player);sample(context,session,player);hud.update(session,context);
}
function beforeEvent(context,session){if(scope?.session===session&&valid(scope.player)&&model.enabled(session.run))sample(context,session,scope.player);}
function enter(session,boss,pendingOptions){
    session.runInteractiveActive=false;
    if(boss.training){model.abandon(session.run);return;}
    if(pendingOptions||!session.run||['failed','finished','abandoned'].includes(session.run.phase)){session.run=model.create(pendingOptions||session.run?.options,boss.id);delete session.runFailureReturn;}
    else model.enter(session.run,boss.id,session.run.currentBoss===boss.id?'retry':'next');
}
exports.install=install;exports.stop=stop;exports.tick=tick;exports.enter=enter;exports.hostileSource=hostileSource;exports.interactive=interactive;
exports.victory=(context,session)=>{beforeEvent(context,session);model.pendingVictory(session.run);};
exports.finishVictory=(session,hasNext)=>model.finishVictory(session.run,hasNext);
exports.death=(context,session)=>{beforeEvent(context,session);model.death(session.run);};
exports.summary=session=>model.summary(session.run)+(session.run?.invalid?'\nCheck hit detection':'');
