// HIPER PERFORMANCE 1.2 — public application. No copyrighted program content is embedded here.
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TYPES = ['total', 'por halter', 'por lado', 'peso corporal'];
const letter = number => 'ABCD'[number % 4];
const phase = number => Math.floor(number / 20) + 1;
const week = number => Math.floor(number / 5) + 1;
const localDate = () => { const now = new Date(); return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-'); };
const groups = {A:'Peito, Ombro e Tríceps',B:'Pernas',C:'Costas e Bíceps',D:'Ombros, Femorais e Panturrilha'};
const storeName = 'hiper-performance-homologacao';
const db = await new Promise((resolve,reject) => {
  const request = indexedDB.open(storeName, 2);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains('state')) database.createObjectStore('state');
    if (!database.objectStoreNames.contains('programs')) database.createObjectStore('programs');
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
function dbRead(store, key) {
  return new Promise((resolve,reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function writeAtomically(entries) {
  return new Promise((resolve,reject) => {
    const stores = [...new Set(entries.map(e => e.store))];
    const transaction = db.transaction(stores, 'readwrite');
    entries.forEach(({store,key,value}) => transaction.objectStore(store).put(structuredClone(value),key));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || Error('Falha no banco'));
    transaction.onabort = () => reject(transaction.error || Error('Transação cancelada'));
  });
}
const initialState = () => ({version:1,start:'',sessions:[],active:null,rest:90});
let state = await dbRead('state','main') || initialState();
let program = await dbRead('programs','private') || null;
let activeTab='Início';
let saveQueue=Promise.resolve();
const main=$('#main');
function queueWrite(entries) {
  const snapshots=entries.map(item=>({...item,value:structuredClone(item.value)}));
  const pending=saveQueue.then(()=>writeAtomically(snapshots));
  saveQueue=pending.catch(error=>{console.error('Falha ao salvar:',error);showStorageError();});
  return pending;
}
function persist(){return queueWrite([{store:'state',key:'main',value:state}]);}
function showStorageError(){let notice=$('#storage-error');if(notice)return;notice=document.createElement('aside');notice.id='storage-error';notice.className='notice';notice.setAttribute('role','alert');notice.textContent='Falha ao salvar localmente. Confira o espaço disponível e faça um backup.';document.body.prepend(notice);}
function isObject(x){return !!x && typeof x === 'object' && !Array.isArray(x);}
function checkProgram(p) {
  if (!isObject(p) || !Array.isArray(p.phases) || p.phases.length !== 4) throw Error('O programa precisa conter quatro fases.');
  const counts=[8,6,7,7];
  p.phases.forEach((ph,i)=>{
    if (ph.id !== i+1 || typeof ph.validated!=='boolean' || !isObject(ph.workouts)) throw Error('Fase inválida: '+(i+1));
    const letters=Object.keys(ph.workouts);
    if (letters.some(l=>!['A','B','C','D'].includes(l))) throw Error('Nome de ficha inválido.');
    if (ph.validated && letters.length !== 4) throw Error('A fase validada precisa conter A, B, C e D.');
    if (i===0 && !ph.validated) throw Error('A Fase 01 precisa estar validada.');
    for (const [code,exercises] of Object.entries(ph.workouts)) {
      if (!Array.isArray(exercises) || !exercises.length || exercises.length>60) throw Error('Ficha vazia/inválida: '+code);
      if (i===0 && exercises.length!==counts['ABCD'.indexOf(code)]) throw Error('A Fase 01 está incompleta.');
      exercises.forEach(ex=>{
        if (!isObject(ex) || typeof ex.name!=='string' || !ex.name.trim() || ex.name.length>300 || !Number.isInteger(ex.page) || ex.page<1 || ex.page>10000 || !Array.isArray(ex.equipment) || !ex.equipment.length || ex.equipment.some(x=>typeof x!=='string'||!x.trim()||x.length>100) || !Array.isArray(ex.sets) || !ex.sets.length || ex.sets.length>50) throw Error('Prescrição de exercício inválida.');
        if (ex.video !== undefined && ex.video !== '' && (!isValidVideo(ex.video))) throw Error('Link de vídeo inválido.');
        ex.sets.forEach(s=>{
          if (!isObject(s)||typeof s.type!=='string'||!s.type.trim()||s.type.length>120||typeof s.reps!=='string'||s.reps.length>120||!Array.isArray(s.blocks||[])) throw Error('Série inválida.');
          if (s.rest!==null && s.rest!==undefined && (!Number.isFinite(s.rest)||s.rest<0||s.rest>3600))throw Error('Descanso inválido.');
          if ((s.blocks||[]).some(b=>!isObject(b)||typeof b.reps!=='string')) throw Error('Bloco avançado inválido.');
        });
      });
    }
  });
  return p;
}
function isValidVideo(value){try{const u=new URL(value);return u.protocol==='https:' && ['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be'].includes(u.hostname);}catch{return false;}}
function parsePrivateFile(doc) {
  if (!isObject(doc)||doc.format!=='hiper-performance-private-program'||doc.schemaVersion!==1)throw Error('Este arquivo não é um pacote de fichas HIPER PERFORMANCE.');
  checkProgram(doc.program);
  if (!Array.isArray(doc.originalLinks)||doc.originalLinks.length!==124)throw Error('O catálogo original de links está incompleto.');
  const rows=new Map();
  for(const item of doc.originalLinks){if(!isObject(item)||!Number.isInteger(item.pagina)||!Number.isInteger(item.linha_na_pagina)||!isValidVideo(item.url))throw Error('O catálogo de vídeos possui um endereço inválido.');const key=item.pagina+':'+item.linha_na_pagina;if(rows.has(key))throw Error('Link duplicado na mesma linha.');rows.set(key,item.url);}
  for(const ph of doc.program.phases)for(const exercises of Object.values(ph.workouts))for(const e of exercises)if(e.video && rows.get(e.page+':'+e.row)!==e.video)throw Error('Link sem correspondência na página '+e.page+'.');
  return doc;
}
function validateState(x, p) {
  if (!isObject(x) || x.version!==1 || typeof x.start!=='string'||!Number.isFinite(x.rest)||x.rest<0||x.rest>3600||!Array.isArray(x.sessions)||x.sessions.length>80)return false;
  function validSession(s,n,isComplete) {
    const expected=p.phases[phase(n)-1]?.workouts?.[letter(n)];
    if (!isObject(s)||s.n!==n||typeof s.id!=='string'||typeof s.date!=='string'||!Array.isArray(expected)||!Array.isArray(s.exercises)||s.exercises.length!==expected.length)return false;
    if (!isComplete && (!Number.isInteger(s.index)||s.index<0||s.index>=s.exercises.length))return false;
    return s.exercises.every(ex=>{
      if(!isObject(ex)||typeof ex.name!=='string'||typeof ex.chosen!=='string'||typeof ex.unit!=='string'||!Array.isArray(ex.sets)||!Array.isArray(ex.records)||ex.sets.length!==ex.records.length||!ex.sets.length)return false;
      if(ex.skipped===true)return true;
      return ex.records.every(r=>isObject(r)&&typeof r.done==='boolean'&&(!isComplete||r.done)&&(!r.done||(r.kg!==''&&Number.isFinite(+r.kg)&&+r.kg>=0&&Number.isInteger(+r.reps)&&+r.reps>0)));
    });
  }
  if(!x.sessions.every((s,n)=>validSession(s,n,true)))return false;
  if(x.active&&!validSession(x.active,x.sessions.length,false))return false;
  return true;
}
async function importFichas(file) {
  if (!file) return;
  try {
    const candidate=parsePrivateFile(JSON.parse(await file.text()));
    if (program && !confirm('As fichas já estão instaladas. Deseja substituí-las por uma nova versão validada? O histórico será preservado.'))return;
    // Do not remove a phase that is already represented in an existing training session.
    if (!validateState(state,candidate.program))throw Error('As novas fichas não são compatíveis com o histórico ou a sessão em andamento. Nenhum dado foi alterado.');
    await queueWrite([{store:'programs',key:'private',value:candidate}]);
    program=candidate;
    render();
    alert('Fichas importadas e armazenadas neste aparelho. Nas próximas aberturas não será necessário importar novamente.');
  } catch(error){alert('Importação não realizada: '+error.message);}
}
function downloadJson(data,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function exportBackup(){try{await saveQueue;downloadJson({format:'hiper-performance-backup',schemaVersion:2,createdAt:new Date().toISOString(),state:structuredClone(state),privateProgram:structuredClone(program)},'hiper-performance-homologacao-backup-'+localDate()+'.json');}catch(error){alert('Não foi possível exportar o backup: '+error.message)}}
async function restoreBackup(file){if(!file)return;try{const doc=JSON.parse(await file.text());let nextState,nextProgram;
  if(isObject(doc)&&doc.format==='hiper-performance-backup'&&doc.schemaVersion===2){nextState=doc.state;nextProgram=doc.privateProgram;parsePrivateFile(nextProgram);}else if(isObject(doc)&&doc.version===1){if(!program)throw Error('Importe primeiro as fichas privadas antes de restaurar um backup antigo.');nextState=doc;nextProgram=program;}else throw Error('Formato de backup não reconhecido.');
  if(!validateState(nextState,nextProgram.program))throw Error('Histórico do backup inválido ou incompatível com as fichas.');
  if(!confirm('Restaurar o backup e SUBSTITUIR integralmente fichas e registros deste dispositivo? Esta ação não pode ser desfeita sem outro backup.'))return;
  await queueWrite([{store:'state',key:'main',value:nextState},{store:'programs',key:'private',value:nextProgram}]);
  state=nextState;program=nextProgram;activeTab='Início';render();alert('Backup restaurado com sucesso.');
}catch(error){alert('Restauração não realizada. Dados anteriores mantidos. '+error.message)}}
function next(){return state.sessions.length;}
function sessionStatus(s){return s.exercises.every(ex=>!ex.skipped&&ex.records.every(r=>r.done))?'Completo':'Parcial';}
async function resetCycle(){
 if(!confirm('Reiniciar o programa? Todos os treinos e a sessão em andamento serão apagados. Fichas e preferencias serão mantidas. Exporte um backup antes.'))return;
 const candidate={...state,sessions:[],active:null};
 try{await queueWrite([{store:'state',key:'main',value:candidate}]);state=candidate;activeTab='Início';render();}catch(e){alert('Falha ao reiniciar.');}
}
async function deleteLast(){
 if(state.active){alert('Existe uma sessão em andamento. Reinicie o ciclo ou finalize a sessão antes.');return;}
 if(!state.sessions.length||!confirm('Excluir o último treino e retornar a etapa correspondente?'))return;
 const candidate={...state,sessions:state.sessions.slice(0,-1)};
 try{await queueWrite([{store:'state',key:'main',value:candidate}]);state=candidate;render();}catch(e){alert('Falha ao excluir.');}
}
function ready(n){return n<80&&!!program?.program.phases[phase(n)-1]?.validated&&!!program.program.phases[phase(n)-1]?.workouts[letter(n)];}
function nav(){ $('#nav').innerHTML=['Início','Treinar','Histórico','Evolução'].map(t=>`<button type="button" class="${t===activeTab?'active':''}" data-tab="${t}">${t}</button>`).join('');document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;render()})}
function render(){nav();if(activeTab==='Início')home();if(activeTab==='Treinar')train();if(activeTab==='Histórico')history();if(activeTab==='Evolução')evolution()}
function importWidget(){return `<section class="import-panel"><h2>Importar fichas privadas</h2><p class="tip">Selecione o arquivo <b>HIPER-PERFORMANCE-FICHAS.json</b>. Ele será guardado apenas neste dispositivo, no IndexedDB. Não é necessário publicar o arquivo nem importá-lo novamente a cada treino.</p><input id="private-import" type="file" accept=".json,application/json" aria-label="Selecionar fichas privadas"><p class="tip">Para começar, importe as fichas uma única vez.</p></section>`;}
function bindImport(){const el=$('#private-import');if(el)el.onchange=async()=>{await importFichas(el.files?.[0]);el.value='';}}
function home(){const n=next();if(!program){main.innerHTML='<h1>Meu treinamento</h1>'+importWidget()+'<section><p class="tip">Você pode instalar o aplicativo na tela inicial. Nenhuma ficha ou link está incluído nos arquivos públicos.</p></section>';bindImport();return}
  const active=!!state.active;const blocked=!ready(n);
  main.innerHTML=`<h1>Meu treinamento</h1><section><small>FASE ${Math.min(4,phase(n))} • SEMANA ${Math.min(16,week(n))}</small><h1>${n>=80?'Programa concluído':'Treino '+letter(n)}</h1><p>${n>=80?'':esc(groups[letter(n)])}</p><button type="button" id="start" class="primary" ${(!active&&blocked)?'disabled':''}>${active?'CONTINUAR TREINO':'INICIAR TREINO'}</button>${blocked&&n<80?'<p class="warn">Próxima fase bloqueada até validação e importação de nova ficha.</p>':''}</section><section><p>Progresso geral: ${n}/80</p><progress max="80" value="${n}"></progress><p>Semana atual: ${n%5}/5</p><progress max="5" value="${n%5}"></progress></section><section><label>Data de início<input id="date" type="date" value="${esc(state.start)}"></label><label>Descanso pessoal em segundos (quando não prescrito)<input id="rest" type="number" min="0" max="3600" value="${state.rest}"></label><p class="tip">Fichas privadas salvas neste aparelho. Novas versões do aplicativo não exigirão nova importação.</p></section>`;
  $('#date').onchange=async event=>{state.start=event.target.value;await persist()};
  $('#rest').onchange=async event=>{const v=Number(event.target.value);state.rest=Number.isFinite(v)?Math.max(0,Math.min(3600,Math.round(v))):90;await persist()};
  $('#start').onclick=begin;
}
async function begin(){if(state.active){activeTab='Treinar';render();return}const n=next();if(!ready(n)){alert('Esta fase ainda não foi validada/importada.');return}
  const workout=program.program.phases[phase(n)-1].workouts[letter(n)];
  state.active={id:crypto.randomUUID(),n,date:localDate(),index:0,restUntil:0,exercises:structuredClone(workout).map(ex=>({...ex,chosen:ex.equipment[0],unit:'total',skipped:false,records:ex.sets.map(()=>({kg:'',reps:'',done:false}))}))};
  if(!state.start)state.start=localDate();await persist();activeTab='Treinar';render();
}
function previous(ex,index){const target=ex.sets[index],sameIndex=ex.sets.slice(0,index+1).filter(s=>s.type===target.type).length-1;
  for(const session of [...state.sessions].reverse())for(const old of session.exercises){if(old.skipped||old.name!==ex.name||old.chosen!==ex.chosen||old.unit!==ex.unit)continue;
    const positions=old.sets.map((s,i)=>s.type===target.type?i:-1).filter(i=>i>=0);const ix=positions[sameIndex];if(ix!==undefined&&old.records[ix]?.done)return old.records[ix];
  }return null;
}
function seriesColor(type){if(type.startsWith('Feeder Set 1'))return '#eac34d';if(type.startsWith('Feeder'))return '#ef973d';if(type.startsWith('Working')||type.startsWith('Cluster'))return '#d65d55';if(type==='Back-off'||type.startsWith('Drop'))return '#8254b6';return '#999';}
function exerciseDone(ex){return ex.skipped===true||ex.records.every(r=>r.done)}
function restTick(){const el=$('#clock');if(!el||!state.active)return;const seconds=Math.max(0,Math.ceil(((state.active.restUntil||0)-Date.now())/1000));el.textContent=seconds?`Descanso: ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Descanso pronto';}
setInterval(restTick,250);
function train(){if(!program){main.innerHTML=importWidget();bindImport();return}
  const a=state.active;
  if(!a){main.innerHTML=`<section><p>Nenhuma sessão em andamento.</p><button id="begin" class="primary" ${!ready(next())?'disabled':''}>Iniciar próximo treino</button>${!ready(next())&&next()<80?'<p class="warn">Fase ainda bloqueada.</p>':''}</section>`;$('#begin').onclick=begin;return}
  const ex=a.exercises[a.index];const completed=a.exercises.filter(exerciseDone).length;const performed=a.exercises.filter(x=>!x.skipped&&x.records.every(r=>r.done)).length;const safeLink=isValidVideo(ex.video)?`<a href="${esc(ex.video)}" target="_blank" rel="noopener noreferrer">▶ Abrir vídeo original (não verificado)</a>`:'<span class="warn">Vídeo não cadastrado</span>';
  main.innerHTML=`<small>SEMANA ${week(a.n)} • TREINO ${letter(a.n)} • ${performed}/${a.exercises.length} realizados • ${completed}/${a.exercises.length} resolvidos</small><progress max="${a.exercises.length}" value="${completed}"></progress><div class="timer"><span id="clock">Descanso pronto</span><button id="stop" class="slim" type="button">Parar</button></div><h1>${esc(ex.name)}</h1><small>Exercício ${a.index+1} de ${a.exercises.length} • PDF p. ${esc(ex.page)}</small><p>${safeLink}</p><section><label>Equipamento<select id="equipment">${[...new Set([...ex.equipment,ex.chosen])].map(x=>`<option value="${esc(x)}" ${x===ex.chosen?'selected':''}>${esc(x)}</option>`).join('')}</select></label><label>Identificação adicional do equipamento<input id="custom" value="${esc(ex.chosen)}"></label><label>Tipo de carga<select id="unit">${TYPES.map(x=>`<option ${x===ex.unit?'selected':''}>${x}</option>`).join('')}</select></label></section>${ex.sets.map((s,i)=>{
    const record=ex.records[i],prior=previous(ex,i);const blocks=Array.isArray(s.blocks)?s.blocks:[];
    return `<section class="set ${record.done?'done':''}" style="border-left-color:${seriesColor(s.type)}"><b>${esc(s.type)} · ${esc(s.reps)} reps</b><small>Anterior: ${prior?esc(prior.kg)+' kg / '+esc(prior.reps)+' reps':'sem registro'}</small>${blocks.length?`<p class="tip">Blocos prescritos: ${blocks.map(b=>esc(b.reps)).join(' · ')}</p>`:''}<div class="row"><label>Carga kg<input data-kg="${i}" type="number" min="0" step="any" value="${esc(record.kg)}" ${record.done?'disabled':''}></label><label>Repetições<input data-reps="${i}" type="number" min="1" step="1" value="${esc(record.reps)}" ${record.done?'disabled':''}></label></div><div class="row"><button type="button" data-copy="${i}" ${!prior||record.done?'disabled':''}>Carga anterior</button><button type="button" data-done="${i}">${record.done?'Corrigir':'Confirmar série'}</button></div></section>`;}).join('')}<button id="advance" class="primary" type="button">${exerciseDone(ex)?'Próximo exercício':'Pular temporariamente'}</button><label>Ir para exercício<select id="jump">${a.exercises.map((x,i)=>`<option value="${i}" ${i===a.index?'selected':''}>${i+1}. ${esc(x.name)} ${x.skipped?'— dispensado':exerciseDone(x)?'✓':'•'}</option>`).join('')}</select></label><section class="advanced"><label><input id="skipped" type="checkbox" ${ex.skipped?'checked':''} style="width:auto"> Marcar este exercício como não realizado</label><p class="tip">Pular temporariamente não marca como realizado. Use esta opção somente se decidir não executar o exercício nesta sessão.</p></section><button id="finish" class="primary" ${completed!==a.exercises.length?'disabled':''}>Finalizar treino</button>`;
  $('#equipment').onchange=async event=>{ex.chosen=event.target.value;await persist();render()};
  $('#custom').onchange=async event=>{ex.chosen=event.target.value.trim()||ex.equipment[0];await persist();render()};
  $('#unit').onchange=async event=>{ex.unit=event.target.value;await persist();render()};
  ['kg','reps'].forEach(field=>document.querySelectorAll(`[data-${field}]`).forEach(input=>input.oninput=()=>{ex.records[+input.dataset[field]][field]=input.value;void persist()}));
  document.querySelectorAll('[data-copy]').forEach(button=>button.onclick=async()=>{const i=+button.dataset.copy;const prior=previous(ex,i);if(!prior)return;ex.records[i].kg=prior.kg;await persist();render()});
  document.querySelectorAll('[data-done]').forEach(button=>button.onclick=async()=>{const i=+button.dataset.done;const r=ex.records[i];if(!r.done && (r.kg===''||!Number.isFinite(+r.kg)||+r.kg<0||!Number.isInteger(+r.reps)||+r.reps<1)){alert('Informe carga e repetições válidas.');return}
    r.done=!r.done;if(r.done){ex.skipped=false;const s=ex.sets[i];a.restUntil=Date.now()+1000*(s.rest??state.rest)}await persist();render();
  });
  $('#advance').onclick=async()=>{a.index=(a.index+1)%a.exercises.length;await persist();render()};
  $('#jump').onchange=async event=>{a.index=+event.target.value;await persist();render()};
  $('#skipped').onchange=async event=>{ex.skipped=event.target.checked;await persist();render()};
  $('#stop').onclick=async()=>{a.restUntil=0;await persist();restTick()};
  $('#finish').onclick=async()=>{if(!a.exercises.every(exerciseDone))return;state.sessions.push(structuredClone(a));state.active=null;await persist();activeTab='Início';render()};
  restTick();
}
function history(){main.innerHTML=`<h1>Histórico</h1><section><h2>Gestão do programa</h2><p>Completos: ${state.sessions.filter(s=>sessionStatus(s)==='Completo').length} · Parciais: ${state.sessions.filter(s=>sessionStatus(s)==='Parcial').length}</p><button id="delete-last" ${!state.sessions.length||state.active?'disabled':''}>Excluir último treino</button><p class="tip">Somente o último treino pode ser excluído para preservar a sequência.</p><button id="reset-cycle">Reiniciar programa</button><p class="tip">Exporte um backup antes. As fichas e preferências serão preservadas.</p></section><section><button type="button" id="export">Exportar backup completo (JSON)</button><label>Restaurar backup<input id="restore" type="file" accept=".json,application/json"></label><p class="tip">O backup inclui fichas privadas, links originais, histórico e sessão em andamento. Guarde fora do GitHub e faça cópias regularmente.</p></section>${program?`<details class="advanced"><summary>Atualizar fichas privadas</summary>${importWidget()}</details>`:importWidget()}${state.sessions.slice().reverse().map(s=>`<section><h3>${esc(s.date)} · Treino ${letter(s.n)} · Semana ${week(s.n)} · ${sessionStatus(s)}</h3>${s.exercises.map((ex,i)=>`<details><summary>${esc(ex.name)} — ${esc(ex.chosen)}${ex.skipped?' (não realizado)':''}</summary>${ex.records.map((r,j)=>`<p>${esc(ex.sets[j].type)}: ${r.done?esc(r.kg)+' kg / '+esc(r.reps)+' reps':'não realizado'} ${r.done?`<button class="slim" data-edit="${s.n},${i},${j}">Corrigir</button>`:''}</p>`).join('')}</details>`).join('')}</section>`).join('')}`;
  $('#delete-last').onclick=deleteLast;
  $('#reset-cycle').onclick=resetCycle;
  $('#export').onclick=exportBackup;
  $('#restore').onchange=async event=>{await restoreBackup(event.target.files?.[0]);event.target.value='';};
  bindImport();
  document.querySelectorAll('[data-edit]').forEach(button=>button.onclick=async()=>{const [n,i,j]=button.dataset.edit.split(',').map(Number);const record=state.sessions[n]?.exercises[i]?.records[j];if(!record)return;const kg=prompt('Carga (kg)',record.kg);if(kg===null)return;const reps=prompt('Repetições',record.reps);if(reps===null)return;if(kg.trim()===''||!Number.isFinite(+kg)||+kg<0||!Number.isInteger(+reps)||+reps<1){alert('Valores inválidos.');return}record.kg=kg;record.reps=reps;await persist();render()});
}
function evolution(){const rows=state.sessions.flatMap(s=>s.exercises.filter(ex=>!ex.skipped).flatMap(ex=>ex.records.map((r,i)=>({key:[ex.name,ex.chosen,ex.unit,ex.sets[i].type].join(' | '),kg:+r.kg,date:s.date,done:r.done})).filter(r=>r.done)));
  const keys=[...new Set(rows.map(r=>r.key))];const today=new Date();const monday=new Date(today.getFullYear(),today.getMonth(),today.getDate()-(today.getDay()+6)%7);const wk=[monday.getFullYear(),String(monday.getMonth()+1).padStart(2,'0'),String(monday.getDate()).padStart(2,'0')].join('-');const mo=localDate().slice(0,7);
  main.innerHTML=`<h1>Evolução</h1><section>Esta semana: ${state.sessions.filter(s=>s.date>=wk&&s.date<=localDate()).length} / 5<br>Este mês: ${state.sessions.filter(s=>s.date.startsWith(mo)).length}<p>Programa: ${next()} / 80</p><progress max="80" value="${next()}"></progress></section><section><label>Exercício / equipamento / série<select id="metric">${keys.map((k,i)=>`<option value="${i}">${esc(k)}</option>`).join('')}</select></label><div id="graph"></div></section>`;
  function graph(){const selected=keys[Number($('#metric').value)];const values=rows.filter(r=>r.key===selected);if(!values.length){$('#graph').textContent='Conclua uma sessão para visualizar a evolução.';return}
    const max=Math.max(1,...values.map(r=>r.kg));const pts=values.map((r,i)=>[20+i*280/Math.max(1,values.length-1),140-r.kg/max*120]);
    $('#graph').innerHTML=`<svg viewBox="0 0 320 160" role="img" aria-label="Evolução da carga"><polyline fill="none" stroke="#62d9aa" stroke-width="3" points="${pts.map(p=>p.join(',')).join(' ')}"/>${pts.map(p=>`<circle fill="#62d9aa" cx="${p[0]}" cy="${p[1]}" r="4"/>`).join('')}</svg>${values.map(r=>`<small>${esc(r.date)}: ${r.kg} kg</small>`).join('')}`;
  }
  $('#metric').onchange=graph;graph();
}
render();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(console.error);
