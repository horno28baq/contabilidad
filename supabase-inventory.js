/* ============================================================
   HORNO 28 - SUPABASE INVENTORY SYNC
   Versión estable - sin reload loop
   ============================================================ */

(function () {
    'use strict';

    let initialized = false;
    let originalSaveIngredient = null;
    let originalDeleteIngredient = null;

    function waitForAppReady() {
        return new Promise((resolve) => {
            const check = () => {
                const hasSupabase = !!window.horno28Supabase;
                const hasBusiness = !!window.HORNO28_CURRENT_BUSINESS_ID;
                const hasSave = typeof window.saveIngredient === 'function';
                const hasDelete = typeof window.deleteIngredient === 'function';

                if (hasSupabase && hasBusiness && hasSave && hasDelete) {
                    resolve();
                } else {
                    setTimeout(check, 300);
                }
            };

            check();
        });
    }

    function getLocalIngredients() {
        try {
            return JSON.parse(
                localStorage.getItem('h28_ingredients') || '[]'
            );
        } catch (error) {
            console.error('Error leyendo ingredientes locales:', error);
            return [];
        }
    }

    function saveLocalIngredients(data) {
        localStorage.setItem(
            'h28_ingredients',
            JSON.stringify(data)
        );
    }

    function mapCloudToLocal(row) {
        return {
            id: row.id,
            name: row.name,
            stock: Number(row.stock || 0),
            unit: row.unit || 'unidad',
            totalPaidCost:
                Number(row.cost || 0) * Number(row.stock || 0),
            minStock: Number(row.min_stock || 0)
        };
    }

    function mapLocalToCloud(ingredient) {
        const stock = Number(ingredient.stock || 0);
        const totalPaidCost =
            Number(ingredient.totalPaidCost || 0);

        const unitCost =
            stock > 0
                ? totalPaidCost / stock
                : 0;

        return {
            business_id: window.HORNO28_CURRENT_BUSINESS_ID,
            name: ingredient.name,
            unit: ingredient.unit || 'unidad',
            cost: unitCost,
            stock: stock,
            min_stock: Number(ingredient.minStock || 0),
            active: true
        };
    }

    async function loadIngredientsFromCloud() {
        try {
            const businessId =
                window.HORNO28_CURRENT_BUSINESS_ID;

            const { data, error } =
                await window.horno28Supabase
                    .from('ingredients')
                    .select('*')
                    .eq('business_id', businessId)
                    .eq('active', true)
                    .order('name', { ascending: true });

            if (error) throw error;

            const cloudIngredients =
                (data || []).map(mapCloudToLocal);

            const currentLocal =
                getLocalIngredients();

            const cloudJSON =
                JSON.stringify(cloudIngredients);

            const localJSON =
                JSON.stringify(currentLocal);

            /*
             * Solo actualizamos localStorage si realmente
             * existen diferencias.
             *
             * IMPORTANTE:
             * NO hacemos location.reload().
             */
            if (cloudJSON !== localJSON) {
                saveLocalIngredients(cloudIngredients);

                /*
                 * Actualizamos la interfaz directamente
                 * si la función existe.
                 */
                if (typeof window.renderInventoryTable === 'function') {
                    try {
                        window.renderInventoryTable();
                    } catch (e) {
                        console.warn(
                            'No fue posible refrescar la tabla:',
                            e
                        );
                    }
                }
            }

            console.log(
                `HORNO 28: ${cloudIngredients.length} insumos cargados desde Supabase.`
            );

            return cloudIngredients;

        } catch (error) {
            console.error(
                'Error cargando inventario desde Supabase:',
                error
            );

            alert(
                'No fue posible cargar los insumos desde Supabase.\n\n' +
                error.message
            );

            return [];
        }
    }

    async function createIngredientInCloud(ingredient) {
        const payload =
            mapLocalToCloud(ingredient);

        const { data, error } =
            await window.horno28Supabase
                .from('ingredients')
                .insert(payload)
                .select()
                .single();

        if (error) throw error;

        return data;
    }

    async function updateIngredientInCloud(ingredient) {
        const payload =
            mapLocalToCloud(ingredient);

        const { data, error } =
            await window.horno28Supabase
                .from('ingredients')
                .update(payload)
                .eq('id', ingredient.id)
                .eq(
                    'business_id',
                    window.HORNO28_CURRENT_BUSINESS_ID
                )
                .select()
                .single();

        if (error) throw error;

        return data;
    }

    async function deleteIngredientFromCloud(id) {
        const { error } =
            await window.horno28Supabase
                .from('ingredients')
                .delete()
                .eq('id', id)
                .eq(
                    'business_id',
                    window.HORNO28_CURRENT_BUSINESS_ID
                );

        if (error) throw error;
    }

    async function syncIngredientAfterSave() {
        try {
            const localIngredients =
                getLocalIngredients();

            if (!localIngredients.length) {
                return;
            }

            const lastIngredient =
                localIngredients[localIngredients.length - 1];

            /*
             * Los IDs antiguos de la aplicación empiezan
             * por "ing-". Los UUID de Supabase no.
             */
            if (
                lastIngredient.id &&
                String(lastIngredient.id).startsWith('ing-')
            ) {
                const created =
                    await createIngredientInCloud(
                        lastIngredient
                    );

                /*
                 * Reemplazamos el ID local por el UUID
                 * real de Supabase.
                 */
                const updated =
                    localIngredients.map(item => {
                        if (item.id === lastIngredient.id) {
                            return mapCloudToLocal(created);
                        }

                        return item;
                    });

                saveLocalIngredients(updated);

                console.log(
                    'HORNO 28: nuevo ingrediente creado en Supabase.'
                );

                if (
                    typeof window.renderInventoryTable ===
                    'function'
                ) {
                    window.renderInventoryTable();
                }

                return;
            }

            /*
             * Si ya tiene UUID, actualizamos.
             */
            const saved =
                await updateIngredientInCloud(
                    lastIngredient
                );

            const updated =
                localIngredients.map(item => {
                    if (item.id === lastIngredient.id) {
                        return mapCloudToLocal(saved);
                    }

                    return item;
                });

            saveLocalIngredients(updated);

            if (
                typeof window.renderInventoryTable ===
                'function'
            ) {
                window.renderInventoryTable();
            }

            console.log(
                'HORNO 28: ingrediente actualizado en Supabase.'
            );

        } catch (error) {
            console.error(
                'Error sincronizando ingrediente:',
                error
            );

            alert(
                'El ingrediente se guardó localmente, pero no fue posible sincronizarlo con Supabase.\n\n' +
                error.message
            );
        }
    }

    async function migrateLocalIngredientsIfNeeded() {
        try {
            const { data, error } =
                await window.horno28Supabase
                    .from('ingredients')
                    .select('id')
                    .eq(
                        'business_id',
                        window.HORNO28_CURRENT_BUSINESS_ID
                    );

            if (error) throw error;

            const cloudCount =
                (data || []).length;

            const localIngredients =
                getLocalIngredients();

            /*
             * Si Supabase ya tiene datos, NO migramos.
             */
            if (cloudCount > 0) {
                return;
            }

            /*
             * Si no hay datos locales, tampoco hay nada
             * que migrar.
             */
            if (!localIngredients.length) {
                return;
            }

            /*
             * IMPORTANTE:
             * La migración requiere confirmación.
             * Así evitamos subir accidentalmente datos
             * de demostración.
             */
            const confirmed = confirm(
                'HORNO 28 encontró ingredientes guardados localmente, pero Supabase está vacío.\n\n' +
                '¿Deseas migrar esos ingredientes a Supabase?\n\n' +
                'Pulsa ACEPTAR para migrarlos o CANCELAR para conservarlos solo localmente.'
            );

            if (!confirmed) {
                console.log(
                    'HORNO 28: migración cancelada por el usuario.'
                );
                return;
            }

            for (const ingredient of localIngredients) {
                /*
                 * Si ya tiene UUID, verificamos que no
                 * intentemos duplicarlo.
                 */
                if (
                    ingredient.id &&
                    !String(ingredient.id).startsWith('ing-')
                ) {
                    try {
                        await updateIngredientInCloud(
                            ingredient
                        );
                    } catch (e) {
                        await createIngredientInCloud(
                            ingredient
                        );
                    }
                } else {
                    await createIngredientInCloud(
                        ingredient
                    );
                }
            }

            console.log(
                `HORNO 28: ${localIngredients.length} ingredientes migrados a Supabase.`
            );

            await loadIngredientsFromCloud();

            alert(
                'Inventario migrado correctamente a Supabase.'
            );

        } catch (error) {
            console.error(
                'Error durante migración:',
                error
            );

            alert(
                'Ocurrió un problema durante la migración del inventario.\n\n' +
                error.message
            );
        }
    }

    function installHooks() {
        if (initialized) return;

        initialized = true;

        originalSaveIngredient =
            window.saveIngredient;

        originalDeleteIngredient =
            window.deleteIngredient;

        /*
         * INTERCEPTOR GUARDAR
         */
        window.saveIngredient = async function () {

            /*
             * Primero ejecutamos la función original.
             * Esto mantiene intacta la lógica actual
             * de HORNO 28.
             */
            originalSaveIngredient.apply(
                this,
                arguments
            );

            /*
             * Damos un pequeño tiempo para que
             * localStorage quede actualizado.
             */
            setTimeout(async () => {
                await syncIngredientAfterSave();
            }, 150);
        };

        /*
         * INTERCEPTOR ELIMINAR
         */
        window.deleteIngredient = async function (id) {

            const confirmed = confirm(
                '¿Seguro que deseas eliminar este insumo?'
            );

            if (!confirmed) return;

            try {

                /*
                 * Primero eliminamos de Supabase si
                 * ya es un UUID.
                 */
                if (
                    id &&
                    !String(id).startsWith('ing-')
                ) {
                    await deleteIngredientFromCloud(id);
                }

                /*
                 * Eliminamos del almacenamiento local.
                 */
                const localIngredients =
                    getLocalIngredients();

                const filtered =
                    localIngredients.filter(
                        item => item.id !== id
                    );

                saveLocalIngredients(filtered);

                if (
                    typeof window.renderInventoryTable ===
                    'function'
                ) {
                    window.renderInventoryTable();
                }

                console.log(
                    'HORNO 28: ingrediente eliminado.'
                );

            } catch (error) {

                console.error(
                    'Error eliminando ingrediente:',
                    error
                );

                alert(
                    'No fue posible eliminar el ingrediente.\n\n' +
                    error.message
                );
            }
        };

        console.log(
            'HORNO 28: sincronización de inventario activada.'
        );
    }

    async function initialize() {

        try {

            await waitForAppReady();

            console.log(
                'HORNO 28: conexión con Supabase detectada.'
            );

            /*
             * Primero comprobamos si existe información
             * local que pueda migrarse.
             */
            await migrateLocalIngredientsIfNeeded();

            /*
             * Después cargamos la información de Supabase.
             */
            await loadIngredientsFromCloud();

            /*
             * Finalmente instalamos los interceptores.
             */
            installHooks();

            console.log(
                'HORNO 28: INVENTARIO ONLINE ACTIVO.'
            );

        } catch (error) {

            console.error(
                'Error inicializando inventario online:',
                error
            );
        }
    }

    initialize();

})();
