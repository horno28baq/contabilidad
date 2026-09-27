/* ============================================================
   HORNO 28 — ELIMINACIÓN REAL DE VENTAS POS
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
            'También se eliminará su movimiento de Tesorería ' +
            'y se restaurará el inventario consumido.'
        );

        if (!confirmed) return;

        console.log(TAG, 'Eliminando venta:', saleId);

        const { data, error } =
            await window.horno28Supabase.rpc(
                'delete_pos_sale',
                {
                    p_business_id: window.HORNO28_CURRENT_BUSINESS_ID,
                    p_sale_id: saleId
                }
            );

        if (error) {
            console.error(TAG, error);

            alert(
                'No se pudo eliminar la venta.\n\n' +
                error.message
            );

            return;
        }

        console.log(
            TAG,
            'Venta eliminada correctamente:',
            data
        );

        /* --------------------------------------------------------
           ACTUALIZAR DATOS LOCALES / VISUALES
           -------------------------------------------------------- */

        if (typeof sales !== 'undefined') {
            sales = sales.filter(function (s) {
                return s.id !== saleId;
            });
        }

        if (typeof transactions !== 'undefined') {
            transactions = transactions.filter(function (t) {
                return t.saleId !== saleId;
            });
        }

        try {

            localStorage.setItem(
                'h28_sales',
                JSON.stringify(
                    typeof sales !== 'undefined' ? sales : []
                )
            );

            localStorage.setItem(
                'h28_transactions',
                JSON.stringify(
                    typeof transactions !== 'undefined'
                        ? transactions
                        : []
                )
            );

        } catch (e) {

            console.warn(
                TAG,
                'No se pudo actualizar cache local.',
                e
            );
        }

        /* --------------------------------------------------------
           REFRESCAR INTERFAZ
           -------------------------------------------------------- */

        if (typeof renderSalesHistory === 'function') {
            renderSalesHistory();
        }

        if (typeof renderDashboard === 'function') {
            renderDashboard();
        }

        if (typeof renderInventoryTable === 'function') {
            renderInventoryTable();
        }

        if (
            typeof window.HORNO28_REFRESH_TREASURY ===
            'function'
        ) {
            window.HORNO28_REFRESH_TREASURY();
        }

        alert(
            'Venta eliminada correctamente.\n\n' +
            '✓ Venta eliminada de Supabase\n' +
            '✓ Movimiento de caja eliminado\n' +
            '✓ Inventario restaurado'
        );
    }

    /* ------------------------------------------------------------
       EXPONER FUNCIÓN GLOBAL
       ------------------------------------------------------------ */

    window.HORNO28_DELETE_SALE = deleteSaleCloud;

    /*
       También reemplazamos la función global utilizada
       actualmente por el POS.
    */
    window.deleteSale = deleteSaleCloud;

    console.log(
        TAG,
        'Módulo de eliminación cargado correctamente.'
    );

})();
