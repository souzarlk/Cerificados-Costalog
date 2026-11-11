"use strict";
const NATIVE_HOST="com.costalog.agent";
const BLOCK_RULE_ID=1,ALLOW_RULE_START=100;
async function currentRules(){return chrome.declarativeNetRequest.getDynamicRules()}
async function replaceRules(rules){
 const existing=await currentRules();
 await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:existing.map(r=>r.id),addRules:rules});
}
function blockAll(){return [{id:BLOCK_RULE_ID,priority:1,action:{type:"block"},condition:{urlFilter:"|http",resourceTypes:["main_frame"]}}]}
function validHost(host){
 const v=String(host||"").toLowerCase().replace(/\.$/,"");
 return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(v)?v:null;
}
async function applyState(state){
 if(state?.installMode!=="certificate-and-web"){await replaceRules([]);return}
 if(state.status!=="valid"||!Array.isArray(state.allowedDestinations)){await replaceRules(blockAll());return}
 const hosts=[...new Set(state.allowedDestinations.map(validHost).filter(Boolean))];
 const rules=blockAll();
 hosts.slice(0,4500).forEach((host,index)=>{
  const escaped=host.split(".").join("\\.");
  rules.push({
   id:ALLOW_RULE_START+index,
   priority:100,
   action:{type:"allow"},
   condition:{regexFilter:"^https?://"+escaped+"(?::[0-9]+)?(?:/|$)",resourceTypes:["main_frame"]}
  });
 });
 await replaceRules(rules);
}
function readNativePolicy(){
 return new Promise((resolve,reject)=>{
  let done=false,port;
  const timer=setTimeout(()=>{if(done)return;done=true;try{port?.disconnect()}catch{}reject(new Error("Tempo limite do serviço local."))},8000);
  try{
   port=chrome.runtime.connectNative(NATIVE_HOST);
   port.onMessage.addListener(message=>{if(done)return;done=true;clearTimeout(timer);port.disconnect();resolve(message)});
   port.onDisconnect.addListener(()=>{if(done)return;done=true;clearTimeout(timer);reject(new Error(chrome.runtime.lastError?.message||"Native host desconectado."))});
   port.postMessage({type:"get-policy"});
  }catch(error){clearTimeout(timer);reject(error)}
 });
}
async function refreshPolicy(){
 try{await applyState(await readNativePolicy())}
 catch(error){
  // O bloqueio por ausência de política é necessário no modo B.
  try{const state=await readNativePolicy();if(state?.installMode==="certificate-and-web")await replaceRules(blockAll());else await replaceRules([])}
  catch{const rules=await currentRules();if(rules.length)await replaceRules(blockAll())}
  console.warn("AGENTE COSTALOG: falha ao atualizar política.",error);
 }
}
chrome.runtime.onInstalled.addListener(()=>{chrome.alarms.create("costalog-policy-refresh",{periodInMinutes:1});refreshPolicy()});
chrome.runtime.onStartup.addListener(refreshPolicy);
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==="costalog-policy-refresh")refreshPolicy()});
refreshPolicy();
