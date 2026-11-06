"use strict";
function create(session={}){
    const options=session.run?.options||session.runOptions||{};
    return {format:session.autoNext?'series':'fight',difficulty:options.hits66?4:([1,2,3].includes(session.difficulty)?session.difficulty:2),timer:!!options.timer&&options.timer!=='off',focus:'format'};
}
function set(draft,key,value){
    if(key==='format'&&['fight','series'].includes(value))draft.format=value;
    if(key==='difficulty'&&[1,2,3,4].includes(value))draft.difficulty=value;
    if(key==='timer'&&typeof value==='boolean')draft.timer=value;
}
function values(draft){return {difficulty:draft.difficulty===4?3:draft.difficulty,hits66:draft.difficulty===4,autoNext:draft.format==='series',timer:draft.timer?draft.format:'off'};}
function description(draft,key){
    if(key==='format')return draft.format==='series'?'Automatically fight bosses in list order, starting with the selected fight.':'Fight one boss. After victory, choose to replay or return to Boss Select.';
    if(key==='timer')return !draft.timer?'No timer is displayed.':draft.format==='series'?'Tracks the whole series and the current fight. Failed attempts count toward the total. Loading, pauses and detected cutscenes are excluded; detected QTEs count.':'Tracks this attempt. Death or a retry resets the timer. Loading, pauses and detected cutscenes are excluded; detected QTEs count.';
    if(key==='difficulty')return draft.difficulty===4?'Hellwalker with a limit of 66 enemy hits. The 66th hit ends the challenge. Death, healing and retries do not restore the hit budget.':['','A more forgiving fight.','The standard game difficulty.','Hellwalker difficulty.'][draft.difficulty];
    return 'Hold to confirm these settings and start the fight. Back discards changes.';
}
exports.create=create;exports.set=set;exports.values=values;exports.description=description;
