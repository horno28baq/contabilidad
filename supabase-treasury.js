/* ============================================================
   HORNO 28 — CAJA Y TESORERÍA / LIBRO DIARIO
   ============================================================ */

(function () {

    'use strict';

    const TAG = '[H28-TREASURY]';

    let treasuryTransactions = [];
    let currentLedgerFilter = 'day';

    /* ============================================================
       UTILIDADES
       ============================================================ */

    function getSupabase() {
        return window.horno28Supabase || null;
    }

    function getBusinessId() {
        return window.HORNO28_CURRENT_BUSINESS_ID || null;
    }

    function money(value) {
        const number = Number(value || 0);

        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            maximumFractionDigits: 0
        }).format(number);
    }

    function escapeHtml(value) {

        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

    }

    function formatDate(dateValue) {

        if (!dateValue) return '-';

        const date = new Date(dateValue);

        if (isNaN(date.getTime())) return '-';

        return date.toLocaleDateString('es-CO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

    }

    function formatTime(dateValue) {

        if (!dateValue) return '';

        const date = new Date(dateValue);

        if (isNaN(date.getTime())) return '';

        return date.toLocaleTimeString('es-CO', {
            hour: '2-digit',
            minute: '2-digit'
        });

    }

    function getTransactionDate(transaction) {

        return transaction.transaction_date ||
               transaction.date ||
               transaction.created_at ||
               null;

    }

    /* ============================================================
       FILTROS DE FECHA
       ============================================================ */

    function isToday(dateValue) {

        if (!dateValue) return false;

        const date = new Date(dateValue);
        const now = new Date();

        return (
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate()
        );

    }

    function isThisMonth(dateValue) {

        if (!dateValue) return false;

        const date = new Date(dateValue);
        const now = new Date();

        return (
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth()
        );

    }

    function getFilteredTransactions() {

        if (currentLedgerFilter === 'day') {

            return treasuryTransactions.filter(function (transaction) {
                return isToday(getTransactionDate(transaction));
            });

        }

        if (currentLedgerFilter === 'month') {

            return treasuryTransactions.filter(function (transaction) {
                return isThisMonth(getTransactionDate(transaction));
            });

        }

        return [...treasuryTransactions];

    }

    /* ============================================================
       CARGAR MOVIMIENTOS DESDE SUPABASE
       ============================================================ */

    async function loadTransactions() {

        const supabase = getSupabase();
        const businessId = getBusinessId();

        if (!supabase) {
            console.warn(
                TAG,
                'Supabase todavía no está disponible.'
            );
            return;
        }

        if (!businessId) {
            console.warn(
                TAG,
                'No existe HORNO28_CURRENT_BUSINESS_ID.'
            );
            return;
        }

        console.log(
            TAG,
            'Cargando movimientos del negocio:',
            businessId
        );

        const { data, error } = await supabase
            .from('cash_transactions')
            .select('*')
            .eq('business_id', businessId)
            .order('transaction_date', {
                ascending: false
            });

        if (error) {

            console.error(
                TAG,
                'Error cargando movimientos:',
                error
            );

            return;
        }

        treasuryTransactions = Array.isArray(data)
            ? data
            : [];

        /*
           Mantener también una representación compatible
           con la variable transactions de la aplicación.
        */

        try {

            if (typeof transactions !== 'undefined') {

                transactions.length = 0;

                treasuryTransactions.forEach(function (row) {

                    transactions.push({
                        id: row.id,
                        date: row.transaction_date,
                        type: row.type,
                        concept: row.description,
                        amount: Number(row.amount || 0),
                        paymentMethod: row.payment_method,
                        category: row.category,
                        reference: row.reference,
                        notes: row.notes,
                        saleId: row.sale_id
                    });

                });

            }

        } catch (e) {

            console.warn(
                TAG,
                'No fue posible sincronizar transactions local.',
                e
            );

        }

        renderLedger();

        console.log(
            TAG,
            'Movimientos cargados:',
            treasuryTransactions.length
        );

    }

    /* ============================================================
       RESUMEN
       ============================================================ */

    function calculateSummary(rows) {

        let income = 0;
        let expense = 0;

        rows.forEach(function (row) {

            const amount = Number(row.amount || 0);

            if (row.type === 'income') {
                income += amount;
            }

            if (row.type === 'expense') {
                expense += amount;
            }

        });

        return {
            income,
            expense,
            balance: income - expense,
            count: rows.length
        };

    }

    /* ============================================================
       BOTONES DE FILTRO
       ============================================================ */

    function filterButton(label, filter) {

        const active = currentLedgerFilter === filter;

        return `
            <button
                type="button"
                onclick="HORNO28_SET_LEDGER_FILTER('${filter}')"
                class="
                    px-4 py-2
                    rounded-lg
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    transition-all
                    border
                    ${
                        active
                            ? 'bg-f1Red text-white border-f1Red shadow-lg'
                            : 'bg-asphalt text-gray-400 border-carbonBorder hover:text-white hover:border-f1Red'
                    }
                "
            >
                ${label}
            </button>
        `;

    }

    /* ============================================================
       RENDER LIBRO DIARIO
       ============================================================ */

    function renderLedger() {

        const tab = document.getElementById('tab-treasury');

        if (!tab) {
            console.warn(
                TAG,
                'No se encontró #tab-treasury.'
            );
            return;
        }

        let panel = document.getElementById(
            'h28-cloud-ledger'
        );

        if (!panel) {

            panel = document.createElement('div');

            panel.id = 'h28-cloud-ledger';

            /*
               Lo colocamos al comienzo de Caja/Tesorería,
               antes del contenido original.
            */

            tab.insertBefore(
                panel,
                tab.firstElementChild
            );

        }

        const rows = getFilteredTransactions();

        const summary = calculateSummary(rows);

        panel.innerHTML = `

            <!-- ==================================================
                 HORNO 28 — LIBRO DIARIO
                 ================================================== -->

            <div class="
                bg-carbon
                rounded-2xl
                border
                border-carbonBorder
                shadow-2xl
                p-5
                mb-6
                text-white
            ">

                <!-- HEADER -->

                <div class="
                    flex
                    flex-col
                    lg:flex-row
                    lg:items-center
                    lg:justify-between
                    gap-4
                ">

                    <div>

                        <div class="
                            flex
                            items-center
                            gap-3
                        ">

                            <div class="
                                w-11
                                h-11
                                rounded-xl
                                bg-f1Red
                                flex
                                items-center
                                justify-center
                                shadow-lg
                            ">

                                <i class="
                                    fa-solid
                                    fa-book-open
                                    text-white
                                    text-lg
                                "></i>

                            </div>

                            <div>

                                <h2 class="
                                    font-teko
                                    text-3xl
                                    sm:text-4xl
                                    font-extrabold
                                    tracking-wider
                                    text-white
                                    uppercase
                                    leading-none
                                ">
                                    LIBRO <span class="text-f1Red">DIARIO</span>
                                </h2>

                                <p class="
                                    text-[10px]
                                    sm:text-xs
                                    text-gray-400
                                    uppercase
                                    tracking-widest
                                    mt-1
                                ">
                                    INGRESOS · EGRESOS · MOVIMIENTOS · TESORERÍA
                                </p>

                            </div>

                        </div>

                    </div>

                    <!-- FILTROS -->

                    <div class="
                        flex
                        flex-wrap
                        gap-2
                    ">

                        ${filterButton('DÍA', 'day')}

                        ${filterButton('MES', 'month')}

                        ${filterButton('TODOS', 'all')}

                    </div>

                </div>


                <!-- ==================================================
                     SUMMARY CARDS
                     ================================================== -->

                <div class="
                    grid
                    grid-cols-1
                    sm:grid-cols-2
                    lg:grid-cols-4
                    gap-3
                    mt-5
                ">

                    <!-- INGRESOS -->

                    <div class="
                        bg-asphalt
                        border
                        border-carbonBorder
                        rounded-xl
                        p-4
                    ">

                        <div class="
                            flex
                            items-center
                            justify-between
                        ">

                            <span class="
                                text-[10px]
                                font-bold
                                uppercase
                                tracking-widest
                                text-gray-400
                            ">
                                INGRESOS
                            </span>

                            <i class="
                                fa-solid
                                fa-arrow-trend-up
                                text-telemetryGreen
                            "></i>

                        </div>

                        <div class="
                            font-teko
                            text-3xl
                            font-extrabold
                            text-telemetryGreen
                            mt-1
                        ">
                            ${money(summary.income)}
                        </div>

                    </div>


                    <!-- EGRESOS -->

                    <div class="
                        bg-asphalt
                        border
                        border-carbonBorder
                        rounded-xl
                        p-4
                    ">

                        <div class="
                            flex
                            items-center
                            justify-between
                        ">

                            <span class="
                                text-[10px]
                                font-bold
                                uppercase
                                tracking-widest
                                text-gray-400
                            ">
                                EGRESOS
                            </span>

                            <i class="
                                fa-solid
                                fa-arrow-trend-down
                                text-f1Red
                            "></i>

                        </div>

                        <div class="
                            font-teko
                            text-3xl
                            font-extrabold
                            text-f1Red
                            mt-1
                        ">
                            ${money(summary.expense)}
                        </div>

                    </div>


                    <!-- BALANCE -->

                    <div class="
                        bg-asphalt
                        border
                        border-carbonBorder
                        rounded-xl
                        p-4
                    ">

                        <div class="
                            flex
                            items-center
                            justify-between
                        ">

                            <span class="
                                text-[10px]
                                font-bold
                                uppercase
                                tracking-widest
                                text-gray-400
                            ">
                                BALANCE
                            </span>

                            <i class="
                                fa-solid
                                fa-scale-balanced
                                text-gold
                            "></i>

                        </div>

                        <div class="
                            font-teko
                            text-3xl
                            font-extrabold
                            text-gold
                            mt-1
                        ">
                            ${money(summary.balance)}
                        </div>

                    </div>


                    <!-- MOVIMIENTOS -->

                    <div class="
                        bg-asphalt
                        border
                        border-carbonBorder
                        rounded-xl
                        p-4
                    ">

                        <div class="
                            flex
                            items-center
                            justify-between
                        ">

                            <span class="
                                text-[10px]
                                font-bold
                                uppercase
                                tracking-widest
                                text-gray-400
                            ">
                                MOVIMIENTOS
                            </span>

                            <i class="
                                fa-solid
                                fa-list
                                text-white
                            "></i>

                        </div>

                        <div class="
                            font-teko
                            text-3xl
                            font-extrabold
                            text-white
                            mt-1
                        ">
                            ${summary.count}
                        </div>

                    </div>

                </div>


                <!-- ==================================================
                     TABLA
                     ================================================== -->

                <div class="
                    mt-5
                    overflow-x-auto
                    rounded-xl
                    border
                    border-carbonBorder
                ">

                    <table class="
                        min-w-full
                        text-sm
                    ">

                        <thead class="
                            bg-asphalt
                            text-gray-400
                            uppercase
                            text-[10px]
                            tracking-wider
                        ">

                            <tr>

                                <th class="p-3 text-left">
                                    FECHA
                                </th>

                                <th class="p-3 text-left">
                                    TIPO
                                </th>

                                <th class="p-3 text-left">
                                    CATEGORÍA
                                </th>

                                <th class="p-3 text-left">
                                    DESCRIPCIÓN
                                </th>

                                <th class="p-3 text-left">
                                    MÉTODO
                                </th>

                                <th class="p-3 text-right">
                                    VALOR
                                </th>

                                <th class="p-3 text-center">
                                    ORIGEN
                                </th>

                                <th class="p-3 text-center">
                                    ACCIÓN
                                </th>

                            </tr>

                        </thead>

                        <tbody
                            id="h28-ledger-body"
                            class="bg-carbon"
                        >

                            ${
                                rows.length
                                    ? rows.map(renderTransactionRow).join('')
                                    : `
                                        <tr>

                                            <td
                                                colspan="8"
                                                class="
                                                    p-8
                                                    text-center
                                                    text-gray-500
                                                "
                                            >

                                                <i class="
                                                    fa-solid
                                                    fa-inbox
                                                    text-3xl
                                                    mb-3
                                                    block
                                                "></i>

                                                NO HAY MOVIMIENTOS
                                                PARA ESTE PERÍODO

                                            </td>

                                        </tr>
                                    `
                            }

                        </tbody>

                    </table>

                </div>

            </div>
        `;

    }

    /* ============================================================
       FILA DE MOVIMIENTO
       ============================================================ */

    function renderTransactionRow(row) {

        const date = getTransactionDate(row);

        const isIncome = row.type === 'income';

        const typeLabel = isIncome
            ? 'INGRESO'
            : 'EGRESO';

        const typeClass = isIncome
            ? 'text-telemetryGreen'
            : 'text-f1Red';

        const typeIcon = isIncome
            ? 'fa-arrow-up'
            : 'fa-arrow-down';

        const paymentLabels = {
            cash: 'EFECTIVO',
            card: 'TARJETA',
            transfer: 'TRANSFERENCIA',
            nequi: 'NEQUI',
            daviplata: 'DAVIPLATA',
            other: 'OTRO'
        };

        const payment = paymentLabels[
            row.payment_method
        ] || row.payment_method || '-';

        const isPOS = !!row.sale_id;

        return `

            <tr class="
                border-t
                border-carbonBorder
                hover:bg-carbonLight
                transition-colors
            ">

                <!-- FECHA -->

                <td class="
                    p-3
                    whitespace-nowrap
                    text-gray-300
                ">

                    <div class="font-semibold">
                        ${formatDate(date)}
                    </div>

                    <div class="
                        text-[10px]
                        text-gray-500
                    ">
                        ${formatTime(date)}
                    </div>

                </td>


                <!-- TIPO -->

                <td class="
                    p-3
                    whitespace-nowrap
                ">

                    <span class="
                        inline-flex
                        items-center
                        gap-1.5
                        ${typeClass}
                        text-xs
                        font-bold
                    ">

                        <i class="
                            fa-solid
                            ${typeIcon}
                        "></i>

                        ${typeLabel}

                    </span>

                </td>


                <!-- CATEGORÍA -->

                <td class="
                    p-3
                    text-gray-300
                    whitespace-nowrap
                ">

                    ${escapeHtml(
                        row.category || 'GENERAL'
                    )}

                </td>


                <!-- DESCRIPCIÓN -->

                <td class="
                    p-3
                    text-gray-200
                    min-w-[220px]
                ">

                    <div class="font-semibold">

                        ${escapeHtml(
                            row.description || '-'
                        )}

                    </div>

                    ${
                        row.notes
                            ? `
                                <div class="
                                    text-[10px]
                                    text-gray-500
                                    mt-1
                                ">
                                    ${escapeHtml(row.notes)}
                                </div>
                              `
                            : ''
                    }

                </td>


                <!-- MÉTODO -->

                <td class="
                    p-3
                    text-gray-400
                    whitespace-nowrap
                    text-xs
                ">

                    ${escapeHtml(payment)}

                </td>


                <!-- VALOR -->

                <td class="
                    p-3
                    text-right
                    whitespace-nowrap
                    font-bold
                    ${typeClass}
                ">

                    ${isIncome ? '+' : '-'}
                    ${money(row.amount)}

                </td>


                <!-- ORIGEN -->

                <td class="
                    p-3
                    text-center
                    whitespace-nowrap
                ">

                    ${
                        isPOS
                            ? `
                                <span class="
                                    inline-flex
                                    items-center
                                    gap-1
                                    px-2
                                    py-1
                                    rounded-lg
                                    bg-f1Red/10
                                    border
                                    border-f1Red/30
                                    text-f1Red
                                    text-[10px]
                                    font-bold
                                ">
                                    <i class="fa-solid fa-cash-register"></i>
                                    POS
                                </span>
                              `
                            : `
                                <span class="
                                    inline-flex
                                    items-center
                                    gap-1
                                    px-2
                                    py-1
                                    rounded-lg
                                    bg-asphalt
                                    border
                                    border-carbonBorder
                                    text-gray-400
                                    text-[10px]
                                    font-bold
                                ">
                                    MANUAL
                                </span>
                              `
                    }

                </td>


                <!-- ACCIÓN -->

                <td class="
                    p-3
                    text-center
                    whitespace-nowrap
                ">

                    ${
                        isPOS
                            ? `
                                <button
                                    type="button"
                                    onclick="HORNO28_DELETE_SALE('${row.sale_id}')"
                                    class="
                                        px-3
                                        py-1.5
                                        rounded-lg
                                        bg-f1Red
                                        hover:bg-f1RedHover
                                        text-white
                                        text-[10px]
                                        font-bold
                                        uppercase
                                        transition-all
                                        shadow-md
                                    "
                                >
                                    <i class="fa-solid fa-trash mr-1"></i>
                                    ELIMINAR VENTA
                                </button>
                              `
                            : `
                                <button
                                    type="button"
                                    onclick="HORNO28_DELETE_TRANSACTION('${row.id}')"
                                    class="
                                        px-3
                                        py-1.5
                                        rounded-lg
                                        bg-asphalt
                                        hover:bg-f1Red
                                        border
                                        border-carbonBorder
                                        hover:border-f1Red
                                        text-gray-300
                                        hover:text-white
                                        text-[10px]
                                        font-bold
                                        uppercase
                                        transition-all
                                    "
                                >
                                    <i class="fa-solid fa-trash mr-1"></i>
                                    ELIMINAR
                                </button>
                              `
                    }

                </td>

            </tr>

        `;

    }

    /* ============================================================
       CAMBIAR FILTRO
       ============================================================ */

    function setLedgerFilter(filter) {

        if (
            !['day', 'month', 'all'].includes(filter)
        ) {
            return;
        }

        currentLedgerFilter = filter;

        renderLedger();

    }

    window.HORNO28_SET_LEDGER_FILTER =
        setLedgerFilter;

    /* ============================================================
       ELIMINAR MOVIMIENTO
       ============================================================ */

    async function deleteTransaction(transactionId) {

        const row = treasuryTransactions.find(
            function (item) {
                return item.id === transactionId;
            }
        );

        if (!row) {

            alert(
                'No se encontró el movimiento seleccionado.'
            );

            return;

        }

        /*
           IMPORTANTE:

           Si pertenece a una venta POS, NO eliminamos
           solamente cash_transactions.

           Eliminamos la venta completa mediante RPC.
        */

        if (row.sale_id) {

            if (
                typeof window.HORNO28_DELETE_SALE !==
                'function'
            ) {

                alert(
                    'El módulo de eliminación de ventas POS ' +
                    'todavía no está disponible.'
                );

                return;

            }

            await window.HORNO28_DELETE_SALE(
                row.sale_id
            );

            return;

        }


        /* --------------------------------------------------------
           MOVIMIENTO MANUAL
           -------------------------------------------------------- */

        const confirmed = confirm(
            '¿Deseas eliminar definitivamente este movimiento?'
        );

        if (!confirmed) return;

        const supabase = getSupabase();
        const businessId = getBusinessId();

        if (!supabase || !businessId) {

            alert(
                'La conexión con Supabase no está disponible.'
            );

            return;

        }

        const { error } = await supabase
            .from('cash_transactions')
            .delete()
            .eq('id', transactionId)
            .eq('business_id', businessId);

        if (error) {

            console.error(
                TAG,
                'Error eliminando movimiento:',
                error
            );

            alert(
                'No se pudo eliminar el movimiento.\n\n' +
                error.message
            );

            return;

        }

        /*
           Actualizar memoria local
        */

        treasuryTransactions =
            treasuryTransactions.filter(
                function (item) {
                    return item.id !== transactionId;
                }
            );

        try {

            if (typeof transactions !== 'undefined') {

                transactions =
                    transactions.filter(
                        function (item) {
                            return item.id !== transactionId;
                        }
                    );

            }

        } catch (e) {
            console.warn(
                TAG,
                'No se pudo actualizar transactions.',
                e
            );
        }

        renderLedger();

        if (
            typeof window.renderDashboard ===
            'function'
        ) {
            window.renderDashboard();
        }

        alert(
            'Movimiento eliminado correctamente.'
        );

    }

    window.HORNO28_DELETE_TRANSACTION =
        deleteTransaction;

    /* ============================================================
       REGISTRAR MOVIMIENTO MANUAL
       ============================================================ */

    async function saveTransactionCloud() {

        const supabase = getSupabase();
        const businessId = getBusinessId();

        if (!supabase || !businessId) {

            alert(
                'La conexión con Supabase no está disponible.'
            );

            return;

        }

        const typeElement =
            document.getElementById('tx-type');

        const conceptElement =
            document.getElementById('tx-concept');

        const amountElement =
            document.getElementById('tx-amount');

        if (
            !typeElement ||
            !conceptElement ||
            !amountElement
        ) {

            console.error(
                TAG,
                'No se encontraron los campos originales de tesorería.'
            );

            return;

        }

        const type = typeElement.value;

        const concept =
            conceptElement.value.trim();

        const amount =
            parseFloat(amountElement.value);

        if (
            !concept ||
            isNaN(amount) ||
            amount <= 0
        ) {

            if (
                typeof window.showNotification ===
                'function'
            ) {

                window.showNotification(
                    'Ingresa un concepto y un monto válido en COP.',
                    'error'
                );

            } else {

                alert(
                    'Ingresa un concepto y un monto válido en COP.'
                );

            }

            return;

        }


        /*
           Campos adicionales que agrega este módulo
        */

        const categoryElement =
            document.getElementById(
                'tx-category'
            );

        const paymentElement =
            document.getElementById(
                'tx-payment'
            );

        const referenceElement =
            document.getElementById(
                'tx-reference'
            );

        const notesElement =
            document.getElementById(
                'tx-notes'
            );


        const category =
            categoryElement
                ? categoryElement.value
                : 'general';

        const paymentMethod =
            paymentElement
                ? paymentElement.value
                : 'cash';

        const reference =
            referenceElement
                ? referenceElement.value.trim()
                : '';

        const notes =
            notesElement
                ? notesElement.value.trim()
                : '';


        const { data, error } = await supabase
            .from('cash_transactions')
            .insert({

                business_id: businessId,

                transaction_date:
                    new Date().toISOString(),

                type: type,

                category: category,

                description: concept,

                amount: amount,

                payment_method:
                    paymentMethod,

                reference:
                    reference || null,

                notes:
                    notes || null

            })
            .select()
            .single();


        if (error) {

            console.error(
                TAG,
                'Error registrando movimiento:',
                error
            );

            alert(
                'No se pudo registrar el movimiento.\n\n' +
                error.message
            );

            return;

        }


        /*
           Agregar inmediatamente a memoria
        */

        treasuryTransactions.unshift(data);


        try {

            if (
                typeof transactions !==
                'undefined'
            ) {

                transactions.unshift({

                    id: data.id,

                    date:
                        data.transaction_date,

                    type:
                        data.type,

                    concept:
                        data.description,

                    amount:
                        Number(data.amount),

                    paymentMethod:
                        data.payment_method,

                    category:
                        data.category,

                    reference:
                        data.reference,

                    notes:
                        data.notes,

                    saleId:
                        data.sale_id

                });

            }

        } catch (e) {

            console.warn(
                TAG,
                'No se pudo actualizar transactions.',
                e
            );

        }


        /*
           Cerrar modal
        */

        if (
            typeof window.closeModal ===
            'function'
        ) {

            window.closeModal(
                'modal-transaction'
            );

        } else {

            const modal =
                document.getElementById(
                    'modal-transaction'
                );

            if (modal) {
                modal.classList.add('hidden');
            }

        }


        renderLedger();


        if (
            typeof window.renderDashboard ===
            'function'
        ) {

            window.renderDashboard();

        }


        if (
            typeof window.showNotification ===
            'function'
        ) {

            window.showNotification(
                'Movimiento registrado correctamente en Tesorería.'
            );

        } else {

            alert(
                'Movimiento registrado correctamente.'
            );

        }

    }

    window.saveTransaction =
        saveTransactionCloud;

    /* ============================================================
       CAMPOS ADICIONALES EN MODAL
       ============================================================ */

    function enhanceTransactionModal() {

        const modal =
            document.getElementById(
                'modal-transaction'
            );

        if (!modal) return;

        /*
           Evitar insertar dos veces
        */

        if (
            document.getElementById(
                'h28-treasury-extra-fields'
            )
        ) {
            return;
        }

        const amountElement =
            document.getElementById(
                'tx-amount'
            );

        if (!amountElement) return;

        const amountContainer =
            amountElement.parentElement;

        if (!amountContainer) return;


        const wrapper =
            document.createElement('div');

        wrapper.id =
            'h28-treasury-extra-fields';

        wrapper.className =
            'space-y-4 mt-4';


        wrapper.innerHTML = `

            <div class="
                grid
                grid-cols-1
                md:grid-cols-2
                gap-4
            ">

                <!-- CATEGORÍA -->

                <div>

                    <label class="
                        block
                        text-xs
                        font-bold
                        uppercase
                        tracking-wider
                        text-gray-400
                        mb-2
                    ">
                        Categoría
                    </label>

                    <select
                        id="tx-category"
                        class="
                            w-full
                            bg-asphalt
                            border
                            border-carbonBorder
                            rounded-lg
                            px-3
                            py-2.5
                            text-white
                            text-sm
                            focus:outline-none
                            focus:border-f1Red
                        "
                    >

                        <option value="general">
                            General
                        </option>

                        <option value="purchase">
                            Compra de insumos
                        </option>

                        <option value="supplies">
                            Insumos
                        </option>

                        <option value="payroll">
                            Nómina
                        </option>

                        <option value="rent">
                            Arriendo
                        </option>

                        <option value="services">
                            Servicios
                        </option>

                        <option value="transport">
                            Transporte
                        </option>

                        <option value="marketing">
                            Marketing
                        </option>

                        <option value="tax">
                            Impuestos
                        </option>

                        <option value="other">
                            Otros
                        </option>

                    </select>

                </div>


                <!-- MÉTODO DE PAGO -->

                <div>

                    <label class="
                        block
                        text-xs
                        font-bold
                        uppercase
                        tracking-wider
                        text-gray-400
                        mb-2
                    ">
                        Método de pago
                    </label>

                    <select
                        id="tx-payment"
                        class="
                            w-full
                            bg-asphalt
                            border
                            border-carbonBorder
                            rounded-lg
                            px-3
                            py-2.5
                            text-white
                            text-sm
                            focus:outline-none
                            focus:border-f1Red
                        "
                    >

                        <option value="cash">
                            Efectivo
                        </option>

                        <option value="card">
                            Tarjeta
                        </option>

                        <option value="transfer">
                            Transferencia
                        </option>

                        <option value="nequi">
                            Nequi
                        </option>

                        <option value="daviplata">
                            Daviplata
                        </option>

                        <option value="other">
                            Otro
                        </option>

                    </select>

                </div>

            </div>


            <!-- REFERENCIA -->

            <div>

                <label class="
                    block
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-gray-400
                    mb-2
                ">
                    Referencia
                </label>

                <input
                    id="tx-reference"
                    type="text"
                    placeholder="Ej. factura, comprobante..."
                    class="
                        w-full
                        bg-asphalt
                        border
                        border-carbonBorder
                        rounded-lg
                        px-3
                        py-2.5
                        text-white
                        text-sm
                        placeholder-gray-600
                        focus:outline-none
                        focus:border-f1Red
                    "
                >

            </div>


            <!-- NOTAS -->

            <div>

                <label class="
                    block
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-gray-400
                    mb-2
                ">
                    Notas
                </label>

                <textarea
                    id="tx-notes"
                    rows="2"
                    placeholder="Observaciones del movimiento..."
                    class="
                        w-full
                        bg-asphalt
                        border
                        border-carbonBorder
                        rounded-lg
                        px-3
                        py-2.5
                        text-white
                        text-sm
                        placeholder-gray-600
                        focus:outline-none
                        focus:border-f1Red
                    "
                ></textarea>

            </div>

        `;


        /*
           Insertar después del contenedor del monto
        */

        amountContainer.parentNode.insertBefore(
            wrapper,
            amountContainer.nextSibling
        );

    }

    /* ============================================================
       REFRESH PÚBLICO
       ============================================================ */

    window.HORNO28_REFRESH_TREASURY =
        loadTransactions;

    window.HORNO28_LOAD_TREASURY =
        loadTransactions;


    /* ============================================================
       INICIALIZACIÓN
       ============================================================ */

    async function initTreasury() {

        console.log(
            TAG,
            'Inicializando módulo de Tesorería...'
        );


        /*
           Esperar a que Supabase/Auth estén listos.
        */

        let attempts = 0;

        const maxAttempts = 60;


        const waitForSupabase = setInterval(
            async function () {

                attempts++;


                if (
                    window.horno28Supabase &&
                    window.HORNO28_CURRENT_BUSINESS_ID
                ) {

                    clearInterval(
                        waitForSupabase
                    );


                    enhanceTransactionModal();

                    await loadTransactions();


                    console.log(
                        TAG,
                        'Módulo inicializado correctamente.'
                    );

                }


                if (attempts >= maxAttempts) {

                    clearInterval(
                        waitForSupabase
                    );

                    console.warn(
                        TAG,
                        'Tiempo de espera agotado esperando autenticación.'
                    );

                }

            },
            500
        );


        /*
           El modal puede crearse después,
           por eso intentamos nuevamente.
        */

        setTimeout(
            enhanceTransactionModal,
            1000
        );

        setTimeout(
            enhanceTransactionModal,
            2500
        );

    }


    /*
       Esperar DOM
    */

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            initTreasury
        );

    } else {

        initTreasury();

    }


})();
