/* HORNO 28 | PROVEEDORES - Supabase module
   Requires: supabase-config.js + supabase-auth.js
   Uses: window.horno28Supabase
*/
(() => {
  'use strict';

  const DB = () => window.horno28Supabase;
  const businessId = () => window.HORNO28_CURRENT_BUSINESS_ID || null;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const money = (v) => '$' + Math.round(Number(v || 0)).toLocaleString('es-CO');

  let suppliers = [];
  let selectedSupplierId = null;
  let editingSupplierId = null;

  function notify(msg, type='success') {
    if (typeof window.showNotification === 'function') window.showNotification(msg, type);
    else console[type === 'error' ? 'alert' : 'log'](msg);
  }

  function requireBusiness() {
    if (!businessId()) {
      notify('Inicia sesión para gestionar proveedores.', 'error');
      return false;
    }
    if (!DB()) {
      notify('Supabase todavía no está disponible.', 'error');
      return false;
    }
    return true;
  }

  function ensureUI() {
    if (!document.getElementById('nav-suppliers')) {
      const desktop = document.querySelector('nav.nav-btn')?.parentElement || document.querySelector('header nav');
      const nav = document.querySelector('header nav');
      if (nav) {
        nav.insertAdjacentHTML('beforeend',
          `<button onclick="window.HORNO28_PROVIDERS.open()" id="nav-suppliers" class="nav-btn px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-all duration-200 text-gray-400 hover:text-white hover:bg-carbonLight">
             <i class="fa-solid fa-truck-field"></i><span>PROVEEDORES</span>
           </button>`);
      }
    }
    const mobile = document.getElementById('mobile-menu');
    if (mobile && !document.getElementById('mobile-nav-suppliers')) {
      mobile.insertAdjacentHTML('afterbegin',
        `<button onclick="window.HORNO28_PROVIDERS.open()" id="mobile-nav-suppliers" class="w-full text-left px-3 py-2 rounded-lg text-sm font-bold flex items-center space-x-3 text-gray-300 hover:bg-carbonLight">
           <i class="fa-solid fa-truck-field text-f1Red"></i><span>PROVEEDORES</span>
         </button>`);
    }
    if (!document.getElementById('tab-suppliers')) {
      const main = document.querySelector('main');
      if (!main) return;
      main.insertAdjacentHTML('beforeend', `
        <section id="tab-suppliers" class="tab-content hidden space-y-6">
          <div class="flex flex-col md:flex-row md:items-center justify-between bg-carbon p-6 rounded-2xl border border-carbonBorder shadow-xl">
            <div>
              <h1 class="font-teko text-4xl sm:text-5xl font-extrabold tracking-wider text-white uppercase leading-none">
                PROVEEDORES <span class="text-f1Red">Y COMPRAS</span>
              </h1>
              <p class="text-xs text-gray-400 font-medium tracking-widest uppercase mt-1">
                PROVEEDORES, PRODUCTOS, PRECIOS Y UNIDADES DE MEDIDA
              </p>
            </div>
            <button onclick="window.HORNO28_PROVIDERS.newSupplier()" class="mt-4 md:mt-0 px-4 py-2 bg-f1Red hover:bg-f1RedHover text-white text-xs font-bold rounded-xl uppercase tracking-wider f1-glow">
              <i class="fa-solid fa-circle-plus mr-1"></i> Nuevo / Añadir nuevo
            </button>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div class="lg:col-span-4 bg-carbon p-5 rounded-2xl border border-carbonBorder shadow-xl">
              <div class="flex items-center justify-between mb-3">
                <h2 class="font-teko text-2xl text-white uppercase tracking-wider">Proveedores</h2>
                <span id="providers-count" class="text-[10px] text-gray-400"></span>
              </div>
              <div id="providers-list" class="space-y-2 max-h-[520px] overflow-y-auto pr-1"></div>
            </div>

            <div class="lg:col-span-8 space-y-6">
              <div class="bg-carbon p-5 rounded-2xl border border-carbonBorder shadow-xl">
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <h2 id="provider-form-title" class="font-teko text-2xl text-white uppercase tracking-wider">Proveedor</h2>
                    <p class="text-[10px] text-gray-500 uppercase tracking-wider">Selecciona un proveedor o crea uno nuevo.</p>
                  </div>
                  <div id="provider-edit-actions" class="hidden flex gap-2">
                    <button onclick="window.HORNO28_PROVIDERS.saveSupplier()" class="px-3 py-1.5 bg-telemetryGreen/20 border border-telemetryGreen/40 text-telemetryGreen rounded-lg text-[10px] font-black uppercase">
                      Guardar
                    </button>
                    <button onclick="window.HORNO28_PROVIDERS.cancelEdit()" class="px-3 py-1.5 bg-carbonLight border border-carbonBorder text-gray-300 rounded-lg text-[10px] font-black uppercase">
                      Cancelar
                    </button>
                  </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input id="supplier-name" class="md:col-span-2 bg-asphalt border border-carbonBorder rounded-xl p-3 text-sm text-white focus:outline-none focus:border-gold" placeholder="Nombre del proveedor">
                  <button id="supplier-edit-btn" onclick="window.HORNO28_PROVIDERS.startEdit()" class="px-4 py-2 bg-carbonLight hover:bg-carbonBorder text-gray-200 rounded-xl text-xs font-bold uppercase">
                    <i class="fa-solid fa-pen mr-1"></i> Editar
                  </button>
                </div>
                <textarea id="supplier-notes" class="mt-3 w-full bg-asphalt border border-carbonBorder rounded-xl p-3 text-xs text-white focus:outline-none focus:border-gold" rows="2" placeholder="Notas opcionales"></textarea>
              </div>

              <div class="bg-carbon p-5 rounded-2xl border border-carbonBorder shadow-xl">
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <h2 class="font-teko text-2xl text-white uppercase tracking-wider">Productos del proveedor</h2>
                    <p class="text-[10px] text-gray-500 uppercase tracking-wider">Precio de compra y unidad de medida.</p>
                  </div>
                  <button onclick="window.HORNO28_PROVIDERS.addProductRow()" class="px-3 py-1.5 bg-gold/20 border border-gold/40 text-gold rounded-lg text-[10px] font-black uppercase">
                    <i class="fa-solid fa-plus mr-1"></i> Añadir producto
                  </button>
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead><tr class="border-b border-carbonBorder text-gray-500 uppercase text-[9px]">
                      <th class="p-2 text-left">Producto</th><th class="p-2 text-right">Precio</th><th class="p-2 text-center">Unidad</th><th class="p-2 text-center">Acción</th>
                    </tr></thead>
                    <tbody id="supplier-products-tbody"></tbody>
                  </table>
                </div>
                <div class="mt-4 flex justify-end">
                  <button onclick="window.HORNO28_PROVIDERS.saveProducts()" class="px-4 py-2 bg-telemetryGreen/20 border border-telemetryGreen/40 text-telemetryGreen rounded-xl text-xs font-black uppercase">
                    <i class="fa-solid fa-cloud-arrow-up mr-1"></i> Guardar productos
                  </button>
                </div>
              </div>

              <div class="flex justify-end">
                <button onclick="window.HORNO28_PROVIDERS.deleteSupplier()" class="px-4 py-2 bg-red-900/30 hover:bg-f1Red text-white rounded-xl text-xs font-black uppercase">
                  <i class="fa-solid fa-trash-can mr-1"></i> Eliminar permanentemente
                </button>
              </div>
            </div>
          </div>
        </section>`);
    }
  }

  function renderList() {
    const el = document.getElementById('providers-list');
    if (!el) return;
    document.getElementById('providers-count').textContent = `${suppliers.length} registrados`;
    if (!suppliers.length) {
      el.innerHTML = `<div class="p-5 text-center text-gray-500 text-xs italic">No hay proveedores registrados.</div>`;
      return;
    }
    el.innerHTML = suppliers.map(s => `
      <button onclick="window.HORNO28_PROVIDERS.select('${s.id}')"
        class="w-full text-left p-3 rounded-xl border ${s.id===selectedSupplierId ? 'border-f1Red bg-f1Red/10' : 'border-carbonBorder bg-asphalt hover:bg-carbonLight'} transition">
        <div class="font-bold text-white text-sm">${esc(s.name)}</div>
        <div class="text-[10px] text-gray-500 mt-1">${esc(s.notes || 'Sin notas')}</div>
      </button>`).join('');
  }

  async function load() {
    if (!requireBusiness()) return;
    const {data, error} = await DB().from('suppliers').select('id,business_id,name,notes,created_at,updated_at').eq('business_id', businessId()).order('name');
    if (error) { notify('No se pudieron cargar los proveedores: '+error.message, 'error'); return; }
    suppliers = data || [];
    if (!selectedSupplierId || !suppliers.some(s=>s.id===selectedSupplierId)) selectedSupplierId = suppliers[0]?.id || null;
    renderList();
    if (selectedSupplierId) await select(selectedSupplierId);
    else clearForm();
  }

  function clearForm() {
    document.getElementById('supplier-name').value='';
    document.getElementById('supplier-notes').value='';
    document.getElementById('provider-form-title').textContent='Nuevo proveedor';
    document.getElementById('supplier-products-tbody').innerHTML='<tr><td colspan="4" class="p-5 text-center text-gray-500 italic">Guarda el proveedor primero para añadir productos.</td></tr>';
    document.getElementById('supplier-edit-btn').classList.add('hidden');
    document.getElementById('provider-edit-actions').classList.add('hidden');
  }

  async function select(id) {
    if (!requireBusiness()) return;
    selectedSupplierId=id;
    editingSupplierId=null;
    renderList();
    const s=suppliers.find(x=>x.id===id);
    if(!s) return;
    document.getElementById('supplier-name').value=s.name;
    document.getElementById('supplier-notes').value=s.notes||'';
    document.getElementById('provider-form-title').textContent=s.name;
    document.getElementById('supplier-edit-btn').classList.remove('hidden');
    document.getElementById('provider-edit-actions').classList.add('hidden');
    const {data,error}=await DB().from('supplier_products').select('id,product_name,price,unit').eq('business_id',businessId()).eq('supplier_id',id).order('product_name');
    if(error){notify('No se pudieron cargar los productos: '+error.message,'error');return;}
    renderProducts(data||[]);
  }

  function renderProducts(rows) {
    const tb=document.getElementById('supplier-products-tbody');
    if(!rows.length){tb.innerHTML='<tr><td colspan="4" class="p-5 text-center text-gray-500 italic">No hay productos. Usa “Añadir producto”.</td></tr>';return;}
    tb.innerHTML=rows.map(p=>`
      <tr class="border-b border-carbonBorder/50" data-product-id="${p.id}">
        <td class="p-2"><input class="supplier-product-name w-full bg-asphalt border border-carbonBorder rounded-lg p-2 text-white" value="${esc(p.product_name)}"></td>
        <td class="p-2"><input type="number" min="0" step="0.01" class="supplier-product-price w-full bg-asphalt border border-carbonBorder rounded-lg p-2 text-white text-right" value="${Number(p.price||0)}"></td>
        <td class="p-2"><select class="supplier-product-unit bg-asphalt border border-carbonBorder rounded-lg p-2 text-white">
          ${['gr','ml','kg','unidad'].map(u=>`<option value="${u}" ${p.unit===u?'selected':''}>${u}</option>`).join('')}
        </select></td>
        <td class="p-2 text-center"><button onclick="window.HORNO28_PROVIDERS.removeProduct('${p.id}')" class="text-red-400 hover:text-f1Red p-2" title="Eliminar producto"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`).join('');
  }

  function addProductRow() {
    if(!selectedSupplierId){notify('Primero crea o selecciona un proveedor.','error');return;}
    const tb=document.getElementById('supplier-products-tbody');
    const empty=tb.querySelector('td[colspan="4"]');
    if(empty) tb.innerHTML='';
    const id='new-'+Date.now()+Math.random().toString(36).slice(2,7);
    tb.insertAdjacentHTML('beforeend',`
      <tr class="border-b border-carbonBorder/50" data-product-id="${id}" data-new="1">
        <td class="p-2"><input class="supplier-product-name w-full bg-asphalt border border-carbonBorder rounded-lg p-2 text-white" placeholder="Nombre del producto"></td>
        <td class="p-2"><input type="number" min="0" step="0.01" class="supplier-product-price w-full bg-asphalt border border-carbonBorder rounded-lg p-2 text-white text-right" placeholder="0"></td>
        <td class="p-2"><select class="supplier-product-unit bg-asphalt border border-carbonBorder rounded-lg p-2 text-white"><option value="gr">gr</option><option value="ml">ml</option><option value="kg">kg</option><option value="unidad">unidad</option></select></td>
        <td class="p-2 text-center"><button onclick="this.closest('tr').remove()" class="text-red-400 p-2"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`);
  }

  async function saveProducts() {
    if(!requireBusiness() || !selectedSupplierId) return;
    const rows=[...document.querySelectorAll('#supplier-products-tbody tr[data-product-id]')];
    const existingIds=[];
    for(const row of rows){
      const id=row.dataset.productId;
      const name=row.querySelector('.supplier-product-name')?.value.trim();
      const price=Number(row.querySelector('.supplier-product-price')?.value);
      const unit=row.querySelector('.supplier-product-unit')?.value;
      if(!name || !Number.isFinite(price) || price<0){notify('Cada producto debe tener nombre y precio válido.','error');return;}
      const payload={supplier_id:selectedSupplierId,business_id:businessId(),product_name:name,price,unit};
      let res;
      if(String(id).startsWith('new-')) res=await DB().from('supplier_products').insert(payload).select().single();
      else { existingIds.push(id); res=await DB().from('supplier_products').update({product_name:name,price,unit,updated_at:new Date().toISOString()}).eq('id',id).eq('business_id',businessId()).select().single(); }
      if(res.error){notify('Error guardando producto: '+res.error.message,'error');return;}
    }
    const {data,error}=await DB().from('supplier_products').select('id,product_name,price,unit').eq('business_id',businessId()).eq('supplier_id',selectedSupplierId).order('product_name');
    if(error){notify('No se pudo actualizar la lista: '+error.message,'error');return;}
    renderProducts(data||[]);
    notify('Productos del proveedor guardados en Supabase.');
  }

  async function removeProduct(id) {
    if(!requireBusiness() || String(id).startsWith('new-')) { document.querySelector(`[data-product-id="${id}"]`)?.remove(); return; }
    if(!confirm('¿Eliminar permanentemente este producto del proveedor?')) return;
    const {error}=await DB().from('supplier_products').delete().eq('id',id).eq('business_id',businessId());
    if(error){notify('No se pudo eliminar el producto: '+error.message,'error');return;}
    await select(selectedSupplierId);
    notify('Producto eliminado permanentemente.');
  }

  function newSupplier() {
    selectedSupplierId=null; editingSupplierId='new';
    renderList(); clearForm();
    document.getElementById('provider-form-title').textContent='Nuevo proveedor';
    document.getElementById('supplier-name').focus();
    document.getElementById('supplier-edit-btn').classList.add('hidden');
    document.getElementById('provider-edit-actions').classList.remove('hidden');
    document.getElementById('supplier-products-tbody').innerHTML='<tr><td colspan="4" class="p-5 text-center text-gray-500 italic">Guarda el proveedor primero para añadir productos.</td></tr>';
  }

  function startEdit() {
    if(!selectedSupplierId){return;}
    editingSupplierId=selectedSupplierId;
    document.getElementById('provider-edit-actions').classList.remove('hidden');
    document.getElementById('supplier-name').focus();
  }

  function cancelEdit() {
    if(editingSupplierId==='new'){ selectedSupplierId=suppliers[0]?.id||null; if(selectedSupplierId) select(selectedSupplierId); else clearForm(); return; }
    if(selectedSupplierId) select(selectedSupplierId);
  }

  async function saveSupplier() {
    if(!requireBusiness()) return;
    const name=document.getElementById('supplier-name').value.trim();
    const notes=document.getElementById('supplier-notes').value.trim();
    if(!name){notify('El nombre del proveedor es obligatorio.','error');return;}
    if(editingSupplierId==='new'){
      const {data,error}=await DB().from('suppliers').insert({business_id:businessId(),name,notes}).select().single();
      if(error){notify('No se pudo crear el proveedor: '+error.message,'error');return;}
      suppliers.push(data); selectedSupplierId=data.id; editingSupplierId=null;
      renderList(); await select(data.id); notify('Proveedor creado y guardado en Supabase.');
    }else if(editingSupplierId){
      const {error}=await DB().from('suppliers').update({name,notes,updated_at:new Date().toISOString()}).eq('id',editingSupplierId).eq('business_id',businessId());
      if(error){notify('No se pudo guardar el proveedor: '+error.message,'error');return;}
      await load(); notify('Proveedor actualizado en Supabase.');
    }
  }

  async function deleteSupplier() {
    if(!requireBusiness() || !selectedSupplierId) {notify('Selecciona primero un proveedor.','error');return;}
    const s=suppliers.find(x=>x.id===selectedSupplierId);
    if(!s) return;
    if(!confirm(`¿Eliminar PERMANENTEMENTE el proveedor "${s.name}" y todos sus productos? Esta acción no se puede deshacer.`)) return;
    const {error}=await DB().from('suppliers').delete().eq('id',selectedSupplierId).eq('business_id',businessId());
    if(error){notify('No se pudo eliminar el proveedor: '+error.message,'error');return;}
    selectedSupplierId=null; await load(); notify('Proveedor eliminado permanentemente.');
  }

  async function open() {
    ensureUI();
    if(typeof window.switchTab==='function') window.switchTab('suppliers');
    else document.querySelectorAll('.tab-content').forEach(e=>e.classList.toggle('hidden',e.id!=='tab-suppliers'));
    await load();
  }

  window.HORNO28_PROVIDERS={open,load,select,newSupplier,startEdit,cancelEdit,saveSupplier,deleteSupplier,addProductRow,saveProducts,removeProduct};
  window.addEventListener('DOMContentLoaded', ensureUI);
})();
