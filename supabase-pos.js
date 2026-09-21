/* ============================================================
   HORNO 28 - SUPABASE POS
   POS + SALES + SALE ITEMS + INVENTORY + TREASURY
   ============================================================ */

(function () {
    'use strict';

    const VERSION = 'H28-POS-CLOUD-v1';

    window.HORNO28_POS_SYNC_VERSION = VERSION;

    console.log(`[${VERSION}] cargando...`);

    function waitForDependencies(callback, attempts = 0) {

        const ready =
            window.horno28Supabase &&
            window.HORNO28_CURRENT_BUSINESS_ID &&
            typeof window.processSale === 'function';

        if (ready) {
            callback();
            return;
        }

        if (attempts >= 100) {
            console.warn(
                `[${VERSION}] dependencias no disponibles.`
            );
            return;
        }

        setTimeout(
            () => waitForDependencies(callback, attempts + 1),
            300
        );
    }

    /* ============================================================
       ACCESO A VARIABLES LOCALES DEL APP
       ============================================================ */

    function getLocalSales() {
        try {
            return Array.isArray(sales) ? sales : [];
        } catch (e) {
            return [];
        }
    }

    function getLocalIngredients() {
        try {
            return Array.isArray(ingredients)
                ? ingredients
                : [];
        } catch (e) {
            return [];
        }
    }

    /* ============================================================
       PAYMENT METHOD
       ============================================================ */

    function mapPaymentMethod(value) {

        const text =
            String(value || '')
                .trim()
                .toUpperCase();

        if (text === 'EFECTIVO') {
            return 'cash';
        }

        if (
            text.includes('TARJETA') ||
            text.includes('DATÁFONO') ||
            text.includes('DATÁFONO')
        ) {
            return 'card';
        }

        if (
            text.includes('TRANSFERENCIA') ||
            text.includes('NEQUI')
        ) {
            return 'transfer';
        }

        if (text.includes('DAVIPLATA')) {
            return 'daviplata';
        }

        return 'other';
    }

    /* ============================================================
       CALCULAR TOTAL
       ============================================================ */

    function getCartTotal() {

        try {

            if (!Array.isArray(cart)) {
                return 0;
            }

            return cart.reduce(
                (total, item) =>
                    total +
                    (
                        (Number(item.price) || 0) *
                        (Number(item.qty) || 0)
                    ),
                0
            );

        } catch (e) {

            return 0;
        }
    }

    /* ============================================================
       CONVERTIR CART -> SUPABASE
       ============================================================ */

    function convertCartItems() {

        try {

            if (!Array.isArray(cart)) {
                return [];
            }

            return cart.map(item => {

                const quantity =
                    Number(item.qty) || 0;

                const unitPrice =
                    Number(item.price) || 0;

                return {
                    recipe_id:
                        isUUID(item.id)
                            ? item.id
                            : null,

                    product_name:
                        item.name || 'Producto',

                    quantity:
                        quantity,

                    unit_price:
                        unitPrice,

                    discount:
                        0,

                    total:
                        unitPrice * quantity
                };

            });

        } catch (e) {

            console.error(
                `[${VERSION}] Error convirtiendo carrito.`,
                e
            );

            return [];
        }
    }

    /* ============================================================
       UUID
       ============================================================ */

    function isUUID(value) {

        if (!value || typeof value !== 'string') {
            return false;
        }

        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            .test(value);
    }

    /* ============================================================
       REGISTRAR VENTA EN SUPABASE
       ============================================================ */

    async function registerSaleCloud() {

        const businessId =
            window.HORNO28_CURRENT_BUSINESS_ID;

        if (!businessId) {
            throw new Error(
                'No existe negocio activo.'
            );
        }

        const paymentElement =
            document.getElementById(
                'pos-payment-method'
            );

        const paymentMethod =
            mapPaymentMethod(
                paymentElement?.value
            );

        const total =
            getCartTotal();

        const items =
            convertCartItems();

        if (!items.length) {
            throw new Error(
                'La orden no contiene productos.'
            );
        }

        console.log(
            `[${VERSION}] Registrando venta cloud...`,
            {
                businessId,
                paymentMethod,
                total,
                items
            }
        );

        const { data, error } =
            await window.horno28Supabase.rpc(
                'register_pos_sale',
                {
                    p_business_id:
                        businessId,

                    p_customer_name:
                        '',

                    p_payment_method:
                        paymentMethod,

                    p_subtotal:
                        total,

                    p_discount:
                        0,

                    p_tax:
                        0,

                    p_total:
                        total,

                    p_items:
                        items
                }
            );

        if (error) {
            throw error;
        }

        console.log(
            `[${VERSION}] Venta registrada:`,
            data
        );

        return data;
    }

    /* ============================================================
       CARGAR HISTORIAL DESDE SUPABASE
       ============================================================ */

    async function loadCloudSales() {

        const businessId =
            window.HORNO28_CURRENT_BUSINESS_ID;

        const {
            data: cloudSales,
            error
        } =
            await window.horno28Supabase
                .from('sales')
                .select(`
                    *,
                    sale_items (
                        id,
                        recipe_id,
                        product_name,
                        quantity,
                        unit_price,
                        discount,
                        total
                    )
                `)
                .eq(
                    'business_id',
                    businessId
                )
                .order(
                    'sale_date',
                    {
                        ascending: false
                    }
                );

        if (error) {
            throw error;
        }

        const mapped =
            (cloudSales || []).map(
                sale => {

                    const items =
                        (
                            sale.sale_items ||
                            []
                        ).map(item => ({
                            name:
                                item.product_name,

                            qty:
                                Number(
                                    item.quantity
                                ) || 0,

                            price:
                                Number(
                                    item.unit_price
                                ) || 0
                        }));

                    return {

                        id:
                            sale.id,

                        date:
                            sale.sale_date,

                        category:
                            items[0]?.category ||
                            'Varios',

                        items:
                            items,

                        paymentMethod:
                            translatePaymentMethod(
                                sale.payment_method
                            ),

                        total:
                            Number(
                                sale.total
                            ) || 0
                    };
                }
            );

        try {

            sales = mapped;

        } catch (e) {

            console.error(
                `[${VERSION}] No se pudo actualizar sales.`,
                e
            );

        }

        if (
            typeof saveStorageData ===
            'function'
        ) {
            saveStorageData();
        }

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

        return mapped;
    }

    /* ============================================================
       TRADUCIR PAYMENT METHOD
       ============================================================ */

    function translatePaymentMethod(value) {

        switch (value) {

            case 'cash':
                return 'EFECTIVO';

            case 'card':
                return 'TARJETA / DATÁFONO';

            case 'transfer':
                return 'TRANSFERENCIA / NEQUI';

            case 'nequi':
                return 'NEQUI';

            case 'daviplata':
                return 'DAVIPLATA';

            default:
                return 'OTRO';
        }
    }

    /* ============================================================
       WRAPPER PROCESS SALE
       ============================================================ */

    const originalProcessSale =
        window.processSale;

    window.processSale = async function () {

        /*
         * Validación inicial.
         */

        try {

            if (
                typeof cart ===
                'undefined' ||
                !Array.isArray(cart) ||
                cart.length === 0
            ) {

                if (
                    typeof showNotification ===
                    'function'
                ) {
                    showNotification(
                        'La orden está vacía.',
                        'error'
                    );
                }

                return;
            }

            /*
             * Registrar directamente en Supabase.
             *
             * La RPC se encarga de:
             *
             * sales
             * sale_items
             * inventory
             * inventory_movements
             * cash_transactions
             */

            const saleId =
                await registerSaleCloud();

            /*
             * Limpiar carrito.
             */

            cart = [];

            if (
                typeof renderCart ===
                'function'
            ) {
                renderCart();
            }

            /*
             * Recargar datos cloud.
             */

            await loadCloudSales();

            /*
             * Recargar inventario.
             */

            if (
                typeof window.HORNO28_LOAD_INVENTORY_CLOUD ===
                'function'
            ) {
                await window
                    .HORNO28_LOAD_INVENTORY_CLOUD();
            }

            if (
                typeof renderInventoryTable ===
                'function'
            ) {
                renderInventoryTable();
            }

            if (
                typeof renderDashboard ===
                'function'
            ) {
                renderDashboard();
            }

            if (
                typeof showNotification ===
                'function'
            ) {
                showNotification(
                    'Venta registrada correctamente en Supabase. Inventario y tesorería actualizados.'
                );
            }

            console.log(
                `[${VERSION}] PIT STOP completado:`,
                saleId
            );

        } catch (error) {

            console.error(
                `[${VERSION}] Error registrando venta:`,
                error
            );

            if (
                typeof showNotification ===
                'function'
            ) {
                showNotification(
                    'No fue posible registrar la venta: ' +
                    (
                        error?.message ||
                        error
                    ),
                    'error'
                );
            }
        }
    };

    /* ============================================================
       INICIALIZACIÓN
       ============================================================ */

    async function initializePOSCloud() {

        console.log(
            `[${VERSION}] sincronizando historial POS...`
        );

        try {

            await loadCloudSales();

            console.log(
                `[${VERSION}] POS sincronizado correctamente.`
            );

        } catch (error) {

            console.error(
                `[${VERSION}] Error cargando ventas cloud:`,
                error
            );
        }
    }

    /* ============================================================
       START
       ============================================================ */

    waitForDependencies(
        initializePOSCloud
    );

})();
