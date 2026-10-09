/* ============================================================
   HORNO 28 - INVENTARIO SUPABASE v2
   Supabase es la fuente de verdad. No migra ni resucita datos
   desde localStorage. Conserva el guardado original de la app.
   ============================================================ */
(function () {
  'use strict';

  const TAG = '[H28-INVENTORY-v2]';
  const STORAGE_KEY = 'h28_ingredients';
  let initialized = false;
  let originalSaveIngredient = null;
  let originalDeleteIngredient = null;
  let loadFailed = false;

  function isUUID(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
  }

  function waitForAppReady() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (window.horno28Supabase && window.HORNO28_CURRENT_BUSINESS_ID &&
            typeof window.saveIngredient === 'function' &&
            typeof window.deleteIngredient === 'function') {
          clearInterval(timer);
          resolve();
        } else if (attempts >= 100) {
          clearInterval(timer);
          reject(new Error('No se detectaron a tiempo Supabase, el negocio o las funciones del inventario.'));
        }
      }, 300);
    });
  }

  function getLocalIngredients() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.error(TAG, 'No se pudo leer el inventario local.', error);
      return [];
    }
  }

  function saveLocalIngredients(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function mapCloudToLocal(row) {
    const stock = Number(row.stock || 0);
    return {
      id: row.id,
      name: row.name || '',
      stock,
      unit: row.unit || 'unidad',
      totalPaidCost: Number(row.cost || 0) * stock,
      minStock: Number(row.min_stock || 0)
    };
  }

  function mapLocalToCloud(item) {
    const stock = Number(item.stock || 0);
    const totalPaidCost = Number(item.totalPaidCost || 0);
    return {
      business_id: window.HORNO28_CURRENT_BUSINESS_ID,
      name: String(item.name || '').trim(),
      unit: item.unit || 'unidad',
      cost: stock > 0 ? totalPaidCost / stock : 0,
      stock,
      min_stock: Number(item.minStock || 0),
      active: true
    };
  }

  function renderInventory() {
    if (typeof window.renderInventoryTable === 'function') {
      try { window.renderInventoryTable(); }
      catch (error) { console.warn(TAG, 'No se pudo actualizar la tabla visual.', error); }
    }
    if (typeof window.renderDashboard === 'function') {
      try { window.renderDashboard(); } catch (_) {}
    }
  }

  async function fetchCloudIngredients() {
    const { data, error } = await window.horno28Supabase
      .from('ingredients')
      .select('*')
      .eq('business_id', window.HORNO28_CURRENT_BUSINESS_ID)
      .eq('active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapCloudToLocal);
  }

  async function loadIngredientsFromCloud() {
    try {
      const cloudItems = await fetchCloudIngredients();
      // Una respuesta válida vacía significa inventario vacío en la nube.
      // Solo se escribe localStorage después de una consulta exitosa.
      saveLocalIngredients(cloudItems);
      loadFailed = false;
      renderInventory();
      console.info(TAG, `${cloudItems.length} insumos cargados desde Supabase.`);
      return cloudItems;
    } catch (error) {
      loadFailed = true;
      console.error(TAG, 'Falló la carga desde Supabase; se conserva el almacenamiento local sin usarlo como respaldo.', error);
      alert('No fue posible cargar el inventario desde Supabase. No se modificaron los datos locales.\n\n' + (error.message || error));
      throw error;
    }
  }

  async function createIngredientInCloud(item) {
    const payload = mapLocalToCloud(item);
    if (!payload.name) throw new Error('El nombre del insumo está vacío.');
    const { data, error } = await window.horno28Supabase
      .from('ingredients').insert(payload).select('*').single();
    if (error) throw error;
    return data;
  }

  async function updateIngredientInCloud(item) {
    const payload = mapLocalToCloud(item);
    if (!isUUID(item.id)) throw new Error('El ID del insumo no es un UUID válido para actualizar.');
    if (!payload.name) throw new Error('El nombre del insumo está vacío.');
    const { data, error } = await window.horno28Supabase
      .from('ingredients').update(payload)
      .eq('id', item.id)
      .eq('business_id', window.HORNO28_CURRENT_BUSINESS_ID)
      .select('*').single();
    if (error) throw error;
    return data;
  }

  async function deleteIngredientFromCloud(id) {
    if (!isUUID(id)) return;
    const { data, error } = await window.horno28Supabase
      .from('ingredients').delete()
      .eq('id', id)
      .eq('business_id', window.HORNO28_CURRENT_BUSINESS_ID)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Supabase no confirmó la eliminación. Verifica los permisos y que el insumo pertenezca a este negocio.');
    }
    return data;
  }

  function stableItem(item) {
    return JSON.stringify({
      id: item && item.id,
      name: item && item.name,
      stock: Number(item && item.stock || 0),
      unit: item && item.unit || 'unidad',
      totalPaidCost: Number(item && item.totalPaidCost || 0),
      minStock: Number(item && item.minStock || 0)
    });
  }

  async function syncSavedIngredient(beforeItems, afterItems) {
    if (loadFailed) throw new Error('La carga inicial desde Supabase falló. Recarga la página y verifica la conexión antes de guardar.');
    const beforeById = new Map(beforeItems.map(item => [String(item.id), item]));
    let changed = afterItems.filter(item => {
      const old = beforeById.get(String(item.id));
      return !old || stableItem(old) !== stableItem(item);
    });
    if (!changed.length && afterItems.length) {
      // Fallback para formularios que reconstruyen el array conservando el mismo ID.
      changed = [afterItems[afterItems.length - 1]];
    }
    if (!changed.length) return;

    const syncedByOldId = new Map();
    for (const item of changed) {
      const savedRow = isUUID(item.id)
        ? await updateIngredientInCloud(item)
        : await createIngredientInCloud(item);
      syncedByOldId.set(String(item.id), mapCloudToLocal(savedRow));
    }

    // Vuelve a consultar la nube para evitar que los datos locales sean la fuente maestra.
    const cloudItems = await fetchCloudIngredients();
    saveLocalIngredients(cloudItems);
    renderInventory();
    console.info(TAG, 'Insumo guardado y confirmado en Supabase.');
  }

  function installHooks() {
    if (initialized) return;
    initialized = true;
    originalSaveIngredient = window.saveIngredient;
    originalDeleteIngredient = window.deleteIngredient;

    window.saveIngredient = async function () {
      const before = getLocalIngredients().map(item => ({ ...item }));
      let result;
      try {
        result = await Promise.resolve(originalSaveIngredient.apply(this, arguments));
        // Dar tiempo a la lógica original de HORNO 28 para persistir el cambio local.
        await new Promise(resolve => setTimeout(resolve, 150));
        const after = getLocalIngredients().map(item => ({ ...item }));
        await syncSavedIngredient(before, after);
        return result;
      } catch (error) {
        console.error(TAG, 'No se pudo sincronizar el guardado con Supabase.', error);
        alert('No se pudo confirmar el guardado del insumo en Supabase. Revisa la conexión antes de continuar.\n\n' + (error.message || error));
        throw error;
      }
    };

    window.deleteIngredient = async function (id) {
      const confirmed = confirm('¿Seguro que deseas eliminar este insumo?');
      if (!confirmed) return;
      try {
        if (isUUID(id)) await deleteIngredientFromCloud(id);
        const current = getLocalIngredients();
        saveLocalIngredients(current.filter(item => String(item.id) !== String(id)));
        // Después de eliminar, sincronizar la vista con la fuente de verdad.
        await loadIngredientsFromCloud();
        console.info(TAG, 'Eliminación completada.');
      } catch (error) {
        console.error(TAG, 'Error eliminando insumo.', error);
        alert('No fue posible eliminar el insumo en Supabase.\n\n' + (error.message || error));
        // Recuperar el estado real de la nube si es posible.
        try { await loadIngredientsFromCloud(); } catch (_) {}
      }
    };

    console.info(TAG, 'Intercepciones de guardar/eliminar activadas.');
  }

  async function initialize() {
    try {
      await waitForAppReady();
      // No existe migración automática desde localStorage. Supabase manda.
      await loadIngredientsFromCloud();
      installHooks();
      console.info(TAG, 'Inventario online activo.');
    } catch (error) {
      console.error(TAG, 'No se pudo inicializar el inventario online.', error);
    }
  }

  window.HORNO28_INVENTORY_REFRESH = loadIngredientsFromCloud;
  initialize();
})();
