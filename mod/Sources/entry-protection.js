"use strict";
const UE=require('ue'),puerts=require('puerts'),cinema=require('./cinema');
let scope=null,cleanup=[];
const protection='CharacterState.Stand.Invulnerable.Debug';
function valid(value){try{return !!value&&UE.KismetSystemLibrary.IsValid(value);}catch(_){return false;}}
function tag(name){const value=new UE.GameplayTag();value.TagName=name;return value;}
function tagged(actor,name){return !!UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(actor)?.HasMatchingGameplayTag(tag(name));}
function actors(context,boss,callback){
    const nativeSupportAI=boss.id==='BP_Monster_HuaShan_RedTroop_BigBro'&&boss.profile.nativeSupportAI===true;
    for(const path of [...boss.classes||[],...nativeSupportAI?[]:boss.supportClasses||[]]){
        const cls=UE.Class.Find(path);if(!cls)continue;
        const out=puerts.$ref(UE.NewArray(UE.Actor));UE.GameplayStatics.GetAllActorsOfClass(context,cls,out);
        const list=puerts.$unref(out);
        for(let i=0;i<list.Num();i++){
            const actor=list.Get(i);if(!valid(actor))continue;
            if(UE.KismetSystemLibrary.GetPathName(actor.GetClass()).toLowerCase()!==path.toLowerCase())continue;
            callback(actor,path);
        }
    }
}
function nativeOwns(actor){return actor.bHidden||tagged(actor,'CharacterState.Dead')||tagged(actor,'CharacterState.InLevelSequence')||tagged(actor,'AI.DisableCombatAI');}
function cleanupOwned(owned){
    const error=(operation,value)=>{owned.session.ux={...owned.session.ux,entryProtectionCleanupError:operation+': '+String(value)};};
    // Remove only the single loose count that this cover acquired. Never
    // remove the native shared GE (it aggregates at stack limit one), reset
    // tag counts, restore HP, or clear another cinematic's protection.
    if(owned.tagOwned){
        if(!valid(owned.player))owned.tagOwned=false;
        else try{
            if(!tagged(owned.player,protection))owned.tagOwned=false;
            else if(!owned.removalAttempted){
                owned.removalAttempted=true;
                try{UE.AbilityUtils.RemoveLooseGameplayTag(owned.player,tag(protection),false);owned.tagOwned=false;}
                catch(failure){
                    error('remove-native-protection',failure);
                    // A bridge exception may arrive before OR after the
                    // native decrement. An absent tag proves completion; a
                    // still-present tag does not distinguish our count from
                    // another owner's. Keep that debt instead of retrying a
                    // decrement that could strip native protection.
                    if(!tagged(owned.player,protection))owned.tagOwned=false;
                }
            }
        }catch(failure){error('inspect-native-protection',failure);}
    }
    if(owned.reason==='native-sequence'||owned.session.cinematicActive||owned.session.boss!==owned.boss||!valid(owned.context))owned.held={};
    else try{const seen=new Set();actors(owned.context,owned.boss,actor=>{
        let name;
        try{
            name=actor.GetName();seen.add(name);const held=owned.held[name];if(!held)return;
            if(nativeOwns(actor)){delete owned.held[name];return;}
            const controller=actor.GetController?.(),component=controller?.GetBlueprintSGameAIComponent?.();
            // Native flows can replace or take control of the same named
            // pawn. Never transfer a retry to a replacement controller.
            if(!valid(component)||!valid(controller)||UE.KismetSystemLibrary.GetPathName(controller)!==held.controller){delete owned.held[name];return;}
            if((held.resumeAttempts||0)>=3)return;
            held.resumeAttempts=(held.resumeAttempts||0)+1;
            component.StartAI();owned.resumed.push(name);delete owned.held[name];
        }catch(failure){error('resume-native-ai '+(name||'unknown'),failure);}
    });for(const name of Object.keys(owned.held))if(!seen.has(name))delete owned.held[name];}catch(failure){error('enumerate-native-ai',failure);}
    const pending=owned.tagOwned||Object.keys(owned.held).length>0;
    owned.session.ux={...owned.session.ux,entryProtectionActive:owned.tagOwned,entryProtectionCleanupPending:pending,entryProtectionReleased:pending?null:owned.reason,entryProtectionDuration:Date.now()-owned.startedAt,entryAIResumed:owned.resumed,entryAICleanupPending:Object.keys(owned.held)};
    return pending;
}
function stop(reason='stopped'){
    if(scope){const owned=scope;scope=null;owned.reason=reason;owned.resumed=[];cleanup.push(owned);}
    cleanup=cleanup.filter(cleanupOwned);
}
function abandoned(owned,reason){
    owned.session.ux={...owned.session.ux,entryProtectionCleanupAbandoned:{reason,protectionUncertain:!!owned.tagOwned,actors:Object.keys(owned.held)},entryProtectionCleanupPending:false,entryProtectionActive:false};
}
function forgetWorldReferences(reason='world-ended'){
    // Only after committed travel/EndPlay: the outgoing world's uncertain
    // cleanup must not keep that world alive or target a later pawn. Preserve
    // a primitive diagnostic, not old native wrappers or a future retry.
    if(scope){abandoned(scope,reason);scope=null;}
    for(const owned of cleanup)abandoned(owned,reason);
    cleanup=[];
}
function tick(context,session){
    const currentPlayer=UE.GameplayStatics.GetPlayerCharacter(context,0);
    if(cleanup.length)cleanup=cleanup.filter(owned=>{
        if(owned.context!==context||owned.session!==session||owned.boss!==session.boss||(valid(currentPlayer)&&owned.player!==currentPlayer)){abandoned(owned,'world-or-player-changed');return false;}
        return cleanupOwned(owned);
    });
    if(scope&&(scope.session!==session||scope.boss!==session.boss||scope.context!==context))stop('context-changed');
    if(scope&&Date.now()-scope.startedAt>=90000){session.entryProtectionExpired=true;stop('loading-timeout');return;}
    const loading=cinema.entryLoadingActive(context,session);
    // Intro/phase playback keeps its own actor state. This protection starts
    // only after native playback relinquishes control to a loading surface.
    if(!loading||session.cinematicActive){stop(session.cinematicActive?'native-sequence':'loading-finished');return;}
    if(session.entryProtectionExpired)return;
    const player=currentPlayer;
    if(!valid(player))return;
    if(cleanup.some(owned=>owned.player===player&&owned.tagOwned))return;
    if(scope&&scope.player!==player)stop('player-changed');
    if(!scope){
        if(typeof UE.AbilityUtils?.AddLooseGameplayTag!=='function'||typeof UE.AbilityUtils?.RemoveLooseGameplayTag!=='function'){
            session.ux={...session.ux,entryProtectionError:'Native additive gameplay tag API unavailable'};return;
        }
        scope={session,boss:session.boss,context,player,startedAt:Date.now(),held:{},tagOwned:false};
        try{UE.AbilityUtils.AddLooseGameplayTag(player,tag(protection),false);scope.tagOwned=true;}
        catch(error){
            // Add can also fail at the JS/native boundary after executing.
            // Without a count getter, a present tag is ambiguous. Retain a
            // visible cleanup debt, but never guess by removing a count.
            const uncertain=scope;scope=null;
            uncertain.tagOwned=true;uncertain.removalAttempted=true;uncertain.reason='acquire-uncertain';uncertain.resumed=[];
            cleanup.push(uncertain);cleanup=cleanup.filter(cleanupOwned);
            session.ux={...session.ux,entryProtectionError:String(error)};return;
        }
        session.ux={...session.ux,entryProtectionActive:true,entryProtectionStartedAt:scope.startedAt};
    }
    const owned=scope;
    actors(context,session.boss,(actor,path)=>{
        const name=actor.GetName();if(nativeOwns(actor))return;
        // This native engagement record is stronger than mere pawn presence:
        // do not wake or take ownership of an unstarted/dormant boss phase.
        if(session.engaged?.[name]?.toLowerCase()!==path.toLowerCase())return;
        const at=actor.K2_GetActorLocation(),arena=session.boss.profile.arena;
        if(arena&&Math.hypot(at.X-arena.X,at.Y-arena.Y,at.Z-arena.Z)>5000)return;
        const controller=actor.GetController?.(),component=controller?.GetBlueprintSGameAIComponent?.();
        if(!valid(controller)||!valid(component)||typeof component.StopAI!=='function'||typeof component.StartAI!=='function')return;
        const identity=UE.KismetSystemLibrary.GetPathName(controller);
        if(owned.held[name]&&owned.held[name].controller!==identity)return;
        // RefreshMonster can restart the component during native cover
        // completion. Reassert our temporary hold while that exact cover
        // still blocks input; never reassert it on a replacement controller.
        component.StopAI();owned.held[name]={controller:identity};controller.StopMovement?.();
    });
    session.ux={...session.ux,entryAIHeld:Object.keys(owned.held)};
}
exports.tick=tick;
exports.stop=stop;
exports.forgetWorldReferences=forgetWorldReferences;
