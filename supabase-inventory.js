(function () {
    'use strict';

    let inventorySyncStarted = false;
    let originalSaveIngredient = null;
    let originalDeleteIngredient = null;

    function log(message, data) {
        console.log('[HORNO 28 CLOUD]', message, data || '');
    }

    function getBusinessId() {
        return window.HORNO28_CURRENT_BUSINESS_ID || null;
    }

    async function waitForAuthentication() {
        return new Promise((resolve) => {
            const check = () => {
                const businessId = getBusinessId();

                if (businessId && window.horno28Supabase) {
                    resolve(businessId);
                    return;
                }

                setTimeout(check, 500);
            };

            check();
        });
    }

    async function loadIngredientsFromCloud() {

        const businessId = await waitForAuthentication();

        log('Cargando insumos desde Supabase...');

        const { data, error } = await window.horno28Supabase
            .from('ingredients')
            .select('*')
            .eq('business_id', businessId)
            .order('name', { ascending: true });

        if (error) {
            console.error(
                '[HORNO 28 CLOUD] Error cargando ingredientes:',
                error
            );

            if (typeof showNotification === 'function') {
                showNotification(
                    'No fue posible cargar los insumos desde Supabase.',
                    'error'
                );
            }

            return;
        }

        /*
         * Convertimos la estructura de Supabase a la estructura
         * que actualmente utiliza HORNO 28.
         */
        const localIngredients = (data || []).map(item => ({
            id: item.id,
            name: item.name,
            stock: Number(item.stock || 0),
            unit: item.unit || 'unidad',

            /*
             * La aplicación actual calcula:
             *
             * costo unitario =
             * totalPaidCost / stock
             *
             * Supabase guarda directamente el costo unitario.
             *
             * Por eso reconstruimos totalPaidCost.
             */
            totalPaidCost:
                Number(item.cost || 0) * Number(item.stock || 0),

            minStock: Number(item.min_stock || 0)
        }));

        localStorage.setItem(
            'h28_ingredients',
            JSON.stringify(localIngredients)
        );

        log(
            `Se cargaron ${localIngredients.length} insumos desde Supabase.`
        );

        /*
         * Recargamos la aplicación para que la variable interna
         * "ingredients" tome los datos recién descargados.
         */
        location.reload();
    }

    async function syncIngredientToCloud(ingredient) {

        const businessId = getBusinessId();

        if (!businessId || !window.horno28Supabase) {
            throw new Error(
                'HORNO 28 todavía no está conectado a Supabase.'
            );
        }

        const stock = Number(ingredient.stock || 0);

        const totalPaidCost =
            Number(ingredient.totalPaidCost || 0);

        const unitCost =
            stock > 0
                ? totalPaidCost / stock
                : 0;

        const payload = {
            business_id: businessId,
            name: ingredient.name,
            unit: ingredient.unit || 'unidad',
            stock: stock,
            cost: unitCost,
            min_stock: Number(ingredient.minStock || 0),
            active: true
        };

        /*
         * Si el ID actual es UUID, intentamos actualizar.
         * Si es un ID antiguo como "ing-123456", hacemos INSERT.
         */
        const isUUID =
            typeof ingredient.id === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                .test(ingredient.id);

        if (isUUID) {

            const { data, error } =
                await window.horno28Supabase
                    .from('ingredients')
                    .update(payload)
                    .eq('id', ingredient.id)
                    .eq('business_id', businessId)
                    .select()
                    .single();

            if (error) throw error;

            log('Insumo actualizado en Supabase.', data);

            return data;
        }

        const { data, error } =
            await window.horno28Supabase
                .from('ingredients')
                .insert(payload)
                .select()
                .single();

        if (error) throw error;

        log('Nuevo insumo creado en Supabase.', data);

        return data;
    }

    async function syncAllLocalIngredients() {

        const businessId = getBusinessId();

        if (!businessId) return;

        const raw =
            localStorage.getItem('h28_ingredients');

        if (!raw) return;

        let localIngredients;

        try {
            localIngredients = JSON.parse(raw);
        } catch (error) {
            console.error(
                '[HORNO 28 CLOUD] Error leyendo insumos locales.',
                error
            );
            return;
        }

        if (!Array.isArray(localIngredients)) return;

        /*
         * Esta función solo se utilizará si Supabase está vacío.
         * Evitamos duplicar datos automáticamente.
         */
        const { count, error } =
            await window.horno28Supabase
                .from('ingredients')
                .select('*', {
                    count: 'exact',
                    head: true
                })
                .eq('business_id', businessId);

        if (error) {
            console.error(
                '[HORNO 28 CLOUD] Error verificando ingredientes:',
                error
            );
            return;
        }

        if (count > 0) {
            log(
                `Supabase ya contiene ${count} insumos. No se realiza migración automática.`
            );
            return;
        }

        if (localIngredients.length === 0) {
            return;
        }

        /*
         * Primera migración:
         * solo se ejecuta si la tabla del negocio está vacía.
         */
        log(
            `Migrando ${localIngredients.length} insumos locales a Supabase...`
        );

        for (const ingredient of localIngredients) {

            try {

                const created =
                    await syncIngredientToCloud(ingredient);

                /*
                 * Sustituimos el ID local por el UUID generado
                 * por Supabase.
                 */
                ingredient.id = created.id;

            } catch (error) {

                console.error(
                    '[HORNO 28 CLOUD] Error migrando insumo:',
                    ingredient,
                    error
                );
            }
        }

        localStorage.setItem(
            'h28_ingredients',
            JSON.stringify(localIngredients)
        );

        log('Migración inicial de insumos completada.');

        location.reload();
    }

    function installSaveInterceptor() {

        if (originalSaveIngredient) return;

        if (typeof window.saveIngredient !== 'function') {
            console.warn(
                '[HORNO 28 CLOUD] saveIngredient todavía no está disponible.'
            );
            return;
        }

        originalSaveIngredient =
            window.saveIngredient;

        window.saveIngredient = async function () {

            /*
             * Ejecutamos primero la función original.
             * Así mantenemos intacta la lógica actual de la aplicación.
             */
            originalSaveIngredient();

            /*
             * Leemos el último estado que la aplicación
             * acaba de guardar en localStorage.
             */
            const raw =
                localStorage.getItem('h28_ingredients');

            if (!raw) return;

            let localIngredients;

            try {
                localIngredients = JSON.parse(raw);
            } catch {
                return;
            }

            if (!Array.isArray(localIngredients)) return;

            const id =
                document.getElementById('ing-id')?.value || '';

            /*
             * Si estamos editando, buscamos el insumo.
             * Si estamos creando, tomamos el último agregado.
             */
            let ingredient;

            if (id) {
                ingredient =
                    localIngredients.find(
                        item => item.id === id
                    );
            } else {
                ingredient =
                    localIngredients[
                        localIngredients.length - 1
                    ];
            }

            if (!ingredient) return;

            try {

                const cloudIngredient =
                    await syncIngredientToCloud(
                        ingredient
                    );

                /*
                 * Si era un nuevo ingrediente, Supabase
                 * generó un UUID.
                 */
                if (
                    ingredient.id !== cloudIngredient.id
                ) {

                    ingredient.id =
                        cloudIngredient.id;

                    localStorage.setItem(
                        'h28_ingredients',
                        JSON.stringify(localIngredients)
                    );
                }

                log(
                    '✓ Insumo sincronizado correctamente.'
                );

                if (typeof showNotification === 'function') {
                    showNotification(
                        'Insumo guardado y sincronizado en la nube.'
                    );
                }

            } catch (error) {

                console.error(
                    '[HORNO 28 CLOUD] Error sincronizando insumo:',
                    error
                );

                if (typeof showNotification === 'function') {
                    showNotification(
                        'El insumo quedó guardado localmente, pero no pudo sincronizarse con Supabase.',
                        'error'
                    );
                }
            }
        };
    }

    function installDeleteInterceptor() {

        if (originalDeleteIngredient) return;

        if (
            typeof window.deleteIngredient !==
            'function'
        ) {
            return;
        }

        originalDeleteIngredient =
            window.deleteIngredient;

        window.deleteIngredient = async function (id) {

            const confirmed =
                confirm(
                    '¿Deseas eliminar este insumo? También se eliminará de la nube.'
                );

            if (!confirmed) return;

            const businessId =
                getBusinessId();

            if (!businessId) {
                showNotification(
                    'No hay conexión con Supabase.',
                    'error'
                );
                return;
            }

            try {

                const { error } =
                    await window.horno28Supabase
                        .from('ingredients')
                        .delete()
                        .eq('id', id)
                        .eq(
                            'business_id',
                            businessId
                        );

                if (error) throw error;

                /*
                 * Actualizamos también el almacenamiento
                 * local para mantener la interfaz actual.
                 */
                const raw =
                    localStorage.getItem(
                        'h28_ingredients'
                    );

                if (raw) {

                    const localIngredients =
                        JSON.parse(raw)
                            .filter(
                                item =>
                                    item.id !== id
                            );

                    localStorage.setItem(
                        'h28_ingredients',
                        JSON.stringify(
                            localIngredients
                        )
                    );
                }

                /*
                 * Recargamos para que el arreglo interno
                 * de la aplicación quede sincronizado.
                 */
                location.reload();

            } catch (error) {

                console.error(
                    '[HORNO 28 CLOUD] Error eliminando insumo:',
                    error
                );

                showNotification(
                    'No fue posible eliminar el insumo de Supabase.',
                    'error'
                );
            }
        };
    }

    async function initializeInventoryCloud() {

        if (inventorySyncStarted) return;

        inventorySyncStarted = true;

        const businessId =
            await waitForAuthentication();

        if (!businessId) return;

        log(
            'Conexión de Insumos y Stock activada.'
        );

        /*
         * Primero instalamos los interceptores.
         */
        installSaveInterceptor();
        installDeleteInterceptor();

        /*
         * Esperamos un poco para que la aplicación
         * termine de inicializar su interfaz.
         */
        setTimeout(async () => {

            /*
             * Si Supabase está vacío, migramos los
             * insumos locales existentes.
             */
            await syncAllLocalIngredients();

            /*
             * Si ya existen datos en Supabase,
             * los descargamos.
             */
            await loadIngredientsFromCloud();

        }, 1000);
    }

    /*
     * Esperamos hasta que el usuario haya iniciado
     * sesión y HORNO 28 tenga Business ID.
     */
    initializeInventoryCloud();

})();
