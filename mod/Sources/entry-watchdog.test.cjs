const test=require('node:test'),assert=require('node:assert/strict'),watchdog=require('./entry-watchdog');
const session=()=>({active:true,boss:{profile:{directEntry:{}}}});
const ready={loaded:true};
test('a stalled entrance returns a single failure after 45 playable seconds',()=>{
 const s=session();for(let t=0;t<45000;t+=1000)assert.equal(watchdog.tick(s,t,ready),false);assert.equal(watchdog.tick(s,45000,ready),true);assert.equal(watchdog.tick(s,46000,ready),false);
});
test('loading, cinematics, pauses and menus do not consume the entrance timeout',()=>{
 for(const state of [{loaded:false},{...ready,cinematic:true},{...ready,paused:true},{...ready,menu:true}]){const s=session();for(let t=0;t<120000;t+=1000)assert.equal(watchdog.tick(s,t,state),false);assert.equal(s.entryWatch.waiting,0);}
});
test('a confirmed fight or completed result cannot time out and a computer sleep is bounded',()=>{
 const s=session();watchdog.tick(s,0,ready);watchdog.tick(s,1000,{...ready,combat:true});assert.equal(watchdog.tick(s,90000,ready),false);
 const sleepy=session();watchdog.tick(sleepy,0,ready);assert.equal(watchdog.tick(sleepy,9999999,ready),false);assert.equal(sleepy.entryWatch.waiting,2500);
});
