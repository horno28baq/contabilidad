/* HORNO 28 - Edición y devoluciones POS v1.1
   Corrección: dibujar primero los campos editables y cargar productos con fallback.
   Cargar DESPUÉS de supabase-pos.js */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n)||0);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const db = () => window.horno28Supabase;
  const biz = () => window.HORNO28_CURRENT_BUSINESS_ID;
  let cache = [];
  let editDraft = null;
  let recipesCache = [];

  function notify(msg, type='info') {
    if (typeof window.showNotification === 'function') window.showNotification(msg, type === 'error' ? 'error' : undefined);
    else alert(msg);
  }
  function ensureModal() {
    if ($('h28-sale-editor')) return;
    const el = document.createElement('div'); el.id='h28-sale-editor';
    el.style.cssText='position:fixed;inset:0;z-index:100000;display:none;overflow:auto;background:rgba(0,0,0,.82);padding:24px 12px;color:#fff;font-family:Arial,sans-serif';
    el.innerHTML=`<div style="max-width:900px;margin:20px auto;background:#17191d;border:1px solid #393d44;border-radius:12px;padding:20px;box-shadow:0 20px 60px #000">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 id="h28-edit-title" style="font-size:22px;font-weight:800;color:#f3b61f;margin:0">EDITAR VENTA</h2><button id="h28-edit-close" style="padding:8px 12px;background:#34383f;border-radius:6px">Cerrar ✕</button></div>
      <p style="color:#aeb4bd;font-size:13px;margin:8px 0 16px">Los cambios se guardan en Supabase y actualizan el inventario y la caja.</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px"><label style="flex:1;min-width:220px">Cliente<input id="h28-edit-customer" type="text" maxlength="180" style="display:block;width:100%;padding:10px;background:#252930;color:white;border:1px solid #4b515b;border-radius:6px"></label><label style="flex:1;min-width:180px">Descuento general<input id="h28-edit-discount" type="number" min="0" step="1" style="display:block;width:100%;padding:10px;background:#252930;color:white;border:1px solid #4b515b;border-radius:6px"></label><label style="flex:1;min-width:180px">Impuesto<input id="h28-edit-tax" type="number" min="0" step="1" style="display:block;width:100%;padding:10px;background:#252930;color:white;border:1px solid #4b515b;border-radius:6px"></label><label style="flex:1;min-width:180px">Medio de pago<select id="h28-edit-payment" style="display:block;width:100%;padding:10px;background:#252930;color:white;border:1px solid #4b515b;border-radius:6px"><option value="cash">Efectivo</option><option value="card">Tarjeta / datáfono</option><option value="transfer">Transferencia</option><option value="nequi">Nequi</option><option value="daviplata">Daviplata</option><option value="llave">Llave</option><option value="other">Otro</option></select></label><label style="flex:2;min-width:220px">Agregar producto<select id="h28-edit-add-product" style="display:block;width:100%;padding:10px;background:#252930;color:white;border:1px solid #4b515b;border-radius:6px"><option value="">Cargando productos…</option></select></label><button id="h28-edit-add-btn" style="align-self:end;padding:10px 14px;background:#b91c1c;border-radius:6px;font-weight:700">+ Agregar</button></div>
      <div style="overflow:auto"><table style="width:100%;border-collapse:collapse;min-width:580px"><thead><tr style="color:#f3b61f;text-align:left;border-bottom:1px solid #444"><th style="padding:10px">Producto</th><th style="padding:10px">Precio unitario</th><th style="padding:10px">Cantidad</th><th style="padding:10px">Desc. ítem</th><th style="padding:10px">Subtotal</th><th></th></tr></thead><tbody id="h28-edit-items"></tbody></table></div>
      <div style="display:flex;justify-content:flex-end;align-items:center;gap:18px;margin:18px 0"><span style="color:#aeb4bd">TOTAL DE LA VENTA</span><strong id="h28-edit-total" style="font-size:25px;color:#f3b61f">$0</strong></div>
      <div style="display:flex;justify-content:flex-end;gap:10px"><button id="h28-edit-cancel" style="padding:11px 16px;background:#34383f;border-radius:6px">Cancelar</button><button id="h28-edit-save" style="padding:11px 18px;background:#15803d;border-radius:6px;font-weight:800">Guardar cambios</button></div>
    </div>`;
    document.body.appendChild(el);
    $('h28-edit-close').onclick=$('h28-edit-cancel').onclick=closeEditor;
    $('h28-edit-add-btn').onclick=addSelectedRecipe;
    $('h28-edit-save').onclick=saveEditedSale;
    $('h28-edit-items').addEventListener('input', e=>{if(e.target.matches('[data-qty],[data-price],[data-discount]')) recalcEditor();});
    $('h28-edit-items').addEventListener('click', e=>{const b=e.target.closest('[data-remove]');if(b){editDraft.items.splice(Number(b.dataset.remove),1);renderEditorItems();}});
  }
  function closeEditor(){ if($('h28-sale-editor')) $('h28-sale-editor').style.display='none'; editDraft=null; }
  function productPrice(row){
    for (const key of ['price','sale_price','selling_price','unit_price','price_sale','precio_venta','precio']) {
      if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') return Number(row[key]) || 0;
    }
    return 0;
  }
  function normalizeProduct(row){
    return {
      id: row.id,
      name: row.name || row.product_name || row.title || row.nombre || 'Producto',
      price: productPrice(row),
      category: row.category || row.category_name || row.categoria || ''
    };
  }
  async function fetchRecipes(){
    const select=$('h28-edit-add-product');
    if (select) select.innerHTML='<option value="">Cargando productos…</option>';
    const errors=[];
    // Primero usamos la tabla de recetas del menú. SELECT * evita que una columna opcional
    // (por ejemplo category) provoque que todo el listado quede bloqueado.
    for (const table of ['recipes','products']) {
      try {
        let query=db().from(table).select('*').eq('business_id',biz());
        const result=await query;
        if (result.error) throw result.error;
        const rows=Array.isArray(result.data)?result.data:[];
        recipesCache=rows.map(normalizeProduct).filter(r=>r.id && r.name);
        if (recipesCache.length || table==='recipes') {
          if (select) {
            select.innerHTML='<option value="">Selecciona un producto…</option>'+recipesCache.map(r=>`<option value="${esc(r.id)}">${esc(r.name)} — ${money(r.price)}</option>`).join('');
            if (!recipesCache.length) select.innerHTML='<option value="">No hay productos activos para agregar</option>';
          }
          if (recipesCache.length) return;
          // Si recipes existe pero está vacío, intentar la tabla alternativa.
        }
      } catch (error) {
        errors.push(table+': '+(error?.message || String(error)));
      }
    }
    recipesCache=[];
    if (select) select.innerHTML='<option value="">No se pudieron cargar productos</option>';
    throw new Error('No se pudo cargar el catálogo de productos. Los campos de cantidad y precio siguen disponibles. Detalle: '+errors.join(' | '));
  }
  function renderEditorItems(){
    $('h28-edit-items').innerHTML=editDraft.items.map((it,i)=>`<tr style="border-bottom:1px solid #333"><td style="padding:9px">${esc(it.product_name)}</td><td style="padding:9px"><input data-price="1" data-i="${i}" type="number" min="0" step="1" value="${Number(it.unit_price)||0}" style="width:120px;padding:8px;background:#252930;color:#fff;border:1px solid #4b515b;border-radius:5px"></td><td style="padding:9px"><input data-qty="1" data-i="${i}" type="number" min="0.01" step="0.01" value="${Number(it.quantity)||1}" style="width:85px;padding:8px;background:#252930;color:#fff;border:1px solid #4b515b;border-radius:5px"></td><td style="padding:9px"><input data-discount="1" data-i="${i}" type="number" min="0" step="1" value="${Number(it.discount)||0}" style="width:95px;padding:8px;background:#252930;color:#fff;border:1px solid #4b515b;border-radius:5px"></td><td data-subtotal="${i}" style="padding:9px">${money(Math.max(0,(Number(it.unit_price)||0)*(Number(it.quantity)||0)-(Number(it.discount)||0)) )}</td><td style="padding:9px"><button data-remove="${i}" title="Quitar producto" style="color:#f87171;padding:6px">Quitar</button></td></tr>`).join('') || '<tr><td colspan="5" style="padding:18px;text-align:center;color:#aeb4bd">Agrega al menos un producto.</td></tr>';
    recalcEditor();
  }
  function recalcEditor(){
    if(!editDraft)return; let total=0;
    editDraft.items.forEach((it,i)=>{const q=$(`h28-edit-items`).querySelector(`[data-qty][data-i="${i}"]`);const p=$(`h28-edit-items`).querySelector(`[data-price][data-i="${i}"]`);const d=$(`h28-edit-items`).querySelector(`[data-discount][data-i="${i}"]`);if(q)it.quantity=Math.max(0,Number(q.value)||0);if(p)it.unit_price=Math.max(0,Number(p.value)||0);if(d)it.discount=Math.max(0,Number(d.value)||0);const gross=it.quantity*it.unit_price;it.discount=Math.min(it.discount,gross);it.total=Math.max(0,gross-it.discount);total+=it.total;const cell=$(`h28-edit-items`).querySelector(`[data-subtotal="${i}"]`);if(cell)cell.textContent=money(it.total);});
    const generalDiscount=Math.max(0,Number($('h28-edit-discount')?.value)||0);const tax=Math.max(0,Number($('h28-edit-tax')?.value ?? editDraft.tax)||0);total=Math.max(0,total-generalDiscount+tax);$('h28-edit-total').textContent=money(total);
  }
  function addSelectedRecipe(){const id=$('h28-edit-add-product').value;const r=recipesCache.find(x=>String(x.id)===String(id));if(!r){notify('Selecciona un producto válido.','error');return;}editDraft.items.push({recipe_id:r.id,product_name:r.name,quantity:1,unit_price:productPrice(r),discount:0,total:productPrice(r)});renderEditorItems();}
  async function editSale(id){
    try{
      const sale=cache.find(s=>s.id===id);if(!sale)throw new Error('No se encontró la venta.');if(['cancelled','refunded'].includes(String(sale.status||'').toLowerCase()))throw new Error('Esta venta ya fue devuelta y no se puede editar.');
      editDraft={id:sale.id,customer_name:sale.customer_name||'',subtotal:Number(sale.subtotal)||0,discount:Number(sale.discount)||0,tax:Number(sale.tax)||0,payment_method:sale.payment_method,items:(sale.items||[]).map(i=>({
        ...i,
        recipe_id:i.recipe_id||null,
        product_name:i.product_name||i.name||'Producto',
        quantity:Number(i.quantity ?? i.qty)||1,
        unit_price:Number(i.unit_price ?? i.price)||0,
        discount:Number(i.discount)||0,
        total:Number(i.total)||((Number(i.quantity ?? i.qty)||1)*(Number(i.unit_price ?? i.price)||0))
      }))};
      ensureModal();
      $('h28-edit-payment').value=editDraft.payment_method||'cash';
      $('h28-edit-customer').value=editDraft.customer_name||'';
      const itemDiscountTotal=editDraft.items.reduce((sum,item)=>sum+(Number(item.discount)||0),0);
      $('h28-edit-discount').value=Math.max(0,(Number(editDraft.discount)||0)-itemDiscountTotal);
      $('h28-edit-discount').oninput=recalcEditor;
      $('h28-edit-tax').value=editDraft.tax||0;
      $('h28-edit-tax').oninput=()=>{editDraft.tax=Math.max(0,Number($('h28-edit-tax').value)||0);recalcEditor();};
      $('h28-edit-title').textContent='EDITAR VENTA';
      $('h28-sale-editor').style.display='block';
      // Dibujar inmediatamente los campos editables; no depender de la consulta del catálogo.
      renderEditorItems();
      try {
        await fetchRecipes();
      } catch (catalogError) {
        console.error('[H28 POS Edit] No se pudo cargar catálogo:',catalogError);
        notify(catalogError.message||String(catalogError),'error');
      }
    }catch(e){notify(e.message||String(e),'error');}
  }
  async function saveEditedSale(){
    try{
      recalcEditor(); if(!editDraft.items.length)throw new Error('La venta debe tener al menos un producto.');
      if(editDraft.items.some(i=>!(Number(i.quantity)>0)))throw new Error('Todas las cantidades deben ser mayores que cero.');
      const items=editDraft.items.map(i=>({recipe_id:i.recipe_id||null,product_name:i.product_name,quantity:Number(i.quantity),unit_price:Number(i.unit_price),discount:Math.min(Math.max(0,Number(i.discount)||0),Number(i.quantity)*Number(i.unit_price)),total:Math.max(0,Number(i.quantity)*Number(i.unit_price)-Math.min(Math.max(0,Number(i.discount)||0),Number(i.quantity)*Number(i.unit_price))),combo_pizza_recipe_id:i.combo_pizza_recipe_id||null,combo_pizza_quantity:Number(i.combo_pizza_quantity)||0,combo_bread_recipe_id:i.combo_bread_recipe_id||null,combo_bread_quantity:Number(i.combo_bread_quantity)||0,beverage_ingredient_id:i.beverage_ingredient_id||null}));
      const gross=items.reduce((a,i)=>a+(Number(i.quantity)*Number(i.unit_price)),0);
      const itemDiscount=items.reduce((a,i)=>a+(Number(i.discount)||0),0);
      const generalDiscount=Math.max(0,Number($('h28-edit-discount').value)||0);
      if(generalDiscount>gross-itemDiscount)throw new Error('El descuento general no puede superar el subtotal después de descuentos por producto.');
      const subtotal=gross; const tax=Math.max(0,Number($('h28-edit-tax').value)||0); const total=Math.max(0,subtotal-itemDiscount-generalDiscount+tax);
      const {error}=await db().rpc('edit_pos_sale',{p_business_id:biz(),p_sale_id:editDraft.id,p_customer_name:$('h28-edit-customer').value.trim(),p_payment_method:$('h28-edit-payment').value,p_subtotal:subtotal,p_discount:itemDiscount+generalDiscount,p_tax:Math.max(0,Number($('h28-edit-tax').value)||0),p_total:total,p_items:items});
      if(error)throw error;closeEditor();await refresh();await refreshInventoryAndTreasury();notify('Venta actualizada. Inventario y tesorería sincronizados.');
    }catch(e){notify('No se pudo guardar: '+(e.message||e),'error');}
  }
  
