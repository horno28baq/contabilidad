/* ============================================================
   HORNO 28 — ELIMINACIÓN REAL DE VENTAS POS
   ETAPA 4
   ============================================================ */

(function () {

    'use strict';

    const TAG = '[H28-SALES-DELETE]';

    async function deleteSaleCloud(saleId) {

        if (!saleId) {
            alert('No se encontró el ID de la venta.');
            return;
        }

        if (!window.horno28Supabase) {
            alert('La conexión con Supabase todavía no está disponible.');
            return;
        }

        if (!window.HORNO28_CURRENT_BUSINESS_ID) {
            alert('No se encontró el negocio actual.');
            return;
        }

        const confirmed = confirm(
            '¿Deseas eliminar definitivamente esta venta?\n\n' +
            'También se eliminará su movimiento de Tesorería y se restaurará el inventario consumido.'
        );

        if (!confirmed) {
            return;
        }

        console.log(
            TAG,
            'Eliminando venta:',
            saleId
        );

        const { data, error } =
            await window.horno28Supabase
                .rpc(
                    'delete_pos_sale',
                    {
                        p_business_id:
                            window.HORNO28_CURRENT_BUSINESS_ID,

                        p_sale_id:
                            saleId
                    }
                );

        if (error) {

            console.error(
                TAG,
                error
            );

            alert(
                'No se pudo eliminar la venta:\n\n' +
                error.message
            );

            return;
        }

        console.log(
            TAG,
            'Venta eliminada correctamente:',
            data
        );

        /*
         * Actualizar memoria local inmediatamente.
         */

        if (typeof sales !== 'undefined') {

            sales =
                sales.filter(
                    s => s.id !== saleId
                );

        }

        /*
         * Eliminar también el movimiento
         * asociado de la memoria local.
         */

        if (
            typeof transactions !== 'undefined'
        ) {

            transactions =
                transactions.filter(
                    t => t.saleId !== saleId
                );

        }

        /*
         * Actualizar cache local.
         */

        try {

            localStorage.setItem(
                'h28_sales',
                JSON.stringify(sales || [])
            );

            localStorage.setItem(
                'h28_transactions',
                JSON.stringify(
                    transactions || []
                )
            );

        } catch (e) {

            console.warn(
                TAG,
                'No se pudo actualizar cache local.',
                e
            );

        }

        /*
         * Refrescar las vistas.
         */

        if (
            typeof renderSalesHistory ===
            'function'
        ) {

            renderSalesHistory();

        }

        if (
            typeof renderDashboard ===
            'function'
        ) {

            renderDashboard();

        }

        if (
            typeof renderInventoryTable ===
            'function'
        ) {

            renderInventoryTable();

        }

        if (
            typeof window.HORNO28_DELETE_TRANSACTION ===
            'function'
        ) {

            /*
             * La tesorería será refrescada
             * por el módulo de tesorería.
             */

        }

        /*
         * Intentar refrescar Tesorería
         * sin recargar toda la página.
         */

        const treasury =
            document.getElementById(
                'h28-cloud-ledger'
            );

        if (treasury) {

            treasury.dataset.filter =
                treasury.dataset.filter ||
                'day';

        }

        if (
            typeof window.HORNO28_REFRESH_TREASURY ===
            'function'
        ) {

            window.HORNO28_REFRESH_TREASURY();

        }

        alert(
            'Venta eliminada correctamente.\n\n' +
            '✓ Venta eliminada\n' +
            '✓ Movimiento de caja eliminado\n' +
            '✓ Inventario restaurado'
        );

    }

    /*
     * Exponer función global.
     */

    window.HORNO28_DELETE_SALE =
        deleteSaleCloud;

    /*
     * Importante:
     * El botón original del POS utiliza deleteSale().
     * Sobrescribimos esa función para que ahora
     * elimine realmente en Supabase.
     */

    window.deleteSale =
        deleteSaleCloud;

    console.log(
        TAG,
        'Módulo de eliminación cargado.'
    );

})();
