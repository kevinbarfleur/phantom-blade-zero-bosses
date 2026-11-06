"use strict";
const timerModes=["off","fight","series"];
function options(value={}){
    return {timer:timerModes.includes(value.timer)?value.timer:"off",hits66:value.hits66===true};
}
function create(value,boss){
    return {version:1,options:options(value),firstBoss:boss,currentBoss:boss,phase:"waiting",totalMs:0,attemptMs:0,hits:0,deaths:0,attempt:1,splits:[],lastAttempt:null,reason:"preparing",active:false};
}
function enabled(state){return !!state&&(state.options.timer!=="off"||state.options.hits66);}
function advance(state,delta,flags={}){
    if(!state||["failed","finished","abandoned"].includes(state.phase))return;
    if(state.phase==="waiting"&&flags.ready&&!flags.loading&&!flags.paused&&(!flags.cinematic||flags.interactive)&&!flags.dead){state.phase="combat";state.reason=null;state.active=true;return;}
    const canFight=state.phase==="combat"||(state.phase==="finishing"&&flags.interactive);
    const wasActive=state.active;
    state.active=!!(canFight&&flags.ready&&!flags.paused&&!flags.loading&&!flags.dead&&(!flags.cinematic||flags.interactive));
    state.reason=state.active?null:flags.loading?"loading":flags.paused?"pause":flags.cinematic&&!flags.interactive?"cinematic":state.phase==="finishing"?"victory":"waiting";
    // Only charge intervals whose two sampled ends are playable. A resume must
    // never bill an unknown gap spent inside a menu, movie or loading screen.
    if(wasActive&&state.active&&Number.isFinite(delta)&&delta>0){state.totalMs+=delta;state.attemptMs+=delta;}
}
function enter(state,boss,kind="retry"){
    if(!state||["failed","finished","abandoned"].includes(state.phase))return false;
    if(kind==="retry"&&state.reason!=="defeat")state.lastAttempt={boss:state.currentBoss,ms:state.attemptMs,result:"retry"};
    state.attempt=kind==="retry"?state.attempt+1:1;
    state.currentBoss=boss;state.attemptMs=0;state.phase="waiting";state.active=false;state.reason="preparing";
    return true;
}
function hit(state,interactive=false){
    if(!state?.options.hits66||!(state.phase==="combat"||(state.phase==="finishing"&&interactive)))return false;
    state.hits=Math.min(66,state.hits+1);
    if(state.hits<66)return false;
    state.phase="failed";state.active=false;state.reason="66hits";state.deaths++;
    state.lastAttempt={boss:state.currentBoss,ms:state.attemptMs,result:"66hits"};return true;
}
function death(state){
    if(!state||["failed","finished","abandoned"].includes(state.phase)||(state.phase==="waiting"&&state.reason==="defeat"))return;
    state.deaths++;state.active=false;state.reason="defeat";
    state.lastAttempt={boss:state.currentBoss,ms:state.attemptMs,result:"death"};
    state.phase="waiting";
}
function pendingVictory(state){
    if(!state||!["combat","waiting"].includes(state.phase))return;
    state.phase="finishing";state.active=false;state.reason="victory";
}
function finishVictory(state,hasNext){
    if(!state||state.phase!=="finishing")return;
    state.splits.push({boss:state.currentBoss,ms:state.attemptMs,totalMs:state.totalMs,hits:state.hits,attempts:state.attempt});
    state.phase=hasNext?"between":"finished";state.active=false;state.reason=hasNext?"between":"finished";
}
function abandon(state){if(state&&!['failed','finished','abandoned'].includes(state.phase)){state.phase="abandoned";state.active=false;state.reason="abandoned";}}
function formatTime(value){
    const n=Math.max(0,Math.floor(Number.isFinite(value)?value:0)),hours=Math.floor(n/3600000),minutes=Math.floor(n/60000)%60,seconds=Math.floor(n/1000)%60,hundredths=Math.floor(n/10)%100;
    return (hours?hours+":"+String(minutes).padStart(2,'0'):String(minutes).padStart(2,'0'))+":"+String(seconds).padStart(2,'0')+"."+String(hundredths).padStart(2,'0');
}
function summary(state){
    if(!state)return "";
    const rows=[];
    if(state.options.timer!=="off")rows.push((state.options.timer==="series"?"Série · ":"Combat · ")+formatTime(state.options.timer==="series"?state.totalMs:state.attemptMs));
    if(state.options.timer==="series")rows.push("Combat · "+formatTime(state.attemptMs));
    if(state.options.hits66)rows.push("66 HITS · "+state.hits+" / 66");
    return rows.join("\n");
}
exports.options=options;exports.create=create;exports.enabled=enabled;exports.advance=advance;exports.enter=enter;exports.hit=hit;exports.death=death;exports.pendingVictory=pendingVictory;exports.finishVictory=finishVictory;exports.abandon=abandon;exports.formatTime=formatTime;exports.summary=summary;
