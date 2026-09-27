/* ============================================================
   HORNO 28 — ELIMINACIÓN REAL DE VENTAS POS
   VERSIÓN ROBUSTA
   ============================================================ */

(function () {

    'use strict';

    const TAG = '[H28-SALES-DELETE]';

    console.log(TAG, 'Inicializando módulo...');


    /* =========================================================
       SUPABASE
       ========================================================= */

    function getSupabase() {
        return window.horno28Supabase || null;
    }


    function getBusinessId() {
        return window.HORNO28_CURRENT_BUSINESS_ID || null;
    }


    /* =========================================================
       ELIMINAR VENTA EN SUPABASE
       ========================================================= */

    async function deleteSaleCloud(saleId) {

        console.log(TAG, 'Solicitud de eliminación:', saleId);

        if (!saleId) {
            alert('No se encontró el ID de la venta.');
            return false;
        }


        const supabase = getSupabase();
        const businessId = getBusinessId();


        if (!supabase) {

            alert(
                'La conexión con Supabase todavía no está disponible.'
            );

            return false;
        }


        if (!businessId) {

            alert(
                'No se encontró el negocio actual.'
            );

            return false;
        }


        const confirmed = confirm(
            '¿Deseas eliminar DEFINITIVAMENTE esta venta?\n\n' +

            'Se eliminará de:\n' +
            '✓ Punto de Venta\n' +
            '✓ Libro Diario / Tesorería\n' +
            '✓ Historial de ventas\n' +
            '✓ Movimientos de inventario\n\n' +

            'Además, se restaurará el inventario consumido.'
        );


        if (!confirmed) {
            return false;
        }


        console.log(
            TAG,
            'Ejecutando RPC delete_pos_sale...'
        );


        try {

            const { data, error } =
                await supabase.rpc(
                    'delete_pos_sale',
                    {
                        p_business_id: businessId,
                        p_sale_id: saleId
                    }
                );


            if (error) {

                console.error(
                    TAG,
                    'ERROR SUPABASE:',
                    error
                );

                alert(
                    'NO SE PUDO ELIMINAR LA VENTA.\n\n' +
                    error.message
                );

                return false;
            }


            console.log(
                TAG,
                'RPC ejecutado correctamente:',
                data
            );


            /* =================================================
               ACTUALIZAR DATOS LOCALES
               ================================================= */

            try {

                if (
                    typeof sales !== 'undefined' &&
                    Array.isArray(sales)
                ) {

                    sales = sales.filter(
                        function (sale) {
                            return sale.id !== saleId;
                        }
                    );

                }

            } catch (error) {

                console.warn(
                    TAG,
                    'No se pudo actualizar sales local:',
                    error
                );

            }


            try {

                if (
                    typeof transactions !== 'undefined' &&
                    Array.isArray(transactions)
                ) {

                    transactions = transactions.filter(
                        function (transaction) {

                            return (
                                transaction.saleId !== saleId &&
                                transaction.sale_id !== saleId
                            );

                        }
                    );

                }

            } catch (error) {

                console.warn(
                    TAG,
                    'No se pudo actualizar transactions local:',
                    error
                );

            }


            /* =================================================
               ACTUALIZAR LOCALSTORAGE
               ================================================= */

            try {

                localStorage.setItem(
                    'h28_sales',
                    JSON.stringify(
                        typeof sales !== 'undefined'
                            ? sales
                            : []
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

            } catch (error) {

                console.warn(
                    TAG,
                    'No se pudo actualizar localStorage:',
                    error
                );

            }


            /* =================================================
               ACTUALIZAR INTERFAZ
               ================================================= */

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
                typeof window.HORNO28_REFRESH_TREASURY ===
                'function'
            ) {

                await window.HORNO28_REFRESH_TREASURY();

            }


            /* =================================================
               MENSAJE FINAL
               ================================================= */

            alert(
                'VENTA ELIMINADA CORRECTAMENTE.\n\n' +

                '✓ Venta eliminada de Supabase\n' +
                '✓ Detalle de venta eliminado\n' +
                '✓ Movimiento de tesorería eliminado\n' +
                '✓ Movimientos de inventario eliminados\n' +
                '✓ Inventario restaurado'
            );


            console.log(
                TAG,
                'ELIMINACIÓN COMPLETADA:',
                saleId
            );


            return true;


        } catch (error) {

            console.error(
                TAG,
                'ERROR INESPERADO:',
                error
            );


            alert(
                'Ocurrió un error al eliminar la venta.\n\n' +
                error.message
            );


            return false;

        }

    }


    /* =========================================================
       FUNCIÓN GLOBAL
       ========================================================= */

    window.HORNO28_DELETE_SALE =
        deleteSaleCloud;


    /*
       La dejamos también disponible por compatibilidad.
    */

    window.deleteSale =
        deleteSaleCloud;


    /* =========================================================
       INTERCEPTOR ROBUSTO DEL BOTÓN POS
       =========================================================

       Esto es importante.

       El HTML original contiene:

       onclick="deleteSale('ID')"

       En lugar de depender de que ese onclick llame
       correctamente a nuestra función, interceptamos el
       clic antes de que llegue al HTML original.
    */

    document.addEventListener(
        'click',
        function (event) {

            const button =
                event.target.closest(
                    'button[onclick*="deleteSale("]'
                );


            if (!button) {
                return;
            }


            console.log(
                TAG,
                'Botón eliminar POS detectado.'
            );


            const onclickCode =
                button.getAttribute('onclick');


            if (!onclickCode) {
                return;
            }


            const match =
                onclickCode.match(
                    /deleteSale\(\s*['"]([^'"]+)['"]\s*\)/
                );


            if (!match) {

                console.warn(
                    TAG,
                    'No se pudo extraer el ID de la venta.',
                    onclickCode
                );

                return;
            }


            const saleId =
                match[1];


            console.log(
                TAG,
                'ID detectado:',
                saleId
            );


            /*
               Detenemos completamente el onclick original.
            */

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();


            /*
               Ejecutamos nuestra eliminación real.
            */

            deleteSaleCloud(saleId);

        },
        true
    );


    /* =========================================================
       INFORMACIÓN DE DIAGNÓSTICO
       ========================================================= */

    console.log(
        TAG,
        'Módulo cargado correctamente.'
    );

    console.log(
        TAG,
        'Supabase disponible:',
        !!window.horno28Supabase
    );

    console.log(
        TAG,
        'Función HORNO28_DELETE_SALE disponible:',
        typeof window.HORNO28_DELETE_SALE
    );

})();
