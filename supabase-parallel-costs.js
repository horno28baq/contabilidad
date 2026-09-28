/* HORNO 28 | COSTOS PARALELOS - Supabase module
   Formula:
   TOTAL MENSUAL = COSTO DEL PRODUCTO + SUMA DE ELEMENTOS DE COSTO
   OBJETIVO MINIMO/DIA = TOTAL MENSUAL / DIAS TRABAJADOS
   GANANCIA POR PRODUCTO = PVP * (GANANCIA % / 100)
   PRODUCCION REQUERIDA/DIA = OBJETIVO MINIMO/DIA / GANANCIA POR PRODUCTO
*/
(() => {
  'use strict';

  const DB=()=>window.horno28Supabase;
  const businessId=()=>window.HORNO28_CURRENT_BUSINESS_ID||null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const money=v=>'$'+Number(v||0).toLocaleString('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2});

  let models=[];
  let selectedId=null;
  let editing=false;
  let items=[];

  function notify(msg,type='success'){
    if(typeof window.showNotification==='function') window.showNotification(msg,type);
    else console[type==='error'?'alert':'log'](msg);
  }
  function requireBusiness(){
    if(!businessId()){notify('Inicia sesión para gestionar Costos Paralelos.','error');return false;}
    if(!DB()){notify('Supabase todavía no está disponible.','error');return false;}
    return true;
  }

  function ensureUI(){
    const nav=document.querySelector('header nav');
    if(nav && !document.getElementById('nav-parallel-costs')){
      nav.insertAdjacentHTML('beforeend',
        `<button onclick="window.HORNO28_PARALLEL.open()" id="nav-parallel-costs" class="nav-btn px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-all duration-200 text-gray-400 hover:text-white hover:bg-carbonLight">
          <i class="fa-solid fa-calculator"></i><span>COSTOS PARALELOS</span>
        </button>`);
    }
    const mobile=document.getElementById('mobile-menu');
    if(mobile && !document.getElementById('mobile-nav-parallel-costs')){
      mobile.insertAdjacentHTML('afterbegin',
        `<button onclick="window.HORNO28_PARALLEL.open()" id="mobile-nav-parallel-costs" class="w-full text-left px-3 py-2 rounded-lg text-sm font-bold flex items-center space-x-3 text-gray-300 hover:bg-carbonLight">
          <i class="fa-solid fa-calculator text-f1Red"></i><span>COSTOS PARALELOS</span>
        </button>`);
    }
    if(document.getElementById('tab-parallel-costs')) return;
    const main=document.querySelector('main'); if(!main)return;
    main.insertAdjacentHTML('beforeend',`
      <section id="tab-parallel-costs" class="tab-content hidden space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between bg-carbon p-6 rounded-2xl border border-carbonBorder shadow-xl">
          <div>
            <h1 class="font-teko text-4xl sm:text-5xl font-extrabold tracking-wider text-white uppercase leading-none">
              COSTOS <span class="text-gold">PARALELOS</span>
            </h1>
            <p class="text-xs text-gray-400 font-medium tracking-widest uppercase mt-1">
              MODELOS DE COSTO, OBJETIVO DIARIO Y PRODUCCIÓN REQUERIDA
            </p>
          </div>
          <div class="mt-4 md:mt-0 flex gap-2">
            <button onclick="window.HORNO28_PARALLEL.newModel()" class="px-4 py-2 bg-f1Red hover:bg-f1RedHover text-white text-xs font-black rounded-xl uppercase">
              <i class="fa-solid fa-plus mr-1"></i>Añadir nuevo
            </button>
            <button onclick="window.HORNO28_PARALLEL.startEdit()" class="px-4 py-2 bg-carbonLight hover:bg-carbonBorder text-gray-200 text-xs font-black rounded-xl uppercase">
              <i class="fa-solid fa-pen mr-1"></i>Editar
            </button>
            <button onclick="window.HORNO28_PARALLEL.deleteModel()" class="px-4 py-2 bg-red-900/30 hover:bg-f1Red text-white text-xs font-black rounded-xl uppercase">
              <i class="fa-solid fa-trash mr-1"></i>Borrar
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-4 bg-carbon p-5 rounded-2xl border border-carbonBorder shadow-xl">
            <div class="flex items-center justify-between mb-3">
              <h2 class="font-teko text-2xl text-white uppercase tracking-wider">Modelos</h2>
              <span id="parallel-count" class="text-[10px] text-gray-500"></span>
            </div>
            <p class="text-[10px] text-gray-500 uppercase mb-3">Selecciona un nombre para ver sus datos.</p>
            <div id="parallel-model-list" class="space-y-2 max-h-[560px] overflow-y-auto"></div>
          </div>

          <div class="lg:col-span-8">
            <div class="bg-carbon p-5 rounded-2xl border border-carbonBorder shadow-xl">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <h2 id="parallel-form-title" class="font-teko text-2xl text-white uppercase tracking-wider">Nuevo modelo</h2>
                  <p class="text-[10px] text-gray-500 uppercase">Los campos del cálculo se actualizan automáticamente.</p>
                </div>
                <div id="parallel-save-actions" class="hidden gap-2">
                  <button onclick="window.HORNO28_PARALLEL.saveModel()" class="px-3 py-1.5 bg-telemetryGreen/20 border border-telemetryGreen/40 text-telemetryGreen rounded-lg text-[10px] font-black uppercase">Guardar</button>
                  <button onclick="window.HORNO28_PARALLEL.cancelEdit()" class="px-3 py-1.5 bg-carbonLight border border-carbonBorder text-gray-300 rounded-lg text-[10px] font-black uppercase">Cancelar</button>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label class="text-xs font-bold text-gray-400 uppercase">Nombre del producto/modelo
                  <input id="parallel-name" class="mt-1 w-full bg-asphalt border border-carbonBorder rounded-xl p-3 text-white" placeholder="Ej: KornDog">
                </label>
                <label class="text-xs font-bold text-gray-400 uppercase">PVP
                  <input id="parallel-pvp" type="number" min="0" step="0.01" oninput="window.HORNO28_PARALLEL.recalculate()" class="mt-1 w-full bg-asphalt border border-carbonBorder rounded-xl p-3 text-white" placeholder="4">
                </label>
                <label class="text-xs font-bold text-gray-400 uppercase">Costo del producto
                  <input id="parallel-product-cost" type="number" min="0" step="0.01" oninput="window.HORNO28_PARALLEL.recalculate()" class="mt-1 w-full bg-asphalt border border-carbonBorder rounded-xl p-3 text-white" placeholder="1">
                </label>
                <label class="text-xs font-bold text-gray-400 uppercase">Días trabajados / mes
                  <input id="parallel-days" type="number" min="0.01" step="0.01" oninput="window.HORNO28_PARALLEL.recalculate()" class="mt-1 w-full bg-asphalt border border-carbonBorder rounded-xl p-3 text-white" placeholder="24">
                </label>
                <label class="text-xs font-bold text-gray-400 uppercase md:col-span-2">Ganancia declarada (%)
                  <input id="parallel-profit-percent" type="number" min="0" step="0.01" oninput="window.HORNO28_PARALLEL.recalculate()" class="mt-1 w-full bg-asphalt border border-carbonBorder rounded-xl p-3 text-white" placeholder="50">
                </label>
              </div>

              <div class="mt-6 border-t border-carbonBorder pt-5">
                <div class="flex items-center justify-between mb-3">
                  <div>
                    <h3 class="font-teko text-2xl text-gold uppercase">Elementos de costo</h3>
                    <p class="text-[10px] text-gray-500 uppercase">Añade o remueve costos según el modelo.</p>
                  </div>
                  <div class="flex gap-2">
                    <button onclick="window.HORNO28_PARALLEL.addItem()" class="px-3 py-1.5 bg-gold/20 border border-gold/40 text-gold rounded-lg text-[10px] font-black uppercase">
                      <i class="fa-solid fa-plus mr-1"></i>Añadir elemento
                    </button>
                    <button onclick="window.HORNO28_PARALLEL.removeLastItem()" class="px-3 py-1.5 bg-red-900/30 border border-red-500/30 text-red-300 rounded-lg text-[10px] font-black uppercase">
                      <i class="fa-solid fa-minus mr-1"></i>Remover
                    </button>
                  </div>
                </div>
                <div id="parallel-items" class="space-y-2"></div>
              </div>

              <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="bg-asphalt p-4 rounded-xl border border-carbonBorder">
                  <span class="text-[10px] text-gray-500 font-bold uppercase">Total mensual</span>
                  <div id="parallel-total-monthly" class="font-teko text-3xl text-white font-bold">$0.00</div>
                  <span class="text-[9px] text-gray-600">Costo del producto + elementos de costo</span>
                </div>
                <div class="bg-asphalt p-4 rounded-xl border border-carbonBorder">
                  <span class="text-[10px] text-gray-500 font-bold uppercase">Objetivo mínimo / día</span>
                  <div id="parallel-daily-target" class="font-teko text-3xl text-gold font-bold">$0.00</div>
                  <span class="text-[9px] text-gray-600">Total mensual ÷ días trabajados</span>
                </div>
                <div class="bg-asphalt p-4 rounded-xl border border-carbonBorder">
                  <span class="text-[10px] text-gray-500 font-bold uppercase">Ganancia por producto</span>
                  <div id="parallel-gain-value" class="font-teko text-3xl text-telemetryGreen font-bold">$0.00</div>
                  <span id="parallel-profit-label" class="text-[9px] text-gray-600">PVP × ganancia %</span>
                </div>
                <div class="bg-f1Red/10 p-4 rounded-xl border border-f1Red/40">
                  <span class="text-[10px] text-f1Red font-bold uppercase">Producción requerida / día</span>
                  <div id="parallel-production" class="font-teko text-4xl text-white font-black">0.00</div>
                  <span class="text-[9px] text-gray-500">Objetivo diario ÷ ganancia por producto</span>
                </div>
              </div>

              <div class="mt-5 p-4 bg-carbonLight rounded-xl border border-carbonBorder">
                <p class="text-[10px] text-gray-400 uppercase font-bold">Fórmula aplicada</p>
                <p class="text-xs text-gray-300 mt-1">
                  Total mensual = costo del producto + elementos de costo ·
                  Objetivo diario = total mensual ÷ días trabajados ·
                  Ganancia = PVP × ganancia % ·
                  Producción requerida = objetivo diario ÷ ganancia por producto.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>`);
  }

  function renderList(){
    const el=document.getElementById('parallel-model-list'); if(!el)return;
    document.getElementById('parallel-count').textContent=`${models.length} registrados`;
    if(!models.length){el.innerHTML='<div class="p-5 text-center text-gray-500 text-xs italic">No hay modelos guardados. Pulsa “Añadir nuevo”.</div>';return;}
    el.innerHTML=models.map(m=>`
      <button onclick="window.HORNO28_PARALLEL.select('${m.id}')" class="w-full text-left p-3 rounded-xl border ${m.id===selectedId?'border-gold bg-gold/10':'border-carbonBorder bg-asphalt hover:bg-carbonLight'}">
        <div class="font-bold text-white text-sm">${esc(m.name)}</div>
      </button>`).join('');
  }

  function readForm(){
    return {
      name:document.getElementById('parallel-name').value.trim(),
      pvp:Number(document.getElementById('parallel-pvp').value||0),
      product_cost:Number(document.getElementById('parallel-product-cost').value||0),
      days_worked:Number(document.getElementById('parallel-days').value||0),
      profit_percent:Number(document.getElementById('parallel-profit-percent').value||0)
    };
  }

  function calculate(){
    const f=readForm();
    const itemsTotal=items.reduce((a,i)=>a+Number(i.amount||0),0);
    const totalMonthly=f.product_cost+itemsTotal;
    const daily=f.days_worked>0?totalMonthly/f.days_worked:0;
    const gain=f.pvp*(f.profit_percent/100);
    const production=gain>0?daily/gain:0;
    return {f,itemsTotal,totalMonthly,daily,gain,production};
  }

  function recalculate(){
    const c=calculate();
    document.getElementById('parallel-total-monthly').textContent=money(c.totalMonthly);
    document.getElementById('parallel-daily-target').textContent=money(c.daily);
    document.getElementById('parallel-gain-value').textContent=money(c.gain);
    document.getElementById('parallel-production').textContent=Number.isFinite(c.production)?c.production.toFixed(2):'0.00';
    document.getElementById('parallel-profit-label').textContent=`PVP × ${c.f.profit_percent || 0}%`;
  }

  function renderItems(){
    const box=document.getElementById('parallel-items'); if(!box)return;
    if(!items.length){box.innerHTML='<div class="p-4 rounded-xl border border-dashed border-carbonBorder text-center text-gray-600 text-xs">No hay elementos añadidos. Usa “Añadir elemento”.</div>';recalculate();return;}
    box.innerHTML=items.map((it,idx)=>`
      <div class="grid grid-cols-12 gap-2 items-center" data-item-id="${esc(it.id||'')}">
        <input value="${esc(it.label)}" oninput="window.HORNO28_PARALLEL.updateItem(${idx},'label',this.value)" class="col-span-7 bg-asphalt border border-carbonBorder rounded-lg p-2.5 text-xs text-white" placeholder="Nombre del elemento">
        <input type="number" min="0" step="0.01" value="${Number(it.amount||0)}" oninput="window.HORNO28_PARALLEL.updateItem(${idx},'amount',this.value)" class="col-span-4 bg-asphalt border border-carbonBorder rounded-lg p-2.5 text-xs text-white text-right" placeholder="Valor">
        <button onclick="window.HORNO28_PARALLEL.removeItem(${idx})" class="col-span-1 text-red-400 hover:text-f1Red p-2" title="Remover este elemento"><i class="fa-solid fa-trash"></i></button>
      </div>`).join('');
    recalculate();
  }

  function updateItem(index,key,value){ if(!items[index])return; items[index][key]=key==='amount'?Number(value||0):value; recalculate(); }

  function addItem(){ items.push({id:null,label:'Nuevo elemento',amount:0,sort_order:items.length}); renderItems(); }
  function removeItem(index){ if(index<0||index>=items.length)return; items.splice(index,1); items.forEach((x,i)=>x.sort_order=i); renderItems(); }
  function removeLastItem(){ if(!items.length){notify('No hay elementos para remover.','error');return;} removeItem(items.length-1); }

  function clearForm(){
    document.getElementById('parallel-name').value='';
    document.getElementById('parallel-pvp').value='';
    document.getElementById('parallel-product-cost').value='';
    document.getElementById('parallel-days').value='24';
    document.getElementById('parallel-profit-percent').value='50';
    document.getElementById('parallel-form-title').textContent='Nuevo modelo';
    document.getElementById('parallel-save-actions').classList.add('hidden');
    items=[];
    renderItems();
  }

  async function load(){
    if(!requireBusiness())return;
    const {data,error}=await DB().from('parallel_costs').select('id,name,pvp,product_cost,days_worked,profit_percent,created_at,updated_at').eq('business_id',businessId()).order('name');
    if(error){notify('No se pudieron cargar los Costos Paralelos: '+error.message,'error');return;}
    models=data||[];
    if(selectedId && models.some(m=>m.id===selectedId)) await select(selectedId);
    else if(models.length) await select(models[0].id);
    else {selectedId=null;editing=false;clearForm();}
    renderList();
  }

  async function select(id){
    if(!requireBusiness())return;
    const m=models.find(x=>x.id===id); if(!m)return;
    selectedId=id; editing=false; renderList();
    document.getElementById('parallel-name').value=m.name;
    document.getElementById('parallel-pvp').value=m.pvp;
    document.getElementById('parallel-product-cost').value=m.product_cost;
    document.getElementById('parallel-days').value=m.days_worked;
    document.getElementById('parallel-profit-percent').value=m.profit_percent;
    document.getElementById('parallel-form-title').textContent=m.name;
    document.getElementById('parallel-save-actions').classList.add('hidden');
    const {data,error}=await DB().from('parallel_cost_items').select('id,label,amount,sort_order').eq('business_id',businessId()).eq('parallel_cost_id',id).order('sort_order').order('created_at');
    if(error){notify('No se pudieron cargar los elementos de costo: '+error.message,'error');return;}
    items=(data||[]).map(x=>({...x,amount:Number(x.amount||0)}));
    renderItems();
  }

  function newModel(){
    selectedId=null; editing=true; renderList(); clearForm();
    document.getElementById('parallel-save-actions').classList.remove('hidden');
    document.getElementById('parallel-name').focus();
  }

  function startEdit(){
    if(!selectedId){notify('Selecciona primero un modelo de Costos Paralelos.','error');return;}
    editing=true;
    document.getElementById('parallel-save-actions').classList.remove('hidden');
    document.getElementById('parallel-form-title').textContent='Editar modelo';
    document.getElementById('parallel-name').focus();
  }

  function cancelEdit(){
    if(selectedId) select(selectedId);
    else {editing=false;clearForm();}
  }

  async function saveModel(){
    if(!requireBusiness())return;
    const f=readForm();
    if(!f.name){notify('El nombre del producto/modelo es obligatorio.','error');return;}
    if(f.pvp<0 || f.product_cost<0 || f.days_worked<=0 || f.profit_percent<0){notify('Revisa PVP, costo, días y porcentaje de ganancia.','error');return;}
    for(const it of items){if(!String(it.label||'').trim()){notify('Todos los elementos de costo deben tener nombre.','error');return;} if(Number(it.amount)<0){notify('Los valores de costo no pueden ser negativos.','error');return;}}
    let modelId=selectedId;
    if(!modelId){
      const {data,error}=await DB().from('parallel_costs').insert({business_id:businessId(),...f}).select().single();
      if(error){notify('No se pudo crear el modelo: '+error.message,'error');return;}
      modelId=data.id;
    }else{
      const {error}=await DB().from('parallel_costs').update({...f,updated_at:new Date().toISOString()}).eq('id',modelId).eq('business_id',businessId());
      if(error){notify('No se pudo actualizar el modelo: '+error.message,'error');return;}
      await DB().from('parallel_cost_items').delete().eq('parallel_cost_id',modelId).eq('business_id',businessId());
    }
    if(items.length){
      const payload=items.map((it,i)=>({parallel_cost_id:modelId,business_id:businessId(),label:String(it.label).trim(),amount:Number(it.amount||0),sort_order:i}));
      const {error}=await DB().from('parallel_cost_items').insert(payload);
      if(error){notify('El modelo se guardó pero hubo un error guardando sus elementos: '+error.message,'error');return;}
    }
    selectedId=modelId; editing=false;
    await load();
    notify('Costo Paralelo guardado automáticamente en Supabase.');
  }

  async function deleteModel(){
    if(!requireBusiness()||!selectedId){notify('Selecciona primero el modelo que deseas borrar.','error');return;}
    const m=models.find(x=>x.id===selectedId); if(!m)return;
    if(!confirm(`¿Eliminar PERMANENTEMENTE el modelo "${m.name}" y todos sus elementos? Esta acción no se puede deshacer.`))return;
    const {error}=await DB().from('parallel_costs').delete().eq('id',selectedId).eq('business_id',businessId());
    if(error){notify('No se pudo borrar el modelo: '+error.message,'error');return;}
    selectedId=null; await load(); notify('Modelo de Costos Paralelos eliminado permanentemente.');
  }

  async function open(){
    ensureUI();
    if(typeof window.switchTab==='function')window.switchTab('parallel-costs');
    else document.querySelectorAll('.tab-content').forEach(e=>e.classList.toggle('hidden',e.id!=='tab-parallel-costs'));
    await load();
  }

  window.HORNO28_PARALLEL={open,load,select,newModel,startEdit,cancelEdit,saveModel,deleteModel,addItem,removeItem,removeLastItem,updateItem,recalculate};
  window.addEventListener('DOMContentLoaded',ensureUI);
})();
