(function () {
    'use strict';

    let initialized = false;

    function waitForDependencies() {
        if (
            !window.horno28Supabase ||
            !window.HORNO28_CURRENT_BUSINESS_ID ||
            typeof window.saveRecipe !== 'function' ||
            typeof window.deleteRecipe !== 'function'
        ) {
            setTimeout(waitForDependencies, 500);
            return;
        }

        if (!initialized) {
            initialized = true;
            initRecipesCloud();
        }
    }

    async function initRecipesCloud() {
        try {
            await loadRecipesFromCloud();
            installRecipeWrappers();
        } catch (error) {
            console.error('HORNO 28 - Error cargando fichas técnicas:', error);
            console.warn(
                'Las fichas técnicas locales se mantienen sin modificar.'
            );
            installRecipeWrappers();
        }
    }

    // ---------------------------------------------------------
    // CARGAR FICHAS DESDE SUPABASE
    // ---------------------------------------------------------

    async function loadRecipesFromCloud() {

        const businessId = window.HORNO28_CURRENT_BUSINESS_ID;

        if (!businessId) return;

        const { data: cloudRecipes, error: recipesError } =
            await window.horno28Supabase
                .from('recipes')
                .select('*')
                .eq('business_id', businessId)
                .eq('active', true)
                .order('created_at', { ascending: true });

        if (recipesError) {
            throw recipesError;
        }

        if (!cloudRecipes || cloudRecipes.length === 0) {

            const localRecipes =
                Array.isArray(window.recipes)
                    ? window.recipes
                    : [];

            if (localRecipes.length > 0) {

                const migrate = confirm(
                    'HORNO 28 encontró fichas técnicas guardadas localmente ' +
                    'que todavía no están en la nube.\n\n' +
                    '¿Deseas migrarlas ahora a Supabase?'
                );

                if (migrate) {
                    await migrateLocalRecipes(localRecipes);
                }
            }

            return;
        }

        const recipeIds = cloudRecipes.map(r => r.id);

        let cloudItems = [];

        if (recipeIds.length > 0) {

            const { data, error: itemsError } =
                await window.horno28Supabase
                    .from('recipe_items')
                    .select('*')
                    .in('recipe_id', recipeIds);

            if (itemsError) {
                throw itemsError;
            }

            cloudItems = data || [];
        }

        const mappedRecipes =
            cloudRecipes.map(recipe =>
                mapCloudRecipeToLocal(
                    recipe,
                    cloudItems.filter(
                        item => item.recipe_id === recipe.id
                    )
                )
            );

        window.recipes = mappedRecipes;

        if (typeof window.saveStorageData === 'function') {
            window.saveStorageData();
        }

        if (typeof window.renderRecipesGrid === 'function') {
            window.renderRecipesGrid();
        }

        if (typeof window.renderPOSProducts === 'function') {
            window.renderPOSProducts();
        }

        console.log(
            `HORNO 28: ${mappedRecipes.length} fichas técnicas cargadas desde Supabase.`
        );
    }

    // ---------------------------------------------------------
    // MAPEO SUPABASE -> APLICACIÓN
    // ---------------------------------------------------------

    function mapCloudRecipeToLocal(recipe, items) {

        return {
            id: recipe.id,

            name: recipe.name,

            category: recipe.category || '',

            price: Number(recipe.selling_price || 0),

            items: (items || []).map(item => ({
                ingredientId: item.ingredient_id,
                quantity: Number(item.quantity || 0)
            }))
        };
    }

    // ---------------------------------------------------------
    // OBTENER INGREDIENTES DE SUPABASE
    // ---------------------------------------------------------

    async function getCloudIngredients() {

        const businessId =
            window.HORNO28_CURRENT_BUSINESS_ID;

        const { data, error } =
            await window.horno28Supabase
                .from('ingredients')
                .select('id, name, unit, active')
                .eq('business_id', businessId)
                .eq('active', true);

        if (error) {
            throw error;
        }

        return data || [];
    }

    // ---------------------------------------------------------
    // RESOLVER INGREDIENTE LOCAL -> UUID SUPABASE
    // ---------------------------------------------------------

    async function resolveIngredientId(
        localIngredientId,
        cloudIngredients
    ) {

        // Si ya es un UUID, lo utilizamos directamente.
        if (
            typeof localIngredientId === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                localIngredientId
            )
        ) {
            return localIngredientId;
        }

        // Buscar ingrediente local.
        const localIngredient =
            Array.isArray(window.ingredients)
                ? window.ingredients.find(
                    ingredient =>
                        ingredient.id === localIngredientId
                )
                : null;

        if (!localIngredient) {

            throw new Error(
                `No se encontró el ingrediente local "${localIngredientId}".`
            );
        }

        // Buscar por nombre en Supabase.
        const match =
            cloudIngredients.find(
                ingredient =>
                    String(ingredient.name || '')
                        .trim()
                        .toLowerCase() ===
                    String(localIngredient.name || '')
                        .trim()
                        .toLowerCase()
            );

        if (!match) {

            throw new Error(
                `El ingrediente "${localIngredient.name}" ` +
                `no existe en Supabase. Créalo primero en Insumos y Stock.`
            );
        }

        return match.id;
    }

    // ---------------------------------------------------------
    // CONVERTIR INGREDIENTES DE UNA RECETA
    // ---------------------------------------------------------

    async function convertRecipeItems(recipe) {

        const cloudIngredients =
            await getCloudIngredients();

        const convertedItems = [];

        for (const item of recipe.items || []) {

            const cloudIngredientId =
                await resolveIngredientId(
                    item.ingredientId,
                    cloudIngredients
                );

            convertedItems.push({
                ingredient_id: cloudIngredientId,
                quantity: Number(item.quantity || 0),
                unit: null
            });
        }

        return convertedItems;
    }

    // ---------------------------------------------------------
    // CREAR RECETA EN SUPABASE
    // ---------------------------------------------------------

    async function createRecipeInCloud(recipe) {

        const businessId =
            window.HORNO28_CURRENT_BUSINESS_ID;

        const { data, error } =
            await window.horno28Supabase
                .from('recipes')
                .insert({
                    business_id: businessId,
                    name: recipe.name,
                    category: recipe.category || null,
                    yield_quantity: 1,
                    yield_unit: 'unidad',
                    selling_price: Number(recipe.price || 0),
                    active: true
                })
                .select()
                .single();

        if (error) {
            throw error;
        }

        const recipeItems =
            await convertRecipeItems(recipe);

        if (recipeItems.length > 0) {

            const rows =
                recipeItems.map(item => ({
                    recipe_id: data.id,
                    ingredient_id: item.ingredient_id,
                    quantity: item.quantity,
                    unit: item.unit
                }));

            const { error: itemsError } =
                await window.horno28Supabase
                    .from('recipe_items')
                    .insert(rows);

            if (itemsError) {

                // Evita dejar una receta incompleta.
                await window.horno28Supabase
                    .from('recipes')
                    .delete()
                    .eq('id', data.id);

                throw itemsError;
            }
        }

        return data;
    }

    // ---------------------------------------------------------
    // ACTUALIZAR RECETA
    // ---------------------------------------------------------

    async function updateRecipeInCloud(recipeId, recipe) {

        const { error } =
            await window.horno28Supabase
                .from('recipes')
                .update({
                    name: recipe.name,
                    category: recipe.category || null,
                    selling_price: Number(recipe.price || 0),
                    updated_at: new Date().toISOString()
                })
                .eq('id', recipeId)
                .eq(
                    'business_id',
                    window.HORNO28_CURRENT_BUSINESS_ID
                );

        if (error) {
            throw error;
        }

        const recipeItems =
            await convertRecipeItems(recipe);

        // Eliminar ingredientes anteriores.
        const { error: deleteError } =
            await window.horno28Supabase
                .from('recipe_items')
                .delete()
                .eq('recipe_id', recipeId);

        if (deleteError) {
            throw deleteError;
        }

        if (recipeItems.length > 0) {

            const rows =
                recipeItems.map(item => ({
                    recipe_id: recipeId,
                    ingredient_id: item.ingredient_id,
                    quantity: item.quantity,
                    unit: item.unit
                }));

            const { error: insertError } =
                await window.horno28Supabase
                    .from('recipe_items')
                    .insert(rows);

            if (insertError) {
                throw insertError;
            }
        }
    }

    // ---------------------------------------------------------
    // ELIMINAR RECETA
    // ---------------------------------------------------------

    async function deleteRecipeFromCloud(recipeId) {

        const { error } =
            await window.horno28Supabase
                .from('recipes')
                .delete()
                .eq('id', recipeId)
                .eq(
                    'business_id',
                    window.HORNO28_CURRENT_BUSINESS_ID
                );

        if (error) {
            throw error;
        }
    }

    // ---------------------------------------------------------
    // MIGRAR RECETAS LOCALES
    // ---------------------------------------------------------

    async function migrateLocalRecipes(localRecipes) {

        let migrated = 0;
        let skipped = 0;
        const problems = [];

        for (const recipe of localRecipes) {

            try {

                // No intentar migrar recetas que ya tengan UUID.
                const isAlreadyCloud =
                    typeof recipe.id === 'string' &&
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                        recipe.id
                    );

                if (isAlreadyCloud) {
                    continue;
                }

                await createRecipeInCloud(recipe);

                migrated++;

            } catch (error) {

                skipped++;

                problems.push(
                    `${recipe.name}: ${error.message}`
                );

                console.error(
                    `Error migrando "${recipe.name}":`,
                    error
                );
            }
        }

        // Recargar desde Supabase si al menos una migró.
        if (migrated > 0) {
            await loadRecipesFromCloud();
        }

        let message =
            `Migración de fichas técnicas finalizada.\n\n` +
            `Migradas: ${migrated}\n` +
            `No migradas: ${skipped}`;

        if (problems.length > 0) {

            message +=
                `\n\nProblemas encontrados:\n\n` +
                problems.join('\n');
        }

        alert(message);
    }

    // ---------------------------------------------------------
    // SINCRONIZACIÓN DESPUÉS DE GUARDAR
    // ---------------------------------------------------------

    async function syncRecipeAfterSave(recipe) {

        if (!recipe) return;

        const isCloudId =
            typeof recipe.id === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                recipe.id
            );

        try {

            if (isCloudId) {

                await updateRecipeInCloud(
                    recipe.id,
                    recipe
                );

            } else {

                const created =
                    await createRecipeInCloud(recipe);

                // Reemplazar ID local por UUID de Supabase.
                recipe.id = created.id;

                if (typeof window.saveStorageData === 'function') {
                    window.saveStorageData();
                }
            }

            console.log(
                'HORNO 28: ficha técnica sincronizada correctamente.'
            );

        } catch (error) {

            console.error(
                'HORNO 28 - Error sincronizando ficha:',
                error
            );

            alert(
                'La ficha técnica se guardó localmente, ' +
                'pero no pudo sincronizarse con Supabase.\n\n' +
                error.message
            );
        }
    }

    // ---------------------------------------------------------
    // INSTALAR WRAPPERS
    // ---------------------------------------------------------

    function installRecipeWrappers() {

        if (window.HORNO28_RECIPES_WRAPPED) {
            return;
        }

        window.HORNO28_RECIPES_WRAPPED = true;

        const originalSaveRecipe =
            window.saveRecipe;

        const originalDeleteRecipe =
            window.deleteRecipe;

        // ---------------------------
        // GUARDAR
        // ---------------------------

        window.saveRecipe = async function () {

            const previousRecipes =
                Array.isArray(window.recipes)
                    ? window.recipes.map(r => ({ ...r }))
                    : [];

            // Ejecutar función original.
            const result =
                originalSaveRecipe.apply(this, arguments);

            // Esperar a que el DOM/localStorage termine.
            await new Promise(resolve =>
                setTimeout(resolve, 100)
            );

            const currentRecipes =
                Array.isArray(window.recipes)
                    ? window.recipes
                    : [];

            // Encontrar la receta que acaba de cambiar.
            let changedRecipe = null;

            if (currentRecipes.length > 0) {

                // Comparar por nombre/precio/items.
                changedRecipe =
                    currentRecipes[
                        currentRecipes.length - 1
                    ];

                // Si encontramos una receta cuyo ID ya existía,
                // buscar específicamente esa.
                const previousIds =
                    new Set(
                        previousRecipes.map(r => r.id)
                    );

                const newRecipe =
                    currentRecipes.find(
                        r => !previousIds.has(r.id)
                    );

                if (newRecipe) {
                    changedRecipe = newRecipe;
                }
            }

            if (changedRecipe) {

                // No bloquear la interfaz.
                setTimeout(() => {
                    syncRecipeAfterSave(changedRecipe);
                }, 50);
            }

            return result;
        };

        // ---------------------------
        // ELIMINAR
        // ---------------------------

        window.deleteRecipe = async function (id) {

            const result =
                originalDeleteRecipe.apply(
                    this,
                    arguments
                );

            const isCloudId =
                typeof id === 'string' &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    id
                );

            if (isCloudId) {

                try {

                    await deleteRecipeFromCloud(id);

                    console.log(
                        'HORNO 28: ficha eliminada de Supabase.'
                    );

                } catch (error) {

                    console.error(
                        'Error eliminando ficha de Supabase:',
                        error
                    );

                    alert(
                        'La ficha fue eliminada localmente, ' +
                        'pero ocurrió un error al eliminarla de Supabase.\n\n' +
                        error.message
                    );
                }
            }

            return result;
        };
    }

    waitForDependencies();

})();
