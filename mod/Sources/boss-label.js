"use strict";
// Resolve every member through the game's current localization. A duo keeps
// the short character names, without concatenating their campaign epithets.
exports.resolve=(boss,lookup,short=false)=>{
    if(!boss)return 'BOSSES';
    if(boss.label)return short?boss.label.split(',')[0]:boss.label;
    const keys=boss.nameKeys?.length?boss.nameKeys:[boss.nameKey];
    const names=keys.filter(Boolean).map(key=>{
        const value=String(lookup(key)||key);
        return keys.length>1||short?value.split(',')[0].trim():value;
    });
    return names.join(' & ')||boss.id||'BOSSES';
};
