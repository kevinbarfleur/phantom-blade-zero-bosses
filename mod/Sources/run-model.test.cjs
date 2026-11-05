const test=require('node:test'),assert=require('node:assert/strict'),model=require('./run-model');
const ready={ready:true};
test('clock starts at the first playable frame and excludes loading, pause and cinematics; QTE remains timed',()=>{
 const s=model.create({timer:'series'},'a');model.advance(s,9000,{loading:true});assert.equal(s.totalMs,0);
 model.advance(s,6000,ready);assert.equal(s.phase,'combat');assert.equal(s.totalMs,0);
 model.advance(s,1250,ready);for(const f of [{paused:true},{loading:true},{cinematic:true},{dead:true}])model.advance(s,4000,{...ready,...f});
 assert.equal(s.totalMs,1250);model.advance(s,750,{...ready,cinematic:true,interactive:true});assert.equal(s.totalMs,2000);
 model.advance(s,NaN,ready);model.advance(s,-1,ready);assert.equal(s.totalMs,2000);
});
test('retry resets the attempt while preserving series time, hit budget and previous attempts',()=>{
 const s=model.create({timer:'series',hits66:true},'a');model.advance(s,0,ready);model.advance(s,1234,ready);model.hit(s);model.death(s);model.enter(s,'a','retry');
 assert.equal(s.hits,1);assert.equal(s.totalMs,1234);assert.equal(s.attemptMs,0);assert.equal(s.attempt,2);assert.equal(s.deaths,1);
 model.advance(s,0,ready);model.advance(s,500,ready);assert.equal(s.totalMs,1734);assert.equal(s.attemptMs,500);
});
test('QTE after the native kill is counted but the victory presentation delay is excluded',()=>{
 const s=model.create({timer:'series',hits66:true},'a');model.advance(s,0,ready);model.advance(s,1000,ready);model.pendingVictory(s);
 model.advance(s,4500,ready);model.advance(s,4000,{...ready,cinematic:true});assert.equal(s.totalMs,1000);
 model.advance(s,800,{...ready,interactive:true,cinematic:true});assert.equal(s.totalMs,1800);
 model.finishVictory(s,true);model.finishVictory(s,true);assert.equal(s.splits.length,1);assert.equal(s.splits[0].ms,1800);
 model.enter(s,'b','next');model.advance(s,0,ready);model.advance(s,200,ready);assert.equal(s.totalMs,2000);assert.equal(s.attemptMs,200);
});
test('the 66th hit fails once, blocks further hits and cannot be reset by retry or next boss',()=>{
 const s=model.create({timer:'fight',hits66:true},'a');assert.equal(model.hit(s),false);model.advance(s,0,ready);
 for(let i=0;i<65;i++)assert.equal(model.hit(s),false);assert.equal(s.hits,65);assert.equal(model.hit(s),true);
 assert.equal(s.hits,66);assert.equal(s.phase,'failed');assert.equal(model.hit(s),false);assert.equal(s.hits,66);
 assert.equal(model.enter(s,'b','next'),false);assert.equal(model.enter(s,'a','retry'),false);model.pendingVictory(s);model.finishVictory(s,true);assert.equal(s.phase,'failed');
 const fresh=model.create(s.options,s.firstBoss);assert.equal(fresh.hits,0);assert.equal(fresh.totalMs,0);
});
test('single fight mode does not imply automatic chaining and displays each attempt separately',()=>{
 const s=model.create({timer:'fight'},'a');assert.equal('autoNext' in s.options,false);model.advance(s,0,ready);model.advance(s,2130,ready);model.pendingVictory(s);model.finishVictory(s,false);
 assert.match(model.summary(s),/00:02.13/);model.enter(s,'a','retry');assert.match(model.summary(s),/00:00.00/);assert.equal(s.options.hits66,false);
});
test('abandon freezes the run; changing options creates an independent challenge',()=>{
 const s=model.create({timer:'series',hits66:true},'a');model.advance(s,0,ready);model.advance(s,1000,ready);model.abandon(s);model.advance(s,5000,ready);assert.equal(s.totalMs,1000);assert.equal(model.hit(s),false);
 const n=model.create({timer:'invalid',hits66:1},'b');assert.equal(model.enabled(n),false);assert.equal(n.hits,0);assert.equal(n.firstBoss,'b');
});
test('time formatting preserves hours and hundredths without rounding a split up',()=>{
 assert.equal(model.formatTime(0),'00:00.00');assert.equal(model.formatTime(59999),'00:59.99');assert.equal(model.formatTime(3600000+61230),'1:01:01.23');assert.equal(model.formatTime(-1),'00:00.00');
});
