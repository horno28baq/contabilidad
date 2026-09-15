/* ============================================================
   HORNO 28 - SUPABASE RECIPES / ESCANDALLOS
   Integración estable - sin reload
   ============================================================ */

(function () {
    'use strict';

    let initialized = false;

    function getLocalRecipes() {
        try {
            return JSON.parse(
                localStorage.getItem('h28_recipes') || '[]'
            );
        } catch (error) {
            console.error('Error leyendo recetas locales:', error);
            return [];
        }
    }

    function saveLocalRecipes(data) {
        localStorage.setItem(
            'h28_recipes',
            JSON.stringify(data)
        );
    }

    function mapCloudRecipeToLocal(recipe, items) {
        return {
            id: recipe.id,
            name: recipe.name,
            category: recipe.category || 'Pizzas',
            price: Number(recipe.selling_price || 0),
            items: (items || []).map(item => ({
                ingredientId: item.ingredient_id,
                quantity: Number(item.quantity || 0)
            }))
        };
    }

    function mapLocalRecipeToCloud(recipe) {
        return {
            business_id:
                window.HORNO28_CURRENT_BUSINESS_ID,
            name: recipe.name,
            category: recipe.category || 'Pizzas',
            yield_quantity: 1,
            yield_unit: 'unidad',
            selling_price: Number(recipe.price || 0),
            active: true
        };
    }

    async function loadRecipesFromCloud() {

        try {

            const businessId =
                window.HORNO28_CURRENT_BUSINESS_ID;

            const { data: recipesData, error: recipesError } =
                await window.horno28Supabase
                    .from('recipes')
                    .select('*')
                    .eq('business_id', businessId)
                    .eq('active', true)
                    .order('name', { ascending: true });

            if (recipesError) throw recipesError;

            const recipes = recipesData || [];

            if (recipes.length === 0) {
                console.log(
                    'HORNO 28: Supabase no tiene fichas técnicas.'
                );
                return [];
            }

            const recipeIds =
                recipes.map(recipe => recipe.id);

            const { data: itemsData, error: itemsError } =
                await window.horno28Supabase
                    .from('recipe_items')
                    .select('*')
                    .in('recipe_id', recipeIds);

            if (itemsError) throw itemsError;

            const localRecipes =
                recipes.map(recipe => {

                    const recipeItems =
                        (itemsData || []).filter(
                            item =>
                                item.recipe_id === recipe.id
                        );

                    return mapCloudRecipeToLocal(
                        recipe,
                        recipeItems
                    );
                });

            saveLocalRecipes(localRecipes);

            /*
             * Refrescamos únicamente las áreas
             * relacionadas con recetas.
             */
            if (
                typeof window.renderRecipesGrid ===
                'function'
            ) {
                window.renderRecipesGrid();
            }

            if (
                typeof window.renderPOSProducts ===
                'function'
            ) {
                window.renderPOSProducts();
            }

            console.log(
                `HORNO 28: ${localRecipes.length} fichas cargadas desde Supabase.`
            );

            return localRecipes;

        } catch (error) {

            console.error(
                'Error cargando recetas desde Supabase:',
                error
            );

            alert(
                'No fue posible cargar las fichas técnicas desde Supabase.\n\n' +
                error.message
            );

            return [];
        }
    }

    async function createRecipeInCloud(recipe) {

        const payload =
            mapLocalRecipeToCloud(recipe);

        const { data, error } =
            await window.horno28Supabase
                .from('recipes')
                .insert(payload)
                .select()
                .single();

        if (error) throw error;

        const recipeId = data.id;

        /*
         * Insertamos los ingredientes de la ficha.
         */
        if (recipe.items && recipe.items.length > 0) {

            const items =
                recipe.items.map(item => ({
                    recipe_id: recipeId,
                    ingredient_id: item.ingredientId,
                    quantity: Number(item.quantity || 0),
                    unit: null
                }));

            const { error: itemsError } =
                await window.horno28Supabase
                    .from('recipe_items')
                    .insert(items);

            if (itemsError) {

                /*
                 * Si fallan los ingredientes,
                 * eliminamos la receta creada para
                 * evitar registros incompletos.
                 */
                await window.horno28Supabase
                    .from('recipes')
                    .delete()
                    .eq('id', recipeId);

                throw itemsError;
            }
        }

        return data;
    }

    async function updateRecipeInCloud(recipe) {

        const payload =
            mapLocalRecipeToCloud(recipe);

        const { data, error } =
            await window.horno28Supabase
                .from('recipes')
                .update(payload)
                .eq('id', recipe.id)
                .eq(
                    'business_id',
                    window.HORNO28_CURRENT_BUSINESS_ID
                )
                .select()
                .single();

        if (error) throw error;

        /*
         * Eliminamos los ingredientes actuales
         * y reconstruimos la lista.
         */
        const { error: deleteItemsError } =
            await window.horno28Supabase
                .from('recipe_items')
                .delete()
                .eq('recipe_id', recipe.id);

        if (deleteItemsError) {
            throw deleteItemsError;
        }

        if (recipe.items && recipe.items.length > 0) {

            const items =
                recipe.items.map(item => ({
                    recipe_id: recipe.id,
                    ingredient_id: item.ingredientId,
                    quantity: Number(item.quantity || 0),
                    unit: null
                }));

            const { error: insertItemsError } =
                await window.horno28Supabase
                    .from('recipe_items')
                    .insert(items);

            if (insertItemsError) {
                throw insertItemsError;
            }
        }

        return data;
    }

    async function deleteRecipeFromCloud(id) {

        /*
         * recipe_items tiene ON DELETE CASCADE,
         * por lo que al eliminar la receta se
         * eliminan sus ingredientes asociados.
         */
        const { error } =
            await window.horno28Supabase
                .from('recipes')
                .delete()
                .eq('id', id)
                .eq(
                    'business_id',
                    window.HORNO28_CURRENT_BUSINESS_ID
                );

        if (error) throw error;
    }

    async function syncRecipeAfterSave(recipeId) {

        try {

            const localRecipes =
                getLocalRecipes();

            let recipe = null;

            /*
             * Si estamos editando, tenemos el UUID
             * o ID original.
             */
            if (recipeId) {

                recipe =
                    localRecipes.find(
                        item => item.id === recipeId
                    );
            }

            /*
             * Si estamos creando una receta nueva,
             * la aplicación genera rec-<timestamp>.
             */
            if (!recipe) {

                const candidates =
                    localRecipes.filter(
                        item =>
                            item.id &&
                            String(item.id).startsWith('rec-')
                    );

                recipe =
                    candidates[candidates.length - 1];
            }

            if (!recipe) {
                console.warn(
                    'HORNO 28: no se encontró la receta para sincronizar.'
                );
                return;
            }

            /*
             * NUEVA RECETA
             */
            if (
                recipe.id &&
                String(recipe.id).startsWith('rec-')
            ) {

                const created =
                    await createRecipeInCloud(recipe);

                const localUpdated =
                    localRecipes.map(item => {

                        if (item.id === recipe.id) {

                            const synced =
                                mapCloudRecipeToLocal(
                                    created,
                                    recipe.items
                                );

                            return synced;
                        }

                        return item;
                    });

                saveLocalRecipes(localUpdated);

                console.log(
                    'HORNO 28: nueva ficha creada en Supabase.'
                );

            } else {

                /*
                 * RECETA EXISTENTE
                 */
                await updateRecipeInCloud(recipe);

                console.log(
                    'HORNO 28: ficha técnica actualizada en Supabase.'
                );
            }

            if (
                typeof window.renderRecipesGrid ===
                'function'
            ) {
                window.renderRecipesGrid();
            }

            if (
                typeof window.renderPOSProducts ===
                'function'
            ) {
                window.renderPOSProducts();
            }

        } catch (error) {

            console.error(
                'Error sincronizando receta:',
                error
            );

            alert(
                'La ficha fue guardada localmente, pero ocurrió un problema al sincronizarla con Supabase.\n\n' +
                error.message
            );
        }
    }

    async function migrateLocalRecipesIfNeeded() {

        try {

            const { data, error } =
                await window.horno28Supabase
                    .from('recipes')
                    .select('id')
                    .eq(
                        'business_id',
                        window.HORNO28_CURRENT_BUSINESS_ID
                    );

            if (error) throw error;

            const cloudCount =
                (data || []).length;

            /*
             * Si Supabase ya tiene recetas,
             * no migramos automáticamente.
             */
            if (cloudCount > 0) {
                return;
            }

            const localRecipes =
                getLocalRecipes();

            if (!localRecipes.length) {
                return;
            }

            const confirmed = confirm(
                'HORNO 28 encontró fichas técnicas guardadas localmente, pero Supabase está vacío.\n\n' +
                '¿Deseas migrarlas a Supabase?\n\n' +
                'Pulsa ACEPTAR para migrarlas o CANCELAR para conservarlas solo localmente.'
            );

            if (!confirmed) {
                console.log(
                    'HORNO 28: migración de recetas cancelada.'
                );
                return;
            }

            for (const recipe of localRecipes) {

                await createRecipeInCloud(recipe);
            }

            /*
             * Volvemos a cargar desde Supabase para
             * obtener los UUID reales.
             */
            await loadRecipesFromCloud();

            alert(
                'Las fichas técnicas fueron migradas correctamente a Supabase.'
            );

        } catch (error) {

            console.error(
                'Error migrando recetas:',
                error
            );

            alert(
                'Ocurrió un problema durante la migración de las fichas técnicas.\n\n' +
                error.message
            );
        }
    }

    function installHooks() {

        if (initialized) return;

        initialized = true;

        const originalSaveRecipe =
            window.saveRecipe;

        const originalDeleteRecipe =
            window.deleteRecipe;

        /*
         * GUARDAR / EDITAR RECETA
         */
        window.saveRecipe = async function () {

            /*
             * Capturamos el ID antes de que la función
             * original cierre el modal.
             */
            const recipeId =
                document.getElementById(
                    'rec-id'
                )?.value || '';

            /*
             * Ejecutamos la función original.
             */
            originalSaveRecipe.apply(
                this,
                arguments
            );

            /*
             * Esperamos a que localStorage haya
             * sido actualizado.
             */
            setTimeout(async () => {

                await syncRecipeAfterSave(
                    recipeId
                );

            }, 150);
        };

        /*
         * ELIMINAR RECETA
         */
        window.deleteRecipe = async function (id) {

            const confirmed = confirm(
                '¿Deseas eliminar esta ficha técnica del sistema?'
            );

            if (!confirmed) return;

            try {

                /*
                 * Si ya es una receta de Supabase,
                 * eliminamos también su registro
                 * remoto.
                 */
                if (
                    id &&
                    !String(id).startsWith('rec-')
                ) {

                    await deleteRecipeFromCloud(id);
                }

                /*
                 * Actualizamos almacenamiento local.
                 */
                const localRecipes =
                    getLocalRecipes();

                const filtered =
                    localRecipes.filter(
                        item => item.id !== id
                    );

                saveLocalRecipes(filtered);

                /*
                 * Actualizamos la aplicación.
                 */
                if (
                    typeof window.renderRecipesGrid ===
                    'function'
                ) {
                    window.renderRecipesGrid();
                }

                if (
                    typeof window.renderPOSProducts ===
                    'function'
                ) {
                    window.renderPOSProducts();
                }

                console.log(
                    'HORNO 28: ficha técnica eliminada.'
                );

            } catch (error) {

                console.error(
                    'Error eliminando ficha:',
                    error
                );

                alert(
                    'No fue posible eliminar la ficha técnica.\n\n' +
                    error.message
                );
            }
        };

        console.log(
            'HORNO 28: sincronización de fichas activada.'
        );
    }

    async function initialize() {

        /*
         * Esperamos a que:
         * - Supabase exista
         * - exista el usuario
         * - exista el business_id
         * - existan las funciones originales
         */
        while (
            !window.horno28Supabase ||
            !window.HORNO28_CURRENT_BUSINESS_ID ||
            typeof window.saveRecipe !== 'function' ||
            typeof window.deleteRecipe !== 'function'
        ) {
            await new Promise(
                resolve => setTimeout(resolve, 300)
            );
        }

        console.log(
            'HORNO 28: preparando fichas técnicas online...'
        );

        /*
         * Si Supabase está vacío, ofrecemos migración.
         */
        await migrateLocalRecipesIfNeeded();

        /*
         * Si ya existen recetas en Supabase,
         * las cargamos.
         */
        await loadRecipesFromCloud();

        /*
         * Finalmente activamos la sincronización.
         */
        installHooks();

        console.log(
            'HORNO 28: FICHAS TÉCNICAS ONLINE ACTIVAS.'
        );
    }

    initialize();

})();
