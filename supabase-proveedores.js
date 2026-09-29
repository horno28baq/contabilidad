/* HORNO 28 | PROVEEDORES - Supabase module
   Requires: supabase-config.js + supabase-auth.js
   Uses: window.horno28Supabase
*/
(() => {
  'use strict';
  const DB = () => window.horno28Supabase;
  const businessId = () => window.HORNO28_CURRENT_BUSINESS_ID || null;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const money = v => '$' + Math.round(Number(v || 0)).toLocaleString('es-CO');
  const parseMoney = v => {
    const n = String(v ?? '').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.');
    const x = Number(n);
    return Number.isFinite(x) ? x : 0;
  };
  const fmtInput = v => Math.round(Number(v || 0)).toLocaleString('es-CO');

  let suppliers = [];
  let selectedSupplierId = null;
  let selectedProductId = null;
  let editingSupplierId = null;
  let editingProductId = null;

  function notify(msg,type='success') {
    if (typeof window.showNotification === 'function') window.showNotification(msg,type);
    else (type === 'error' ? console.error : console.log)(msg);
  }
  function requireBusiness() {
    if (!businessId()) { notify('Inicia sesión para gestionar proveedores.','error'); return false; }
    if (!DB()) { notify('Supabase todavía no está disponible.','error'); return false; }
    return true;
  }

  function ensureUI() {
    const nav = document.querySelector('header nav');
    if (nav && !document.getElementById('nav-suppliers')) nav.insertAdjacentHTML('beforeend',
      `<button onclick="window.HORNO28_PROVIDERS.open()" id="nav-suppliers" class="nav-btn px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-all duration-200 text-gray-400 hover:text-white hover:bg-carbonLight"><i class="fa-solid fa-truck-field"></i><span>PROVEEDORES</span></button>`);
    const mobile = document.getElementById('mobile-menu');
    if (mobile && !document.getElementById('mobile-nav-suppliers')) mobile.insertAdjacentHTML('beforeend',
      `<button onclick="window.HORNO28_PROVIDERS.open()" id="mobile-nav-suppliers" class="w-full text-left px-3 py-2 rounded-lg text-sm font-bold flex items-center space-x-3 text-gray-300 hover:bg-carbonLight"><i class="fa-solid fa-truck-field text-f1Red"></i><span>PROVEEDORES</span></button>`);
    if (document.getElementById('tab-suppliers')) return;
    const main = document.querySelector('main'); if (!main) return;
    main.insertAdjacentHTML('beforeend', `
      <section id="tab-suppliers" class="tab-content hidden space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between bg-carbon p-6 rounded-2xl border border-carbonBorder shadow-xl">
          <div><h1 class="font-teko text-4xl sm:text-5xl font-extrabold tracking-wider text-white uppercase leading-none">PROVEEDORES <span class="text-f1Red">Y COMPRAS</span></h1><p class="text-xs text-gray-400 font-medium tracking-widest uppercase mt-1">GESTIÓN DE PROVEEDORES, PRODUCTOS, EMPAQUES, PRECIOS Y UNIDADES</p></div>
          <button onclick="window.HORNO28_PROVIDERS.newSupplier()" class="mt-4 md:mt-0 px-4 py-2 bg-f1Red hover:bg-f1RedHover text-white text-xs font-bold rounded-xl uppercase tracking-wider f1-glow"><i class="fa-solid fa-circle-plus mr-1"></i> Nuevo / Añadir nuevo</button>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-4 bg-carbon p-5 rounded-2xl border border-carbonBorder shadow-xl">
            <div class="flex items-center justify-between mb-3"><h2 class="font-teko text-2xl text-white uppercase tracking-wider">Proveedores</h2><span id="providers-count" class="text-[10px] text-gray-400"></span></div>
            <div id="providers-list" class="space-y-2 max-h-[620px] overflow-y-auto pr-1"></div>
          </div>
          <div class="lg:col-span-8 space-y-6">
            <div class="bg-carbon p-5 rounded-2xl border border-carbonBorder shadow-xl">
              <div class="flex items-center justify-between mb-4"><div><h2 id="provider-form-title" class="font-teko text-2xl text-white uppercase tracking-wider">Proveedor</h2><p class="text-[10px] text-gray-500 uppercase tracking-wider">Selecciona un proveedor para consultar sus productos.</p></div><div id="provider-edit-actions" class="hidden flex gap-2"><button onclick="window.HORNO28_PROVIDERS.saveSupplier()" class="px-3 py-1.5 bg-telemetryGreen/20 border border-telemetryGreen/40 text-telemetryGreen rounded-lg text-[10px] font-black uppercase">Guardar</button><button onclick="window.HORNO28_PROVIDERS.cancelEdit()" class="px-3 py-1.5 bg-carbonLight border border-carbonBorder text-gray-300 rounded-lg text-[10px] font-black uppercase">Cancelar</button></div></div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3"><input id="supplier-name" disabled class="md:col-span-2 bg-asphalt border border-carbonBorder rounded-xl p-3 text-sm text-white disabled:opacity-60 focus:outline-none focus:border-gold" placeholder="Nombre del proveedor"><button id="supplier-edit-btn" onclick="window.HORNO28_PROVIDERS.startEdit()" class="hidden px-4 py-2 bg-carbonLight hover:bg-carbonBorder text-gray-200 rounded-xl text-xs font-bold uppercase"><i class="fa-solid fa-pen mr-1"></i> Editar</button></div>
              <textarea id="supplier-notes" disabled class="mt-3 w-full bg-asphalt border border-carbonBorder rounded-xl p-3 text-xs text-white disabled:opacity-60 focus:outline-none focus:border-gold" rows="2" placeholder="Notas opcionales"></textarea>
            </div>
            <div class="bg-carbon p-5 rounded-2xl border border-carbonBorder shadow-xl">
              <div class="flex items-center justify-between mb-4"><div><h2 class="font-teko text-2xl text-white uppercase tracking-wider">Productos del proveedor</h2><p id="supplier-product-help" class="text-[10px] text-gray-500 uppercase tracking-wider">Selecciona un proveedor para activar la gestión de productos.</p></div><button id="supplier-add-product-btn" disabled onclick="window.HORNO28_PROVIDERS.addProductRow()" class="px-3 py-1.5 bg-gold/20 border border-gold/40 text-gold disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-[10px] font-black uppercase"><i class="fa-solid fa-plus mr-1"></i> Añadir Producto Nuevo</button></div>
              <div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="border-b border-carbonBorder text-gray-500 uppercase text-[9px]"><th class="p-2 text-left">Producto</th><th class="p-2 text-right">Precio empaque</th><th class="p-2 text-right">Cantidad</th><th class="p-2 text-center">Unidad</th><th class="p-2 text-center">Acción</th></tr></thead><tbody id="supplier-products-tbody"></tbody></table></div>
              <div class="mt-4 flex justify-end gap-2"><button id="supplier-save-products" disabled onclick="window.HORNO28_PROVIDERS.saveProducts()" class="px-4 py-2 bg-telemetryGreen/20 border border-telemetryGreen/40 text-telemetryGreen disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-xs font-black uppercase"><i class="fa-solid fa-cloud-arrow-up mr-1"></i> Guardar producto(s)</button></div>
            </div>
            <div class="flex justify-end"><button id="supplier-delete-btn" disabled onclick="window.HORNO28_PROVIDERS.deleteSupplier()" class="px-4 py-2 bg-red-900/30 hover:bg-f1Red text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-xs font-black uppercase"><i class="fa-solid fa-trash-can mr-1"></i> Eliminar permanentemente</button></div>
          </div>
        </div>
      </section>`);
  }

  function renderList() {
    const el=document.getElementById('providers-list'); if(!el)return;
    document.getElementById('providers-count').textContent=`${suppliers.length} registrados`;
    el.innerHTML=suppliers.length ? suppliers.map(s=>`<button onclick="window.HORNO28_PROVIDERS.select('${s.id}')" class="w-full text-left p-3 rounded-xl border ${s.id===selectedSupplierId?'border-f1Red bg-f1Red/10':'border-carbonBorder bg-asphalt hover:bg-carbonLight'} transition"><div class="font-bold text-white text-sm">${esc(s.name)}</div><div class="text-[10px] text-gray-500 mt-1">${esc(s.notes||'Sin notas')}</div></button>`).join('') : '<div class="p-5 text-center text-gray-500 text-xs italic">No hay proveedores registrados.</div>';
  }

  function setProviderControls(hasProvider) {
    ['supplier-add-product-btn','supplier-save-products','supplier-delete-btn'].forEach(id=>{const e=document.getElementById(id);if(e)e.disabled=!hasProvider;});
    const edit=document.getElementById('supplier-edit-btn'); if(edit)edit.classList.toggle('hidden',!hasProvider);
  }

  function clearForm() {
    selectedProductId=null; editingSupplierId=null; editingProductId=null;
    const name=document.getElementById('supplier-name'), notes=document.getElementById('supplier-notes');
    name.value=''; notes.value=''; name.disabled=true; notes.disabled=true;
    document.getElementById('provider-form-title').textContent='Proveedor';
    document.getElementById('supplier-products-tbody').innerHTML='<tr><td colspan="5" class="p-5 text-center text-gray-500 italic">Selecciona un proveedor o crea uno nuevo.</td></tr>';
    document.getElementById('provider-edit-actions').classList.add('hidden'); setProviderControls(false);
  }

  async function load() {
    if(!requireBusiness())return;
    const {data,error}=await DB().from('suppliers').select('id,business_id,name,notes,created_at,updated_at').eq('business_id',businessId()).order('name');
    if(error){notify('No se pudieron cargar los proveedores: '+error.message,'error');return;}
    suppliers=data||[];
    if(!selectedSupplierId || !suppliers.some(s=>s.id===selectedSupplierId)) selectedSupplierId=suppliers[0]?.id||null;
    renderList();
    if(selectedSupplierId) await select(selectedSupplierId); else clearForm();
  }

  async function select(id) {
    if(!requireBusiness())return;
    const s=suppliers.find(x=>x.id===id); if(!s)return;
    selectedSupplierId=id; selectedProductId=null; editingProductId=null; editingSupplierId=null; renderList();
    const name=document.getElementById('supplier-name'),notes=document.getElementById('supplier-notes');
    name.value=s.name;notes.value=s.notes||'';name.disabled=true;notes.disabled=true;
    document.getElementById('provider-form-title').textContent=s.name;document.getElementById('provider-edit-actions').classList.add('hidden');setProviderControls(true);
    const {data,error}=await DB().from('supplier_products').select('id,product_name,price,unit,package_quantity').eq('business_id',businessId()).eq('supplier_id',id).order('product_name');
    if(error){notify('No se pudieron cargar los productos: '+error.message,'error');return;}
    renderProducts(data||[]);
  }

  function renderProducts(rows) {
    const tb=document.getElementById('supplier-products-tbody');
    if(!rows.length){tb.innerHTML='<tr><td colspan="5" class="p-5 text-center text-gray-500 italic">No hay productos registrados para este proveedor.</td></tr>';return;}
    tb.innerHTML=rows.map(p=>`<tr onclick="window.HORNO28_PROVIDERS.selectProduct('${p.id}')" class="border-b border-carbonBorder/50 cursor-pointer ${p.id===selectedProductId?'bg-gold/10':''}" data-product-id="${p.id}"><td class="p-2 text-white font-semibold">${esc(p.product_name)}</td><td class="p-2 text-right text-gold font-bold">${money(p.price)}</td><td class="p-2 text-right text-gray-200">${Number(p.package_quantity??0).toLocaleString('es-CO')}</td><td class="p-2 text-center text-gray-300">${esc(p.unit)}</td><td class="p-2 text-center"><div class="flex justify-center gap-2"><button onclick="event.stopPropagation();window.HORNO28_PROVIDERS.selectProduct('${p.id}')" class="text-gold hover:text-white p-1.5" title="Seleccionar"><i class="fa-solid fa-hand-pointer"></i></button></div></td></tr>`).join('');
  }

  function addProductRow() {
    if(!selectedSupplierId && editingSupplierId!=='new'){notify('Primero selecciona o crea un proveedor.','error');return;}
    editingProductId='new-'+Date.now();
    const tb=document.getElementById('supplier-products-tbody');
    const empty=tb.querySelector('td[colspan="5"]'); if(empty)tb.innerHTML='';
    tb.insertAdjacentHTML('afterbegin',`<tr data-product-id="${editingProductId}" data-new="1" class="border-b border-gold/40 bg-gold/5"><td class="p-2"><input class="new-product-name w-full bg-asphalt border border-carbonBorder rounded-lg p-2 text-white" placeholder="Nombre del producto"></td><td class="p-2"><input inputmode="numeric" class="new-product-price supplier-money w-full bg-asphalt border border-carbonBorder rounded-lg p-2 text-white text-right" placeholder="$0"></td><td class="p-2"><input type="number" min="0.0001" step="0.01" class="new-product-qty w-full bg-asphalt border border-carbonBorder rounded-lg p-2 text-white text-right" placeholder="Cantidad"></td><td class="p-2"><select class="new-product-unit bg-asphalt border border-carbonBorder rounded-lg p-2 text-white"><option value="gr">gr</option><option value="ml">ml</option><option value="kg">kg</option><option value="unidad">unidad</option></select></td><td class="p-2 text-center"><button onclick="event.stopPropagation();window.HORNO28_PROVIDERS.saveNewProduct('${editingProductId}')" class="text-telemetryGreen hover:text-white p-2" title="Guardar producto"><i class="fa-solid fa-floppy-disk"></i></button><button onclick="event.stopPropagation();window.HORNO28_PROVIDERS.cancelNewProduct('${editingProductId}')" class="text-red-400 hover:text-f1Red p-2" title="Cancelar"><i class="fa-solid fa-xmark"></i></button></td></tr>`);
    wireMoneyInputs(); tb.querySelector(`tr[data-product-id="${editingProductId}"] .new-product-name`)?.focus();
  }

  function selectProduct(id) {
    if(!selectedSupplierId)return; selectedProductId=id; editingProductId=null; renderSelectedRowActions();
  }

  async function renderSelectedRowActions() {
    const rows=[...document.querySelectorAll('#supplier-products-tbody tr[data-product-id]')];
    rows.forEach(r=>r.classList.toggle('bg-gold/10',r.dataset.productId===selectedProductId));
    rows.forEach(r=>{const id=r.dataset.productId;if(id===selectedProductId&&!r.dataset.new) r.querySelector('td:last-child').innerHTML=`<div class="flex justify-center gap-2"><button onclick="event.stopPropagation();window.HORNO28_PROVIDERS.editProduct('${id}')" class="px-2 py-1 text-gold hover:text-white" title="Editar producto"><i class="fa-solid fa-pen"></i></button><button onclick="event.stopPropagation();window.HORNO28_PROVIDERS.removeProduct('${id}')" class="px-2 py-1 text-red-400 hover:text-f1Red" title="Eliminar producto"><i class="fa-solid fa-trash"></i></button></div>`; else if(!r.dataset.new) r.querySelector('td:last-child').innerHTML='<div class="flex justify-center"><i class="fa-solid fa-hand-pointer text-gray-600"></i></div>';});
  }

  function editProduct(id) {
    const row=document.querySelector(`#supplier-products-tbody tr[data-product-id="${CSS.escape(id)}"]`); if(!row)return;
    editingProductId=id;
    const cells=row.querySelectorAll('td');
    const productName=cells[0].textContent.trim(), price=parseMoney(cells[1].textContent), qty=cells[2].textContent.trim(), unit=cells[3].textContent.trim();
    cells[0].innerHTML=`<input class="edit-product-name w-full bg-asphalt border border-carbonBorder rounded-lg p-2 text-white" value="${esc(productName)}">`;
    cells[1].innerHTML=`<input class="edit-product-price supplier-money w-full bg-asphalt border border-carbonBorder rounded-lg p-2 text-white text-right" inputmode="numeric" value="${fmtInput(price)}">`;
    cells[2].innerHTML=`<input class="edit-product-qty w-full bg-asphalt border border-carbonBorder rounded-lg p-2 text-white text-right" type="number" min="0.0001" step="0.01" value="${qty.replace(/\./g,'').replace(',','.')}">`;
    cells[3].innerHTML=`<select class="edit-product-unit bg-asphalt border border-carbonBorder rounded-lg p-2 text-white">${['gr','ml','kg','unidad'].map(u=>`<option value="${u}" ${u===unit?'selected':''}>${u}</option>`).join('')}</select>`;
    cells[4].innerHTML=`<button onclick="event.stopPropagation();window.HORNO28_PROVIDERS.saveEditedProduct('${id}')" class="text-telemetryGreen p-2" title="Guardar"><i class="fa-solid fa-floppy-disk"></i></button><button onclick="event.stopPropagation();window.HORNO28_PROVIDERS.cancelProductEdit()" class="text-red-400 p-2" title="Cancelar"><i class="fa-solid fa-xmark"></i></button>`;
    wireMoneyInputs();
  }

  async function saveNewProduct(rowId){
    if(!selectedSupplierId){notify('Guarda primero el proveedor para poder guardar el producto individualmente.','error');return;}
    const row=document.querySelector(`#supplier-products-tbody tr[data-product-id="${CSS.escape(rowId)}"]`); if(!row)return;
    const name=row.querySelector('.new-product-name')?.value.trim(),price=parseMoney(row.querySelector('.new-product-price')?.value),qty=Number(row.querySelector('.new-product-qty')?.value),unit=row.querySelector('.new-product-unit')?.value;
    if(!name||!Number.isFinite(price)||price<0||!Number.isFinite(qty)||qty<=0){notify('Completa nombre, precio y cantidad por empaque válidos.','error');return;}
    const {error}=await DB().from('supplier_products').insert({supplier_id:selectedSupplierId,business_id:businessId(),product_name:name,price,unit,package_quantity:qty});
    if(error){notify('No se pudo guardar el producto: '+error.message,'error');return;}
    await select(selectedSupplierId);notify('Producto añadido al proveedor y guardado en Supabase.');
  }
  function cancelNewProduct(rowId){if(selectedSupplierId)select(selectedSupplierId);else document.querySelector(`#supplier-products-tbody tr[data-product-id="${CSS.escape(rowId)}"]`)?.remove();}
  function cancelProductEdit(){select(selectedSupplierId);}

  async function saveEditedProduct(id){
    const row=document.querySelector(`#supplier-products-tbody tr[data-product-id="${CSS.escape(id)}"]`); if(!row)return;
    const name=row.querySelector('.edit-product-name')?.value.trim(),price=parseMoney(row.querySelector('.edit-product-price')?.value),qty=Number(row.querySelector('.edit-product-qty')?.value),unit=row.querySelector('.edit-product-unit')?.value;
    if(!name||!Number.isFinite(price)||price<0||!Number.isFinite(qty)||qty<=0){notify('Completa nombre, precio y cantidad por empaque válidos.','error');return;}
    const {error}=await DB().from('supplier_products').update({product_name:name,price,unit,package_quantity:qty,updated_at:new Date().toISOString()}).eq('id',id).eq('business_id',businessId());
    if(error){notify('No se pudo actualizar el producto: '+error.message,'error');return;}
    await select(selectedSupplierId);notify('Producto actualizado y guardado en Supabase.');
  }

  function wireMoneyInputs(){
    document.querySelectorAll('.supplier-money').forEach(input=>{
      if(input.dataset.moneyWired)return; input.dataset.moneyWired='1';
      input.addEventListener('focus',()=>{const n=parseMoney(input.value);input.value=n?String(Math.round(n)):'';});
      input.addEventListener('input',()=>{const n=parseMoney(input.value);input.dataset.numeric=String(n);});
      input.addEventListener('blur',()=>{const n=parseMoney(input.value);input.value=n?fmtInput(n):'';});
    });
  }

  async function saveProducts(){
    // Retained for compatibility; normal product creation/editing now saves individually.
    wireMoneyInputs(); notify('Los productos nuevos y editados se guardan individualmente en Supabase.');
  }

  function newSupplier(){
    selectedSupplierId=null;selectedProductId=null;editingSupplierId='new';editingProductId=null;renderList();clearForm();
    const name=document.getElementById('supplier-name'),notes=document.getElementById('supplier-notes');
    name.disabled=false;notes.disabled=false;name.value='';notes.value='';
    document.getElementById('provider-form-title').textContent='Nuevo proveedor';
    document.getElementById('provider-edit-actions').classList.remove('hidden');
    setProviderControls(false);
    document.getElementById('supplier-add-product-btn').disabled=false;
    document.getElementById('supplier-products-tbody').innerHTML='<tr><td colspan="5" class="p-5 text-center text-gray-500 italic">Puedes añadir uno o varios productos antes de guardar el proveedor.</td></tr>';
    name.focus();
  }

  function startEdit(){
    if(!selectedSupplierId){notify('Selecciona primero un proveedor.','error');return;}
    editingSupplierId=selectedSupplierId;
    document.getElementById('supplier-name').disabled=false;document.getElementById('supplier-notes').disabled=false;document.getElementById('provider-edit-actions').classList.remove('hidden');
  }
  function cancelEdit(){if(selectedSupplierId)select(selectedSupplierId);else clearForm();}

  async function saveSupplier(){
    if(!requireBusiness())return;
    const name=document.getElementById('supplier-name').value.trim(),notes=document.getElementById('supplier-notes').value.trim();
    if(!name){notify('El nombre del proveedor es obligatorio.','error');return;}
    if(editingSupplierId==='new'){
      const rows=[...document.querySelectorAll('#supplier-products-tbody tr[data-product-id]')];
      const products=[];
      for(const row of rows){
        const productName=row.querySelector('.new-product-name')?.value.trim();
        const price=parseMoney(row.querySelector('.new-product-price')?.value);
        const qty=Number(row.querySelector('.new-product-qty')?.value);
        const unit=row.querySelector('.new-product-unit')?.value;
        if(!productName && !row.dataset.new) continue;
        if(!productName){notify('Cada producto añadido debe tener nombre.','error');return;}
        if(!Number.isFinite(price)||price<0||!Number.isFinite(qty)||qty<=0){notify('Cada producto debe tener precio y cantidad por empaque válidos.','error');return;}
        products.push({product_name:productName,price,package_quantity:qty,unit});
      }
      const {data,error}=await DB().from('suppliers').insert({business_id:businessId(),name,notes}).select().single();
      if(error){notify('No se pudo crear el proveedor: '+error.message,'error');return;}
      if(products.length){
        const {error:pe}=await DB().from('supplier_products').insert(products.map(p=>({...p,supplier_id:data.id,business_id:businessId()})));
        if(pe){await DB().from('suppliers').delete().eq('id',data.id).eq('business_id',businessId());notify('No se pudo guardar uno o más productos. El proveedor no fue creado. '+pe.message,'error');return;}
      }
      selectedSupplierId=data.id;editingSupplierId=null;await load();
      notify(products.length?`Proveedor creado con ${products.length} producto(s) y guardado en Supabase.`:'Proveedor creado. Ahora puedes añadir sus productos.');
    }else{
      const {error}=await DB().from('suppliers').update({name,notes,updated_at:new Date().toISOString()}).eq('id',selectedSupplierId).eq('business_id',businessId());
      if(error){notify('No se pudo actualizar el proveedor: '+error.message,'error');return;}
      editingSupplierId=null;await load();notify('Proveedor actualizado y guardado en Supabase.');
    }
  }

  async function removeProduct(id){
    if(!requireBusiness()||!selectedSupplierId)return;
    if(!confirm('¿Eliminar PERMANENTEMENTE este producto del proveedor?'))return;
    const {error}=await DB().from('supplier_products').delete().eq('id',id).eq('business_id',businessId()).eq('supplier_id',selectedSupplierId);
    if(error){notify('No se pudo eliminar el producto: '+error.message,'error');return;}
    selectedProductId=null;await select(selectedSupplierId);notify('Producto eliminado permanentemente.');
  }

  async function deleteSupplier(){
    if(!requireBusiness()||!selectedSupplierId){notify('Selecciona primero el proveedor que deseas borrar.','error');return;}
    const s=suppliers.find(x=>x.id===selectedSupplierId);if(!s)return;
    if(!confirm(`¿Eliminar PERMANENTEMENTE el proveedor "${s.name}" y todos sus productos? Esta acción no se puede deshacer.`))return;
    const {error}=await DB().from('suppliers').delete().eq('id',selectedSupplierId).eq('business_id',businessId());
    if(error){notify('No se pudo eliminar el proveedor: '+error.message,'error');return;}
    selectedSupplierId=null;selectedProductId=null;await load();notify('Proveedor eliminado permanentemente.');
  }

  async function open(){ensureUI();if(typeof window.switchTab==='function')window.switchTab('suppliers');else document.querySelectorAll('.tab-content').forEach(e=>e.classList.toggle('hidden',e.id!=='tab-suppliers'));await load();}
  window.HORNO28_PROVIDERS={open,load,select,newSupplier,startEdit,cancelEdit,saveSupplier,deleteSupplier,addProductRow,saveProducts,saveNewProduct,cancelNewProduct,selectProduct,editProduct,saveEditedProduct,cancelProductEdit,removeProduct};
  window.addEventListener('DOMContentLoaded',ensureUI);
})();
