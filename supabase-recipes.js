/* ============================================================
   HORNO 28 - SUPABASE RECIPES / ESCANDALLOS
   Sincronización cloud para recipes + recipe_items
   ============================================================ */

(function () {
    'use strict';

    const VERSION = 'H28-RECIPES-CLOUD-v3';
    window.HORNO28_RECIPES_SYNC_VERSION = VERSION;

    console.log(`[${VERSION}] cargando...`);

    function waitForDependencies(callback, attempts = 0) {
        const ready =
            window.horno28Supabase &&
            window.HORNO28_CURRENT_BUSINESS_ID &&
            typeof window.saveRecipe === 'function' &&
            typeof window.deleteRecipe === 'function';

        if (ready) {
            callback();
            return;
        }

        if (attempts >= 100) {
            console.warn(`[${VERSION}] dependencias no disponibles.`);
            return;
        }

        setTimeout(() => {
            waitForDependencies(callback, attempts + 1);
        }, 300);
    }

    /* ============================================================
       ACCESO A VARIABLES LOCALES DEL APP
       IMPORTANTE:
       recipes e ingredients NO necesariamente existen en window.
       ============================================================ */

    function getLocalRecipes() {
        try {
            return Array.isArray(recipes) ? recipes : [];
        } catch (e) {
            return [];
        }
    }

    function getLocalIngredients() {
        try {
            return Array.isArray(ingredients) ? ingredients : [];
        } catch (e) {
            return [];
        }
    }

    /* ============================================================
       RECUPERAR INGREDIENTES LEGACY DESDE LOCALSTORAGE
       ============================================================ */

    function getLegacyIngredients() {
        try {
            const raw = localStorage.getItem('h28_ingredients');
            if (!raw) return [];

            const parsed = JSON.parse(raw);

            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn(
                `[${VERSION}] No fue posible leer ingredientes legacy.`,
                e
            );
            return [];
        }
    }

    /* ============================================================
       UUID
       ============================================================ */

    function isUUID(value) {
        if (!value || typeof value !== 'string') return false;

        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value
        );
    }

    /* ============================================================
       NORMALIZAR TEXTO
       ============================================================ */

    function normalizeText(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    /* ============================================================
       RESOLVER INGREDIENTE LOCAL -> UUID SUPABASE
       ============================================================ */

    function resolveIngredientId(localIngredientId, cloudIngredients) {

        if (!localIngredientId) {
            return null;
        }

        /* Ya es UUID */
        if (isUUID(localIngredientId)) {
            const exists = cloudIngredients.find(
                ing => ing.id === localIngredientId
            );

            return exists ? exists.id : null;
        }

        const currentIngredients = getLocalIngredients();
        const legacyIngredients = getLegacyIngredients();

        let localIngredient =
            currentIngredients.find(
                ing => ing.id === localIngredientId
            ) || null;

        /* Si no está en la versión actual, buscar en snapshot antiguo */
        if (!localIngredient) {
            localIngredient =
                legacyIngredients.find(
                    ing => ing.id === localIngredientId
                ) || null;
        }

        if (!localIngredient) {
            console.warn(
                `[${VERSION}] No se encontró ingrediente local:`,
                localIngredientId
            );

            return null;
        }

        const localName = normalizeText(localIngredient.name);

        if (!localName) {
            return null;
        }

        const cloudIngredient = cloudIngredients.find(
            ing => normalizeText(ing.name) === localName
        );

        if (!cloudIngredient) {
            console.warn(
                `[${VERSION}] No existe ingrediente en Supabase:`,
                localIngredient.name
            );

            return null;
        }

        return cloudIngredient.id;
    }

    /* ============================================================
       OBTENER INGREDIENTES CLOUD
       ============================================================ */

    async function loadCloudIngredients() {

        const businessId =
            window.HORNO28_CURRENT_BUSINESS_ID;

        const { data, error } =
            await window.horno28Supabase
                .from('ingredients')
                .select('*')
                .eq('business_id', businessId)
                .eq('active', true)
                .order('name');

        if (error) {
            throw error;
        }

        return data || [];
    }

    /* ============================================================
       CONVERTIR ITEMS DE RECETA
       ============================================================ */

    async function convertRecipeItems(recipe) {

        const cloudIngredients =
            await loadCloudIngredients();

        const sourceItems =
            Array.isArray(recipe.items)
                ? recipe.items
                : [];

        const resolved = [];

        for (const item of sourceItems) {

            const cloudIngredientId =
                resolveIngredientId(
                    item.ingredientId,
                    cloudIngredients
                );

            if (!cloudIngredientId) {
                console.warn(
                    `[${VERSION}] Item omitido. Ingrediente no encontrado:`,
                    item
                );

                continue;
            }

            const quantity =
                Number(item.quantity) || 0;

            if (quantity <= 0) {
                continue;
            }

            resolved.push({
                ingredient_id: cloudIngredientId,
                quantity: quantity,
                unit: item.unit || null
            });
        }

        /*
         * recipe_items tiene:
         * unique(recipe_id, ingredient_id)
         *
         * Por eso combinamos ingredientes repetidos.
         */

        const grouped = new Map();

        for (const item of resolved) {

            if (!grouped.has(item.ingredient_id)) {

                grouped.set(
                    item.ingredient_id,
                    {
                        ingredient_id: item.ingredient_id,
                        quantity: item.quantity,
                        unit: item.unit
                    }
                );

            } else {

                const existing =
                    grouped.get(item.ingredient_id);

                existing.quantity += item.quantity;
            }
        }

        return Array.from(grouped.values());
    }

    /* ============================================================
       CREAR RECETA EN SUPABASE
       ============================================================ */

    async function createRecipeInCloud(recipe) {

        const businessId =
            window.HORNO28_CURRENT_BUSINESS_ID;

        const payload = {
            business_id: businessId,
            name: recipe.name,
            category: recipe.category || null,
            yield_quantity: 1,
            yield_unit: 'unidad',
            selling_price: Number(recipe.price) || 0,
            notes: null,
            active: true
        };

        const { data: createdRecipe, error } =
            await window.horno28Supabase
                .from('recipes')
                .insert(payload)
                .select()
                .single();

        if (error) {
            throw error;
        }

        try {

            const items =
                await convertRecipeItems(recipe);

            if (items.length > 0) {

                const rows = items.map(item => ({
                    recipe_id: createdRecipe.id,
                    ingredient_id: item.ingredient_id,
                    quantity: item.quantity,
                    unit: item.unit
                }));

                const { error: itemError } =
                    await window.horno28Supabase
                        .from('recipe_items')
                        .insert(rows);

                if (itemError) {
                    throw itemError;
                }
            }

        } catch (error) {

            /*
             * Si fallan los items eliminamos
             * la receta creada para no dejar
             * datos incompletos.
             */

            await window.horno28Supabase
                .from('recipes')
                .delete()
                .eq('id', createdRecipe.id);

            throw error;
        }

        console.log(
            `[${VERSION}] Receta creada en Supabase:`,
            createdRecipe.id
        );

        return createdRecipe;
    }

    /* ============================================================
       ACTUALIZAR RECETA EN SUPABASE
       ============================================================ */

    async function updateRecipeInCloud(recipe) {

        if (!isUUID(recipe.id)) {
            return createRecipeInCloud(recipe);
        }

        const recipePayload = {
            name: recipe.name,
            category: recipe.category || null,
            selling_price: Number(recipe.price) || 0
        };

        const { data: updatedRecipe, error } =
            await window.horno28Supabase
                .from('recipes')
                .update(recipePayload)
                .eq('id', recipe.id)
                .select()
                .single();

        if (error) {
            throw error;
        }

        await window.horno28Supabase
            .from('recipe_items')
            .delete()
            .eq('recipe_id', recipe.id);

        const items =
            await convertRecipeItems(recipe);

        if (items.length > 0) {

            const rows = items.map(item => ({
                recipe_id: recipe.id,
                ingredient_id: item.ingredient_id,
                quantity: item.quantity,
                unit: item.unit
            }));

            const { error: itemError } =
                await window.horno28Supabase
                    .from('recipe_items')
                    .insert(rows);

            if (itemError) {
                throw itemError;
            }
        }

        console.log(
            `[${VERSION}] Receta actualizada:`,
            recipe.id
        );

        return updatedRecipe;
    }

    /* ============================================================
       ELIMINAR RECETA DE SUPABASE
       ============================================================ */

    async function deleteRecipeFromCloud(recipeId) {

        if (!isUUID(recipeId)) {
            return;
        }

        const { error } =
            await window.horno28Supabase
                .from('recipes')
                .delete()
                .eq('id', recipeId);

        if (error) {
            throw error;
        }

        console.log(
            `[${VERSION}] Receta eliminada:`,
            recipeId
        );
    }

    /* ============================================================
       CARGAR RECETAS CLOUD
       ============================================================ */

    async function loadCloudRecipes() {

        const businessId =
            window.HORNO28_CURRENT_BUSINESS_ID;

        const { data: cloudRecipes, error } =
            await window.horno28Supabase
                .from('recipes')
                .select(`
                    *,
                    recipe_items (
                        id,
                        ingredient_id,
                        quantity,
                        unit
                    )
                `)
                .eq('business_id', businessId)
                .eq('active', true)
                .order('name');

        if (error) {
            throw error;
        }

        const mappedRecipes =
            (cloudRecipes || []).map(recipe => {

                return {
                    id: recipe.id,
                    name: recipe.name,
                    category: recipe.category || '',
                    price: Number(recipe.selling_price) || 0,

                    items:
                        (recipe.recipe_items || []).map(item => ({
                            ingredientId: item.ingredient_id,
                            quantity: Number(item.quantity) || 0,
                            unit: item.unit || ''
                        }))
                };
            });

        try {
            recipes = mappedRecipes;
        } catch (e) {
            console.error(
                `[${VERSION}] No se pudo actualizar recipes.`,
                e
            );
        }

        if (typeof saveStorageData === 'function') {
            saveStorageData();
        }

        if (typeof renderRecipesGrid === 'function') {
            renderRecipesGrid();
        }

        if (typeof renderPOSProducts === 'function') {
            renderPOSProducts();
        }

        console.log(
            `[${VERSION}] Recetas cargadas desde Supabase:`,
            mappedRecipes.length
        );

        return mappedRecipes;
    }

    /* ============================================================
       MIGRAR RECETAS LOCALES
       ============================================================ */

    async function migrateLocalRecipes() {

        const localRecipes =
            getLocalRecipes().filter(
                recipe => !isUUID(recipe.id)
            );

        if (!localRecipes.length) {
            return;
        }

        console.log(
            `[${VERSION}] Recetas locales pendientes de migración:`,
            localRecipes.length
        );

        for (const localRecipe of localRecipes) {

            try {

                const cloudRecipe =
                    await createRecipeInCloud(localRecipe);

                /*
                 * Reemplazamos el ID local por el UUID real.
                 */

                localRecipe.id =
                    cloudRecipe.id;

                console.log(
                    `[${VERSION}] Migrada:`,
                    localRecipe.name
                );

            } catch (error) {

                console.error(
                    `[${VERSION}] Error migrando receta:`,
                    localRecipe.name,
                    error
                );
            }
        }

        if (typeof saveStorageData === 'function') {
            saveStorageData();
        }

        if (typeof renderRecipesGrid === 'function') {
            renderRecipesGrid();
        }

        if (typeof renderPOSProducts === 'function') {
            renderPOSProducts();
        }
    }

    /* ============================================================
       WRAPPER SAVE RECIPE
       ============================================================ */

    const originalSaveRecipe =
        window.saveRecipe;

    window.saveRecipe = async function () {

        const before =
            getLocalRecipes().map(recipe => ({
                id: recipe.id,
                snapshot: JSON.stringify(recipe)
            }));

        /*
         * Ejecutar primero la función original.
         */
        const result =
            await originalSaveRecipe.apply(this, arguments);

        /*
         * Dar tiempo al app para actualizar
         * su variable recipes.
         */
        await new Promise(resolve =>
            setTimeout(resolve, 50)
        );

        const after =
            getLocalRecipes();

        if (!after.length) {
            return result;
        }

        let changedRecipe = null;

        /*
         * Primero buscar receta nueva.
         */
        changedRecipe =
            after.find(recipe =>
                !before.some(
                    old => old.id === recipe.id
                )
            );

        /*
         * Si no hay nueva, buscar receta modificada.
         */
        if (!changedRecipe) {

            changedRecipe =
                after.find(recipe => {

                    const old =
                        before.find(
                            item => item.id === recipe.id
                        );

                    if (!old) return false;

                    return (
                        old.snapshot !==
                        JSON.stringify(recipe)
                    );
                });
        }

        /*
         * Como fallback, usar la última receta.
         */
        if (!changedRecipe) {
            changedRecipe =
                after[after.length - 1];
        }

        if (!changedRecipe) {
            return result;
        }

        try {

            let cloudRecipe;

            if (isUUID(changedRecipe.id)) {

                cloudRecipe =
                    await updateRecipeInCloud(
                        changedRecipe
                    );

            } else {

                cloudRecipe =
                    await createRecipeInCloud(
                        changedRecipe
                    );

                /*
                 * Convertir definitivamente
                 * el ID local al UUID de Supabase.
                 */

                changedRecipe.id =
                    cloudRecipe.id;

                if (typeof saveStorageData === 'function') {
                    saveStorageData();
                }
            }

            console.log(
                `[${VERSION}] SAVE sincronizado correctamente.`,
                cloudRecipe.id
            );

        } catch (error) {

            console.error(
                `[${VERSION}] Error sincronizando receta:`,
                error
            );

            alert(
                'La ficha técnica se guardó localmente, pero ocurrió un problema al sincronizarla con Supabase.\n\n' +
                (error?.message || error)
            );
        }

        return result;
    };

    /* ============================================================
       WRAPPER DELETE RECIPE
       ============================================================ */

    const originalDeleteRecipe =
        window.deleteRecipe;

    window.deleteRecipe = async function (id) {

        let cloudId = id;

        /*
         * Ejecutar primero la eliminación local.
         */
        const result =
            await originalDeleteRecipe.apply(
                this,
                arguments
            );

        if (!isUUID(cloudId)) {
            return result;
        }

        try {

            await deleteRecipeFromCloud(cloudId);

        } catch (error) {

            console.error(
                `[${VERSION}] Error eliminando receta cloud:`,
                error
            );

            alert(
                'La receta fue eliminada localmente, pero ocurrió un problema al eliminarla de Supabase.\n\n' +
                (error?.message || error)
            );
        }

        return result;
    };

    /* ============================================================
       INICIALIZACIÓN
       ============================================================ */

    async function initializeRecipesCloud() {

        console.log(
            `[${VERSION}] Inicializando sincronización...`
        );

        try {

            const cloudRecipes =
                await loadCloudRecipes();

            const localRecipes =
                getLocalRecipes();

            /*
             * Si Supabase tiene recetas:
             * Supabase es la fuente principal.
             */
            if (cloudRecipes.length > 0) {

                console.log(
                    `[${VERSION}] Supabase contiene recetas.`
                );

                return;
            }

            /*
             * Si Supabase está vacío pero hay recetas
             * locales, migrarlas automáticamente.
             *
             * Esto evita perder las fichas existentes.
             */
            if (localRecipes.length > 0) {

                const shouldMigrate =
                    confirm(
                        'HORNO 28 encontró fichas técnicas locales que todavía no están en Supabase.\n\n' +
                        '¿Deseas migrarlas ahora a la base de datos central?'
                    );

                if (shouldMigrate) {

                    await migrateLocalRecipes();

                } else {

                    console.log(
                        `[${VERSION}] Migración local cancelada por el usuario.`
                    );
                }
            }

        } catch (error) {

            console.error(
                `[${VERSION}] Error inicializando recetas:`,
                error
            );
        }
    }

    /* ============================================================
       ARRANQUE
       ============================================================ */

    waitForDependencies(() => {

        initializeRecipesCloud();

    });

})();
