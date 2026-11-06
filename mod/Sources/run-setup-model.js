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
    if(key==='format')return draft.format==='series'?'Les boss s’enchaînent automatiquement dans l’ordre de la liste, à partir du combat choisi.':'Un seul boss. Après la victoire, vous choisissez de rejouer ou de revenir à la sélection.';
    if(key==='timer')return !draft.timer?'Aucun chronomètre affiché.':draft.format==='series'?'Temps cumulé de la série, avec le temps du combat en cours. Les tentatives perdues comptent dans le total. Chargements, pauses et cinématiques reconnues sont exclus ; les QTE détectés comptent.':'Temps de cette tentative. Une mort ou une nouvelle tentative le remet à zéro. Chargements, pauses et cinématiques reconnues sont exclus ; les QTE détectés comptent.';
    if(key==='difficulty')return draft.difficulty===4?'Explorateur des enfers avec un budget de 66 coups ennemis reçus. Le 66e coup termine le défi. Mourir, se soigner ou recommencer un combat ne rembourse aucun coup.':['','Un combat plus accessible.','Les règles normales du jeu.','Les règles d’Explorateur des enfers.'][draft.difficulty];
    return 'Maintenez pour confirmer cette configuration et lancer le combat. Retour annule les modifications.';
}
exports.create=create;exports.set=set;exports.values=values;exports.description=description;