async function returnSale(id) {
  const s = cache.find(x => x.id === id);

  if (!s) {
    return notify('No se encontró la venta.', 'error');
  }

  if (['cancelled','refunded'].includes(String(s.status||'').toLowerCase())) {
    return notify('Esta venta ya fue devuelta.', 'error');
  }

  const reason = prompt(
    'Motivo de la devolución (opcional):',
    'Devolución general'
  );

  if (reason === null) return;

  const cleanReason = reason.trim() || 'Devolución general';

  const confirmed = confirm(
    `¿Confirmar la devolución total de ${money(s.total)}?\n\n` +
    'Se registrará un egreso en Tesorería con el medio de pago ' +
    'original de la venta.\n\n' +
    'Importante: esta devolución no repone automáticamente los ingredientes en inventario.'
  );

  if (!confirmed) return;

  try {
    const { error } = await db().rpc('return_pos_sale', {
      p_business_id: biz(),
      p_sale_id: id,
      p_reason: cleanReason
    });

    if (error) throw error;

    await refresh();
    await refreshInventoryAndTreasury();

    notify('Devolución registrada correctamente.');
  } catch (e) {
    notify(
      'No se pudo devolver la venta: ' + (e.message || e),
      'error'
    );
  }
  }
  async function deleteSale(id){ notify('La eliminación física está deshabilitada para proteger el historial contable. Registra una devolución o solicita una corrección auditada.','error'); }
  async function refreshInventoryAndTreasury(){
    try{if(typeof window.HORNO28_LOAD_INVENTORY_CLOUD==='function')await window.HORNO28_LOAD_INVENTORY_CLOUD();else if(window.HORNO28_INVENTORY?.load)await window.HORNO28_INVENTORY.load();}catch(e){console.error(e)}
    try{if(typeof window.HORNO28_REFRESH_TREASURY==='function')await window.HORNO28_REFRESH_TREASURY();}catch(e){console.error(e)}
    try{if(typeof window.renderDashboard==='function')window.renderDashboard();}catch(e){}
  }
  async function refresh(){
    if(!db()||!biz())return [];
    const {data,error}=await db().from('sales').select('*, sale_items(id,recipe_id,product_name,quantity,unit_price,discount,total,combo_pizza_recipe_id,combo_pizza_quantity,combo_bread_recipe_id,combo_bread_quantity,beverage_ingredient_id)').eq('business_id',biz()).order('sale_date',{ascending:false});
    if(error)throw error;cache=(data||[]).map(s=>({...s,items:(s.sale_items||[]).map(i=>({...i}))}));window.HORNO28_CLOUD_SALES=cache;
    try{sales=cache.map(s=>({id:s.id,date:s.sale_date,customerName:s.customer_name||'',discount:Number(s.discount)||0,category:'Varios',items:s.items.map(i=>({name:i.product_name,qty:Number(i.quantity)||0,price:Number(i.unit_price)||0})),paymentMethod:({'cash':'EFECTIVO','card':'TARJETA / DATÁFONO','transfer':'TRANSFERENCIA','nequi':'NEQUI','daviplata':'DAVIPLATA','llave':'LLAVE'}[s.payment_method]||'OTRO'),total:Number(s.total)||0,status:s.status}));}catch(e){}
    renderHistory();try{if(typeof window.renderDashboard==='function')window.renderDashboard();}catch(e){}return cache;
  }
  function renderHistory(){
    const tbody=$('pos-history-tbody');if(!tbody)return;
    if(!cache.length){tbody.innerHTML='<tr><td colspan="9" class="p-4 text-center text-gray-500 italic">No hay historial de ventas.</td></tr>';return;}
    const paymentLabels={cash:'EFECTIVO',card:'TARJETA / DATÁFONO',transfer:'TRANSFERENCIA',nequi:'NEQUI',daviplata:'DAVIPLATA',other:'OTRO',llave:'LLAVE'};
    tbody.innerHTML=cache.map(s=>{
      const date=new Date(s.sale_date||s.created_at).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'});
      const items=(s.items||[]).map(i=>`${Number(i.quantity)||0}x ${esc(i.product_name)}`).join('<br>');
      const qty=(s.items||[]).reduce((a,i)=>a+(Number(i.quantity)||0),0);
      const cancelled=['cancelled','refunded'].includes(String(s.status||'').toLowerCase());
      const customer=String(s.customer_name||'').trim();
      const discount=Number(s.discount)||0;
      const payment=paymentLabels[s.payment_method]||'OTRO';
      return `<tr class="hover:bg-asphalt/50">
        <td class="p-3 font-mono text-[11px] text-gray-400">${date}</td>
        <td class="p-3 text-gray-200">${customer?esc(customer):'—'}</td>
        <td class="p-3"><span class="px-2 py-0.5 bg-carbonLight text-gold rounded border border-gold/30 text-[10px] font-bold">Varios</span></td>
        <td class="p-3 font-medium text-white">${items||'—'}<div style="margin-top:5px;font-size:10px;color:${cancelled?'#f87171':'#86efac'};font-weight:700">${cancelled?'DEVUELTA':'COMPLETADA'}</div></td>
        <td class="p-3 font-bold text-center">${qty}</td>
        <td class="p-3"><span class="px-2 py-0.5 bg-carbonLight text-gray-300 rounded border border-carbonBorder text-[10px] font-bold">${payment}</span></td>
        <td class="p-3 text-right text-telemetryGreen">${money(discount)}</td>
        <td class="p-3 text-right font-teko text-xl font-bold text-gold">${money(s.total)}</td>
        <td class="p-3 text-center" style="min-width:160px"><div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap">
          <button data-action="edit" data-id="${s.id}" ${cancelled?'disabled':''} style="padding:5px 7px;border-radius:4px;background:${cancelled?'#444':'#2563eb'};color:white;font-size:11px" ${cancelled?'title="Venta devuelta"':''}>Editar</button>
          <button data-action="return" data-id="${s.id}" ${cancelled?'disabled':''} style="padding:5px 7px;border-radius:4px;background:${cancelled?'#444':'#b45309'};color:white;font-size:11px">Devolver</button>
          <button data-action="delete" data-id="${s.id}" disabled title="Eliminación deshabilitada para proteger la auditoría contable" style="padding:5px 7px;border-radius:4px;background:#444;color:#bbb;font-size:11px;cursor:not-allowed">Eliminar bloqueado</button>
        </div></td></tr>`;
    }).join('');
    tbody.querySelectorAll('button[data-action]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.id;const a=b.dataset.action;if(a==='edit')editSale(id);if(a==='return')returnSale(id);if(a==='delete')deleteSale(id);}));
  }
  function install(){
    window.HORNO28_REFRESH_POS=refresh;window.HORNO28_EDIT_SALE=editSale;window.HORNO28_RETURN_SALE=returnSale;window.HORNO28_DELETE_SALE=deleteSale;
    window.renderSalesHistory=renderHistory;
    let tries=0;const timer=setInterval(()=>{tries++;if(db()&&biz()){clearInterval(timer);refresh().catch(e=>console.error('[H28 POS Edit]',e));}if(tries>120)clearInterval(timer);},500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();