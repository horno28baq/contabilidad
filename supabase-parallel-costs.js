/* HORNO 28 | COSTOS PARALELOS - Supabase module */
(() => {
  'use strict';
  const DB=()=>window.horno28Supabase;
  const businessId=()=>window.HORNO28_CURRENT_BUSINESS_ID||null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const money=v=>'$'+Math.round(Number(v||0)).toLocaleString('es-CO');
  const parseMoney=v=>{const n=String(v??'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.');const x=Number(n);return Number.isFinite(x)?x:0;};
  const fmtInput=v=>Math.round(Number(v||0)).toLocaleString('es-CO');
  let models=[],selectedId=null,editing=false,items=[];

  function notify(msg,type='success'){if(typeof window.showNotification==='function')window.showNotification(msg,type);else(type==='error'?console.error:console.log)(msg);}
  function requireBusiness(){if(!businessId()){notify('Inicia sesión para gestionar Costos Paralelos.','error');return false;}if(!DB()){notify('Supabase todavía no está disponible.','error');return false;}return true;}

  function ensureUI(){
    const nav=document.querySelector('header nav');
    if(nav&&!document.getElementById('nav-parallel-costs'))nav.insertAdjacentHTML('beforeend',`<button onclick="window.HORNO28_PARALLEL.open()" id="nav-parallel-costs" class="nav-btn px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-all duration-200 text-gray-400 hover:text-white hover:bg-carbonLight"><i class="fa-solid fa-calculator"></i><span>COSTOS PARALELOS</span></button>`);
    const mobile=document.getElementById('mobile-menu');
    if(mobile&&!document.getElementById('mobile-nav-parallel-costs'))mobile.insertAdjacentHTML('beforeend',`<button onclick="window.HORNO28_PARALLEL.open()" id="mobile-nav-parallel-costs" class="w-full text-left px-3 py-2 rounded-lg text-sm font-bold flex items-center space-x-3 text-gray-300 hover:bg-carbonLight"><i class="fa-solid fa-calculator text-f1Red"></i><span>COSTOS PARALELOS</span></button>`);
    if(document.getElementById('tab-parallel-costs'))return;
    const main=document.querySelector('main');if(!main)return;
    main.insertAdjacentHTML('beforeend',`
      <section id="tab-parallel-costs" class="tab-content hidden space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between bg-carbon p-6 rounded-2xl border border-carbonBorder shadow-xl">
          <div><h1 class="font-teko text-4xl sm:text-5xl font-extrabold tracking-wider text-white uppercase leading-none">COSTOS <span class="text-gold">PARALELOS</span></h1><p class="text-xs text-gray-400 font-medium tracking-widest uppercase mt-1">FÓRMULA PERSONALIZADA DE COSTO, MARGEN Y PRODUCCIÓN POR PRODUCTO</p></div>
          <button onclick="window.HORNO28_PARALLEL.newModel()" class="mt-4 md:mt-0 px-4 py-2 bg-f1Red hover:bg-f1RedHover text-white text-xs font-bold rounded-xl uppercase tracking-wider f1-glow"><i class="fa-solid fa-circle-plus mr-1"></i> Añadir nuevo</button>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-4 bg-carbon p-5 rounded-2xl border border-carbonBorder shadow-xl">
            <div class="flex items-center justify-between mb-3"><h2 class="font-teko text-2xl text-white uppercase tracking-wider">Productos agregados</h2><span id="parallel-count" class="text-[10px] text-gray-400"></span></div>
            <div id="parallel-model-list" class="space-y-2 max-h-[650px] overflow-y-auto pr-1"></div>
          </div>
          <div class="lg:col-span-8">
            <div class="bg-carbon p-5 rounded-2xl border border-carbonBorder shadow-xl">
              <div class="flex items-center justify-between mb-5"><div><h2 id="parallel-form-title" class="font-teko text-2xl text-white uppercase tracking-wider">Nuevo producto</h2><p class="text-[10px] text-gray-500 uppercase tracking-wider">Cada producto tiene su propia fórmula.</p></div><div id="parallel-save-actions" class="hidden flex gap-2"><button onclick="window.HORNO28_PARALLEL.saveModel()" class="px-3 py-1.5 bg-telemetryGreen/20 border border-telemetryGreen/40 text-telemetryGreen rounded-lg text-[10px] font-black uppercase">Guardar</button><button onclick="window.HORNO28_PARALLEL.cancelEdit()" class="px-3 py-1.5 bg-carbonLight border border-carbonBorder text-gray-300 rounded-lg text-[10px] font-black uppercase">Cancelar</button></div></div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="md:col-span-2"><label class="block text-[10px] text-gray-500 uppercase font-bold mb-1">Nombre del producto</label><input id="parallel-name" class="w-full bg-asphalt border border-carbonBorder rounded-xl p-3 text-sm text-white focus:outline-none focus:border-gold" placeholder="Ej. KornDog"></div>
                <div><label class="block text-[10px] text-gray-500 uppercase font-bold mb-1">Costo del producto (COP)</label><input id="parallel-product-cost" inputmode="numeric" class="parallel-money w-full bg-asphalt border border-carbonBorder rounded-xl p-3 text-sm text-white text-right focus:outline-none focus:border-gold" placeholder="$0"></div>
                <div><label class="block text-[10px] text-gray-500 uppercase font-bold mb-1">Ganancia (%)</label><input id="parallel-profit-percent" type="number" min="0" step="0.01" class="w-full bg-asphalt border border-carbonBorder rounded-xl p-3 text-sm text-white text-right focus:outline-none focus:border-gold" value="50"></div>
              </div>

              <div class="mt-6 p-4 rounded-2xl border border-gold/30 bg-gold/5">
                <div class="flex items-center justify-between mb-3"><div><h3 class="font-teko text-xl text-white uppercase tracking-wider">PVP / Precio de venta</h3><p class="text-[10px] text-gray-500">Se calcula automáticamente: costo + porcentaje de ganancia.</p></div><span id="parallel-pvp" class="font-teko text-3xl text-gold font-bold">$0</span></div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"><div class="bg-asphalt rounded-xl p-3 border border-carbonBorder"><span class="text-gray-500 uppercase text-[9px] font-bold">Ganancia por unidad</span><div id="parallel-gain-value" class="text-telemetryGreen font-teko text-2xl">$0</div></div><div class="bg-asphalt rounded-xl p-3 border border-carbonBorder"><span class="text-gray-500 uppercase text-[9px] font-bold">Margen aplicado</span><div id="parallel-profit-label" class="text-white font-bold mt-1">0%</div></div></div>
              </div>

              <div class="mt-6 p-4 rounded-2xl border border-carbonBorder bg-asphalt">
                <div class="flex items-center justify-between mb-3"><div><h3 class="font-teko text-xl text-white uppercase tracking-wider">COSTOS FIJOS</h3><p class="text-[10px] text-gray-500">Puedes dejar o remover cualquier elemento.</p></div><button onclick="window.HORNO28_PARALLEL.addItem()" class="px-3 py-1.5 bg-gold/20 border border-gold/40 text-gold rounded-lg text-[10px] font-black uppercase"><i class="fa-solid fa-plus mr-1"></i> Añadir elemento</button></div>
                <div id="parallel-items" class="space-y-2"></div>
              </div>

              <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-asphalt rounded-2xl p-4 border border-carbonBorder"><label class="block text-[10px] text-gray-500 uppercase font-bold mb-1">TOTAL MENSUAL</label><div id="parallel-total-monthly" class="font-teko text-3xl text-white">$0</div><p class="text-[9px] text-gray-600 mt-1">Costo del producto + todos los elementos de costos fijos.</p></div>
                <div class="bg-asphalt rounded-2xl p-4 border border-carbonBorder"><label class="block text-[10px] text-gray-500 uppercase font-bold mb-1">Días trabajados al mes</label><input id="parallel-days" type="number" min="1" step="1" class="w-full bg-carbon border border-carbonBorder rounded-lg p-2.5 text-white text-right" value="24"></div>
                <div class="bg-asphalt rounded-2xl p-4 border border-carbonBorder"><label class="block text-[10px] text-gray-500 uppercase font-bold mb-1">VALOR / DÍA</label><div id="parallel-daily-target" class="font-teko text-3xl text-f1Red">$0</div><p class="text-[9px] text-gray-600 mt-1">TOTAL MENSUAL ÷ DÍAS TRABAJADOS.</p></div>
                <div class="bg-asphalt rounded-2xl p-4 border border-carbonBorder"><label class="block text-[10px] text-gray-500 uppercase font-bold mb-1">PRODUCCIÓN DIARIA REQUERIDA</label><div id="parallel-production" class="font-teko text-3xl text-telemetryGreen">0.00</div><p class="text-[9px] text-gray-600 mt-1">VALOR / DÍA ÷ GANANCIA POR UNIDAD.</p></div>
              </div>

              <div class="mt-5 flex flex-wrap justify-end gap-2"><button onclick="window.HORNO28_PARALLEL.startEdit()" id="parallel-edit-btn" class="px-4 py-2 bg-gold/20 border border-gold/40 text-gold rounded-xl text-xs font-black uppercase"><i class="fa-solid fa-pen mr-1"></i> Editar</button><button onclick="window.HORNO28_PARALLEL.deleteModel()" id="parallel-delete-btn" class="px-4 py-2 bg-red-900/30 hover:bg-f1Red text-white rounded-xl text-xs font-black uppercase"><i class="fa-solid fa-trash mr-1"></i> Borrar</button></div>
            </div>
          </div>
        </div>
      </section>`);
    wireMoneyInputs();wireRecalcInputs();
  }

  function renderList(){const el=document.getElementById('parallel-model-list');if(!el)return;document.getElementById('parallel-count').textContent=`${models.length} registrados`;el.innerHTML=models.length?models.map(m=>`<button onclick="window.HORNO28_PARALLEL.select('${m.id}')" class="w-full text-left p-3 rounded-xl border ${m.id===selectedId?'border-gold bg-gold/10':'border-carbonBorder bg-asphalt hover:bg-carbonLight'} transition"><div class="font-bold text-white text-sm">${esc(m.name)}</div><div class="text-[10px] text-gray-500 mt-1">PVP ${money(m.pvp)}</div></button>`).join(''):'<div class="p-5 text-center text-gray-500 text-xs italic">No hay productos guardados. Pulsa “Añadir nuevo”.</div>';}

  function readForm(){return{name:document.getElementById('parallel-name').value.trim(),product_cost:parseMoney(document.getElementById('parallel-product-cost').value),days_worked:Number(document.getElementById('parallel-days').value||0),profit_percent:Number(document.getElementById('parallel-profit-percent').value||0)};}
  function calculate(){const f=readForm();const itemsTotal=items.reduce((a,i)=>a+Number(i.amount||0),0);const totalMonthly=f.product_cost+itemsTotal;const daily=f.days_worked>0?totalMonthly/f.days_worked:0;const gain=f.product_cost*(f.profit_percent/100);const pvp=f.product_cost+gain;const production=gain>0?daily/gain:0;return{f,itemsTotal,totalMonthly,daily,gain,pvp,production};}
  function recalculate(){const c=calculate();const pvp=document.getElementById('parallel-pvp');if(!pvp)return;pvp.textContent=money(c.pvp);document.getElementById('parallel-total-monthly').textContent=money(c.totalMonthly);document.getElementById('parallel-daily-target').textContent=money(c.daily);document.getElementById('parallel-gain-value').textContent=money(c.gain);document.getElementById('parallel-production').textContent=Number.isFinite(c.production)?c.production.toFixed(2):'0.00';document.getElementById('parallel-profit-label').textContent=`${c.f.profit_percent||0}% sobre el costo`;
  }
  function wireMoneyInputs(){document.querySelectorAll('.parallel-money').forEach(input=>{if(input.dataset.wired)return;input.dataset.wired='1';input.addEventListener('focus',()=>{const n=parseMoney(input.value);input.value=n?String(Math.round(n)):'';});input.addEventListener('input',recalculate);input.addEventListener('blur',()=>{const n=parseMoney(input.value);input.value=n?fmtInput(n):'';recalculate();});});}
  function wireRecalcInputs(){['parallel-profit-percent','parallel-days'].forEach(id=>{const e=document.getElementById(id);if(e&&!e.dataset.wired){e.dataset.wired='1';e.addEventListener('input',recalculate);}});}

  function renderItems(){const box=document.getElementById('parallel-items');if(!box)return;if(!items.length){box.innerHTML='<div class="p-4 rounded-xl border border-dashed border-carbonBorder text-center text-gray-600 text-xs">No hay elementos añadidos. Usa “Añadir elemento”.</div>';recalculate();return;}box.innerHTML=items.map((it,idx)=>`<div class="grid grid-cols-12 gap-2 items-center" data-item-id="${esc(it.id||'')}"><input value="${esc(it.label)}" oninput="window.HORNO28_PARALLEL.updateItem(${idx},'label',this.value)" class="col-span-7 bg-carbon border border-carbonBorder rounded-lg p-2.5 text-xs text-white" placeholder="Nombre del elemento"><input value="${fmtInput(it.amount||0)}" inputmode="numeric" onfocus="this.value=this.value.replace(/\\./g,'').replace(/,/g,'.')" oninput="window.HORNO28_PARALLEL.updateItem(${idx},'amount',this.value)" onblur="window.HORNO28_PARALLEL.formatItemMoney(this)" class="parallel-item-money col-span-4 bg-carbon border border-carbonBorder rounded-lg p-2.5 text-xs text-white text-right" placeholder="$0"><button onclick="window.HORNO28_PARALLEL.removeItem(${idx})" class="col-span-1 text-red-400 hover:text-f1Red p-2" title="Remover este elemento"><i class="fa-solid fa-trash"></i></button></div>`).join('');recalculate();}
  function formatItemMoney(input){const n=parseMoney(input.value);input.value=n?fmtInput(n):'';}
  function updateItem(index,key,value){if(!items[index])return;items[index][key]=key==='amount'?parseMoney(value):value;recalculate();}
  function addItem(){items.push({id:null,label:'Nuevo elemento',amount:0,sort_order:items.length});renderItems();const labels=document.querySelectorAll('#parallel-items input');labels[labels.length-2]?.focus();}
  function removeItem(index){if(index<0||index>=items.length)return;items.splice(index,1);items.forEach((x,i)=>x.sort_order=i);renderItems();}

  function clearForm(){document.getElementById('parallel-name').value='';document.getElementById('parallel-product-cost').value='';document.getElementById('parallel-days').value='24';document.getElementById('parallel-profit-percent').value='50';document.getElementById('parallel-form-title').textContent='Nuevo producto';document.getElementById('parallel-save-actions').classList.add('hidden');items=[];renderItems();}

  async function load(){if(!requireBusiness())return;const {data,error}=await DB().from('parallel_costs').select('id,name,pvp,product_cost,days_worked,profit_percent,created_at,updated_at').eq('business_id',businessId()).order('name');if(error){notify('No se pudieron cargar los Costos Paralelos: '+error.message,'error');return;}models=data||[];if(selectedId&&models.some(m=>m.id===selectedId))await select(selectedId);else if(models.length)await select(models[0].id);else{selectedId=null;editing=false;clearForm();}renderList();}

  async function select(id){if(!requireBusiness())return;const m=models.find(x=>x.id===id);if(!m)return;selectedId=id;editing=false;renderList();document.getElementById('parallel-name').value=m.name;document.getElementById('parallel-product-cost').value=fmtInput(m.product_cost);document.getElementById('parallel-days').value=m.days_worked;document.getElementById('parallel-profit-percent').value=m.profit_percent;document.getElementById('parallel-form-title').textContent=m.name;document.getElementById('parallel-save-actions').classList.add('hidden');const {data,error}=await DB().from('parallel_cost_items').select('id,label,amount,sort_order').eq('business_id',businessId()).eq('parallel_cost_id',id).order('sort_order').order('created_at');if(error){notify('No se pudieron cargar los elementos de costo: '+error.message,'error');return;}items=(data||[]).map(x=>({...x,amount:Number(x.amount||0)}));renderItems();wireMoneyInputs();wireRecalcInputs();}

  function newModel(){selectedId=null;editing=true;clearForm();renderList();document.getElementById('parallel-save-actions').classList.remove('hidden');document.getElementById('parallel-edit-btn').disabled=true;document.getElementById('parallel-delete-btn').disabled=true;document.getElementById('parallel-name').focus();}
  function startEdit(){if(!selectedId){notify('Selecciona primero un producto.','error');return;}editing=true;document.getElementById('parallel-save-actions').classList.remove('hidden');document.getElementById('parallel-form-title').textContent='Editar producto';document.getElementById('parallel-name').focus();}
  function cancelEdit(){if(selectedId)select(selectedId);else{editing=false;clearForm();document.getElementById('parallel-edit-btn').disabled=false;document.getElementById('parallel-delete-btn').disabled=false;}}

  async function saveModel(){if(!requireBusiness())return;const f=readForm();const c=calculate();if(!f.name){notify('El nombre del producto es obligatorio.','error');return;}if(f.product_cost<0||f.days_worked<=0||f.profit_percent<0){notify('Revisa costo, días y porcentaje de ganancia.','error');return;}for(const it of items){if(!String(it.label||'').trim()){notify('Todos los elementos de costos fijos deben tener nombre.','error');return;}if(Number(it.amount)<0){notify('Los valores de costos no pueden ser negativos.','error');return;}}
    let modelId=selectedId;
    const payload={business_id:businessId(),name:f.name,pvp:c.pvp,product_cost:f.product_cost,days_worked:f.days_worked,profit_percent:f.profit_percent};
    if(!modelId){const {data,error}=await DB().from('parallel_costs').insert(payload).select().single();if(error){notify('No se pudo crear el producto: '+error.message,'error');return;}modelId=data.id;}
    else{const {error}=await DB().from('parallel_costs').update({...payload,updated_at:new Date().toISOString()}).eq('id',modelId).eq('business_id',businessId());if(error){notify('No se pudo actualizar el producto: '+error.message,'error');return;}const d=await DB().from('parallel_cost_items').delete().eq('parallel_cost_id',modelId).eq('business_id',businessId());if(d.error){notify('No se pudieron reemplazar los costos fijos: '+d.error.message,'error');return;}}
    if(items.length){const payloadItems=items.map((it,i)=>({parallel_cost_id:modelId,business_id:businessId(),label:String(it.label).trim(),amount:Number(it.amount||0),sort_order:i}));const {error}=await DB().from('parallel_cost_items').insert(payloadItems);if(error){notify('El producto se guardó pero hubo un error guardando sus costos: '+error.message,'error');return;}}
    selectedId=modelId;editing=false;await load();document.getElementById('parallel-edit-btn').disabled=false;document.getElementById('parallel-delete-btn').disabled=false;notify('Producto y fórmula guardados automáticamente en Supabase.');
  }

  async function deleteModel(){if(!requireBusiness()||!selectedId){notify('Selecciona primero el producto que deseas borrar.','error');return;}const m=models.find(x=>x.id===selectedId);if(!m)return;if(!confirm(`¿Eliminar PERMANENTEMENTE la fórmula de "${m.name}"? Esta acción no se puede deshacer.`))return;const {error}=await DB().from('parallel_costs').delete().eq('id',selectedId).eq('business_id',businessId());if(error){notify('No se pudo borrar el producto: '+error.message,'error');return;}selectedId=null;await load();notify('Producto de Costos Paralelos eliminado permanentemente.');}
  async function open(){ensureUI();if(typeof window.switchTab==='function')window.switchTab('parallel-costs');else document.querySelectorAll('.tab-content').forEach(e=>e.classList.toggle('hidden',e.id!=='tab-parallel-costs'));await load();}
  window.HORNO28_PARALLEL={open,load,select,newModel,startEdit,cancelEdit,saveModel,deleteModel,addItem,removeItem,updateItem,recalculate,formatItemMoney};
  window.addEventListener('DOMContentLoaded',ensureUI);
})();
