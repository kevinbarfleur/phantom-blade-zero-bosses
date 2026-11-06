"use strict";
function tick(session,now,state){
    if(!session.active||session.completed||session.boss.training||!session.boss.profile.directEntry)return false;
    const watch=session.entryWatch||(session.entryWatch={last:now,waiting:0,confirmed:false,failed:false});
    const delta=Math.max(0,Math.min(2500,now-watch.last));watch.last=now;
    if(watch.confirmed||watch.failed)return false;
    if(state.combat){watch.confirmed=true;return false;}
    if(!state.loaded||state.cinematic||state.paused||state.menu)return false;
    watch.waiting+=delta;
    if(watch.waiting<45000)return false;
    watch.failed=true;return true;
}
exports.tick=tick;
