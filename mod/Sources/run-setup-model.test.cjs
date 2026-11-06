const test=require('node:test'),assert=require('node:assert/strict'),setup=require('./run-setup-model');
test('the run format determines stopwatch semantics without enabling the stopwatch implicitly',()=>{
 const d=setup.create();assert.deepEqual(setup.values(d),{difficulty:2,hits66:false,autoNext:false,timer:'off'});
 setup.set(d,'format','series');assert.equal(setup.values(d).timer,'off');setup.set(d,'timer',true);assert.equal(setup.values(d).timer,'series');assert.equal(setup.values(d).autoNext,true);
 setup.set(d,'format','fight');assert.equal(setup.values(d).timer,'fight');assert.equal(setup.values(d).autoNext,false);assert.match(setup.description(d,'timer'),/remet à zéro/);
});
test('a configuration draft leaves the current run untouched until submitted',()=>{
 const s={difficulty:3,autoNext:true,run:{options:{timer:'series',hits66:true},hits:12}},before=JSON.stringify(s),d=setup.create(s);setup.set(d,'difficulty',1);setup.set(d,'timer',false);assert.equal(JSON.stringify(s),before);assert.equal(setup.values(d).hits66,false);assert.equal(setup.values(d).difficulty,1);
});
test('66 HITS always uses native Hard while its budget remains independent of timer and chaining',()=>{
 const d=setup.create();setup.set(d,'difficulty',4);assert.deepEqual(setup.values(d),{difficulty:3,hits66:true,autoNext:false,timer:'off'});assert.match(setup.description(d,'difficulty'),/66e coup/);setup.set(d,'format','series');setup.set(d,'timer',true);assert.deepEqual(setup.values(d),{difficulty:3,hits66:true,autoNext:true,timer:'series'});
});
