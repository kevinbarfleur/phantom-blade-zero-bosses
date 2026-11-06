const test=require('node:test'),assert=require('node:assert/strict'),model=require('./run-model');
const ready={ready:true};
test('clock starts at the first playable frame and excludes loading, pause and cinematics; QTE remains timed',()=>{
 const s=model.create({timer:'series'},'a');model.advance(s,9000,{loading:true});assert.equal(s.totalMs,0);
 model.advance(s,6000,ready);assert.equal(s.phase,'combat');assert.equal(s.totalMs,0);
 model.advance(s,1250,ready);for(const f of [{paused:true},{loading:true},{cinematic:true},{dead:true}])model.advance(s,4000,{...ready,...f});
 assert.equal(s.totalMs,1250);model.advance(s,0,{...ready,cinematic:true,interactive:true});model.advance(s,750,{...ready,cinematic:true,interactive:true});assert.equal(s.totalMs,2000);
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
 model.advance(s,0,{...ready,interactive:true,cinematic:true});model.advance(s,800,{...ready,interactive:true,cinematic:true});assert.equal(s.totalMs,1800);
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
 assert.match(model.summary(s),/00:02.13/);assert.equal(model.enter(s,'a','retry'),false);const fresh=model.create(s.options,'a');assert.match(model.summary(fresh),/00:00.00/);assert.equal(fresh.options.hits66,false);assert.match(model.summary(s),/00:02.13/);
});
test('abandon freezes the run; changing options creates an independent challenge',()=>{
 const s=model.create({timer:'series',hits66:true},'a');model.advance(s,0,ready);model.advance(s,1000,ready);model.abandon(s);model.advance(s,5000,ready);assert.equal(s.totalMs,1000);assert.equal(model.hit(s),false);
 const n=model.create({timer:'invalid',hits66:1},'b');assert.equal(model.enabled(n),false);assert.equal(n.hits,0);assert.equal(n.firstBoss,'b');
});
test('time formatting preserves hours and hundredths without rounding a split up',()=>{
 assert.equal(model.formatTime(0),'00:00.00');assert.equal(model.formatTime(59999),'00:59.99');assert.equal(model.formatTime(3600000+61230),'1:01:01.23');assert.equal(model.formatTime(-1),'00:00.00');
});
test('resuming after an unobserved pause or movie never charges that entire gap as combat time',()=>{
 const s=model.create({timer:'series'},'a');model.advance(s,0,ready);model.advance(s,1000,ready);
 model.advance(s,0,{...ready,paused:true});model.advance(s,60000,ready);assert.equal(s.totalMs,1000);model.advance(s,250,ready);assert.equal(s.totalMs,1250);
 model.advance(s,0,{...ready,cinematic:true});model.advance(s,45000,ready);assert.equal(s.totalMs,1250);model.advance(s,100,ready);assert.equal(s.totalMs,1350);
});
test('duplicate death notifications do not add deaths and a terminal result cannot be reopened',()=>{
 const s=model.create({timer:'series'},'a');model.advance(s,0,ready);model.death(s);model.death(s);assert.equal(s.deaths,1);
 model.enter(s,'a');model.advance(s,0,ready);model.pendingVictory(s);model.finishVictory(s,false);const before=JSON.stringify(s);assert.equal(model.enter(s,'a'),false);assert.equal(JSON.stringify(s),before);
});
test('a loading flag prevents a contradictory ready signal from starting the first attempt',()=>{
 const s=model.create({timer:'series'},'a');model.advance(s,10000,{ready:true,loading:true});assert.equal(s.phase,'waiting');assert.equal(s.totalMs,0);
 model.advance(s,10000,ready);assert.equal(s.phase,'combat');assert.equal(s.totalMs,0);model.advance(s,200,ready);assert.equal(s.totalMs,200);
});
test('a 60-boss series keeps lost attempts and its shared budget without charging inter-fight waits',()=>{
 const s=model.create({timer:'series',hits66:true},'boss-0');let expected=0;
 for(let i=0;i<60;i++){
  if(i)model.enter(s,'boss-'+i,'next');model.advance(s,60000,ready);model.advance(s,1000+i,ready);expected+=1000+i;model.hit(s);
  if(i%7===0){model.death(s);model.death(s);model.enter(s,s.currentBoss);model.advance(s,30000,ready);model.advance(s,500,ready);expected+=500;}
  model.pendingVictory(s);model.advance(s,9000,ready);model.finishVictory(s,i<59);model.advance(s,60000,ready);
  assert.equal(s.totalMs,expected);assert.equal(s.hits,i+1);assert.equal(s.splits.length,i+1);assert.equal(s.splits[i].totalMs,expected);
 }
 assert.equal(s.phase,'finished');assert.equal(s.deaths,9);assert.equal(s.firstBoss,'boss-0');assert.equal(s.hits,60);
});
test('seeded mixed event sequences preserve finite clocks, budget bounds and immutable terminal results',()=>{
 const terminal=new Set(['failed','finished','abandoned']);let finished=0,failed=0;
 for(let seed=1;seed<=200;seed++){
  let word=seed;const random=n=>{word^=word<<13;word^=word>>>17;word^=word<<5;return (word>>>0)%n;};
  let s=model.create({timer:['off','fight','series'][random(3)],hits66:true},'a');
  for(let step=0;step<400;step++){
   const previous=s.totalMs,choice=random(10),delta=[0,33,1250,60000,NaN,-1][random(6)];
   switch(choice){
    case 0:case 1:model.advance(s,delta,ready);break;
    case 2:{const flags=[{paused:true},{loading:true},{dead:true},{cinematic:true}][random(4)];model.advance(s,delta,{...ready,...flags});assert.equal(s.totalMs,previous);break;}
    case 3:model.advance(s,delta,{...ready,cinematic:true,interactive:true});break;
    case 4:for(let i=0,n=random(25);i<n;i++)model.hit(s,true);break;
    case 5:model.death(s);model.death(s);break;
    case 6:model.enter(s,'boss-'+random(60),random(2)?'retry':'next');break;
    case 7:model.pendingVictory(s);break;
    case 8:model.finishVictory(s,!!random(2));break;
    case 9:if(random(8)===0)model.abandon(s);break;
   }
   assert(Number.isFinite(s.totalMs)&&s.totalMs>=previous);assert(Number.isFinite(s.attemptMs)&&s.attemptMs>=0&&s.attemptMs<=s.totalMs);assert(Number.isInteger(s.hits)&&s.hits>=0&&s.hits<=66);
   if(terminal.has(s.phase)){
    finished+=s.phase==='finished';failed+=s.phase==='failed';const frozen=JSON.stringify(s);
    model.advance(s,100000,ready);model.hit(s,true);model.death(s);model.pendingVictory(s);model.finishVictory(s,true);model.enter(s,'x');model.abandon(s);assert.equal(JSON.stringify(s),frozen);
    s=model.create(s.options,'a');
   }
  }
 }
 assert(finished>0);assert(failed>0);
});
