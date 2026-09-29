/* HORNO 28 — Supabase Realtime
   v1
   Este archivo escucha cambios en las tablas de HORNO 28 y solicita
   a los módulos de la aplicación que vuelvan a cargar sus datos desde Supabase.
*/
(function () {
    'use strict';

    const SB = window.horno28Supabase;

    if (!SB) {
        console.error('[HORNO28 Realtime] No se encontró window.horno28Supabase.');
        return;
    }

    const businessId = () => window.HORNO28_CURRENT_BUSINESS_ID || null;

    // Evita tormentas de refresco cuando una operación genera varios eventos.
    let refreshTimer = null;
    const pending = new Set();

    function scheduleRefresh(scope) {
        pending.add(scope);
        clearTimeout(refreshTimer);

        refreshTimer = setTimeout(() => {
            const scopes = [...pending];
            pending.clear();
            refreshTimer = null;

            scopes.forEach(runRefresh);
        }, 350);
    }

    async function runRefresh(scope) {
        try {
            switch (scope) {
                case 'inventory':
                    if (typeof window.HORNO28_REFRESH_INVENTORY === 'function') {
                        await window.HORNO28_REFRESH_INVENTORY();
                    } else if (window.HORNO28_INVENTORY &&
                               typeof window.HORNO28_INVENTORY.load === 'function') {
                        await window.HORNO28_INVENTORY.load();
                    }
                    break;

                case 'recipes':
                    if (typeof window.HORNO28_REFRESH_RECIPES === 'function') {
                        await window.HORNO28_REFRESH_RECIPES();
                    } else if (window.HORNO28_RECIPES &&
                               typeof window.HORNO28_RECIPES.load === 'function') {
                        await window.HORNO28_RECIPES.load();
                    }
                    break;

                case 'providers':
                    if (window.HORNO28_PROVIDERS &&
                        typeof window.HORNO28_PROVIDERS.load === 'function') {
                        await window.HORNO28_PROVIDERS.load();
                    }
                    break;

                case 'parallel':
                    if (window.HORNO28_PARALLEL &&
                        typeof window.HORNO28_PARALLEL.load === 'function') {
                        await window.HORNO28_PARALLEL.load();
                    }
                    break;

                case 'pos':
                    if (typeof window.HORNO28_REFRESH_POS === 'function') {
                        await window.HORNO28_REFRESH_POS();
                    }
                    break;

                case 'treasury':
                    if (typeof window.HORNO28_REFRESH_TREASURY === 'function') {
                        await window.HORNO28_REFRESH_TREASURY();
                    }
                    break;
            }

            document.dispatchEvent(new CustomEvent('horno28:realtime-refresh', {
                detail: { scope }
            }));
        } catch (err) {
            console.error('[HORNO28 Realtime] Error refrescando', scope, err);
        }
    }

    function channelName() {
        return 'horno28-db-' + (businessId() || 'pending');
    }

    function subscribe() {
        const id = businessId();

        if (!id) {
            console.warn('[HORNO28 Realtime] Aún no hay business_id. Reintentando...');
            setTimeout(subscribe, 1500);
            return;
        }

        // Si ya existe un canal activo para este negocio, no duplicarlo.
        if (window.HORNO28_REALTIME_CHANNEL &&
            window.HORNO28_REALTIME_CHANNEL.__businessId === id) {
            return;
        }

        if (window.HORNO28_REALTIME_CHANNEL) {
            try {
                SB.removeChannel(window.HORNO28_REALTIME_CHANNEL);
            } catch (_) {}
        }

        const channel = SB
            .channel(channelName())
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'ingredients',
                  filter: 'business_id=eq.' + id },
                () => scheduleRefresh('inventory')
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'recipes',
                  filter: 'business_id=eq.' + id },
                () => scheduleRefresh('recipes')
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'recipe_items' },
                () => scheduleRefresh('recipes')
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'suppliers',
                  filter: 'business_id=eq.' + id },
                () => scheduleRefresh('providers')
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'supplier_products' },
                () => scheduleRefresh('providers')
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'parallel_costs',
                  filter: 'business_id=eq.' + id },
                () => scheduleRefresh('parallel')
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'parallel_cost_items' },
                () => scheduleRefresh('parallel')
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'sales',
                  filter: 'business_id=eq.' + id },
                () => {
                    scheduleRefresh('pos');
                    scheduleRefresh('treasury');
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'sale_items' },
                () => scheduleRefresh('pos')
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'cash_transactions',
                  filter: 'business_id=eq.' + id },
                () => scheduleRefresh('treasury')
            )
            .subscribe((status) => {
                console.log('[HORNO28 Realtime]', status);
                document.dispatchEvent(new CustomEvent('horno28:realtime-status', {
                    detail: { status, businessId: id }
                }));
            });

        channel.__businessId = id;
        window.HORNO28_REALTIME_CHANNEL = channel;
        window.HORNO28_REALTIME = {
            status: () => channel,
            resubscribe: () => {
                try { SB.removeChannel(channel); } catch (_) {}
                window.HORNO28_REALTIME_CHANNEL = null;
                subscribe();
            }
        };
    }

    // Auth puede tardar unos instantes en establecer CURRENT_BUSINESS_ID.
    const start = () => setTimeout(subscribe, 500);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    // Permite que supabase-auth.js avise cuando el negocio ya está listo.
    window.addEventListener('horno28:auth-ready', () => {
        setTimeout(subscribe, 100);
    });
})();
