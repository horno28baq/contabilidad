/* H28-TREASURY-CLOUD-v1
   ETAPA 4 — CAJA Y TESORERÍA + LIBRO DIARIO
*/

(function () {
  'use strict';

  const TAG = '[H28-TREASURY-CLOUD-v1]';

  function ready() {
    return (
      window.horno28Supabase &&
      window.HORNO28_CURRENT_BUSINESS_ID &&
      typeof transactions !== 'undefined'
    );
  }

  async function loadTransactions() {
    if (!ready()) return false;

const { data, error } = await window.horno28Supabase
      .from('cash_transactions')
      .select('*')
      .eq('business_id', window.HORNO28_CURRENT_BUSINESS_ID)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error(TAG, error);
      return false;
    }

    transactions.length = 0;

    (data || []).forEach(row => {
      transactions.push({
        id: row.id,
        date: row.transaction_date,
        type: row.type,
        concept: row.description,
        amount: Number(row.amount || 0),
        category: row.category,
        paymentMethod: row.payment_method,
        reference: row.reference || '',
        notes: row.notes || '',
        saleId: row.sale_id || null
      });
    });

    try {
      localStorage.setItem(
        'h28_transactions',
        JSON.stringify(transactions)
      );
    } catch (_) {}

    renderLedger();

    console.log(
      TAG,
      'Movimientos cargados:',
      transactions.length
    );

    return true;
  }

  function renderLedger() {
    const tab = document.getElementById('tab-treasury');

    if (!tab) return;

    let panel = document.getElementById('h28-cloud-ledger');

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'h28-cloud-ledger';
      panel.className = 'mt-4';

      tab.prepend(panel);
    }

    const now = new Date();

    const currentDay =
      now.toISOString().slice(0, 10);

    const currentMonth =
      currentDay.slice(0, 7);

    if (!panel.dataset.initialized) {

      panel.dataset.initialized = '1';

      panel.innerHTML = `
        <div class="bg-carbon rounded-2xl border border-carbonBorder shadow-xl p-5 mb-4 text-white">

          <div class="flex flex-wrap gap-2 items-center">

            <strong class="mr-2">
              LIBRO DIARIO
            </strong>

            <button
              type="button"
              class="px-3 py-2 rounded-lg bg-asphalt border border-carbonBorder text-gray-300 hover:text-white hover:border-f1Red transition"
              data-h28-filter="day">
              Día
            </button>

            <button
              type="button"
              class="px-3 py-2 rounded-lg bg-asphalt border border-carbonBorder text-gray-300 hover:text-white hover:border-f1Red transition"
              data-h28-filter="month">
              Mes
            </button>

            <button
              type="button"
              class="px-3 py-2 rounded-lg bg-asphalt border border-carbonBorder text-gray-300 hover:text-white hover:border-f1Red transition"
              data-h28-filter="all">
              Todos
            </button>

          </div>

          <div
            id="h28-ledger-summary"
            class="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
          </div>

          <div class="overflow-x-auto mt-4">

            <table class="min-w-full text-sm">

              <thead class="bg-asphalt">

                <tr class="border-b">

                  <th class="text-left p-2">
                    Fecha
                  </th>

                  <th class="text-left p-2">
                    Origen
                  </th>

                  <th class="text-left p-2">
                    Tipo
                  </th>

                  <th class="text-left p-2">
                    Concepto
                  </th>

                  <th class="text-left p-2">
                    Categoría
                  </th>

                  <th class="text-left p-2">
                    Pago
                  </th>

                  <th class="text-right p-2">
                    Valor
                  </th>

                  <th class="text-center p-2">
                    Acción
                  </th>

                </tr>

              </thead>

              <tbody id="h28-ledger-body">
              </tbody>

            </table>

          </div>

        </div>
      `;

      panel
        .querySelectorAll('[data-h28-filter]')
        .forEach(btn => {

          btn.addEventListener(
            'click',
            () => {

              panel.dataset.filter =
                btn.dataset.h28Filter;

              renderLedger();

            }
          );

        });

      panel.dataset.filter = 'day';
    }

    const filter =
      panel.dataset.filter || 'day';

    const rows = transactions.filter(t => {

      if (!t.date) {
        return filter === 'all';
      }

      const d = new Date(t.date);

      const ds =
        d.toISOString().slice(0, 10);

      const ms =
        ds.slice(0, 7);

      return (
        filter === 'all' ||
        (
          filter === 'day' &&
          ds === currentDay
        ) ||
        (
          filter === 'month' &&
          ms === currentMonth
        )
      );

    });

    const income =
      rows
        .filter(t => t.type === 'income')
        .reduce(
          (s, t) =>
            s + Number(t.amount || 0),
          0
        );

    const expense =
      rows
        .filter(t => t.type === 'expense')
        .reduce(
          (s, t) =>
            s + Number(t.amount || 0),
          0
        );

    const balance =
      income - expense;

    const money = n =>
      Number(n || 0).toLocaleString(
        'es-CO',
        {
          style: 'currency',
          currency: 'COP',
          maximumFractionDigits: 0
        }
      );

    const summary =
      document.getElementById(
        'h28-ledger-summary'
      );

    if (summary) {

      summary.innerHTML = `

        <div class="rounded-xl bg-asphalt border border-carbonBorder p-4">

          <small class="text-gray-400 uppercase tracking-wider text-xs font-bold">
            Ingresos
          </small>

          <div class="font-bold">
            ${money(income)}
          </div>

        </div>

        <div class="rounded-xl bg-asphalt border border-carbonBorder p-4">

          <small class="text-gray-400 uppercase tracking-wider text-xs font-bold">
            Egresos
          </small>

          <div class="font-bold">
            ${money(expense)}
          </div>

        </div>

        <div class="rounded-xl bg-asphalt border border-carbonBorder p-4">

          <small class="text-gray-400 uppercase tracking-wider text-xs font-bold">
            Balance
          </small>

          <div class="font-bold">
            ${money(balance)}
          </div>

        </div>

        <div class="rounded-xl bg-asphalt border border-carbonBorder p-4">

          <small class="text-gray-400 uppercase tracking-wider text-xs font-bold">
            Movimientos
          </small>

          <div class="font-bold">
            ${rows.length}
          </div>

        </div>

      `;
    }

    const body =
      document.getElementById(
        'h28-ledger-body'
      );

    if (!body) return;

    body.innerHTML =
      rows.map(t => `

        <tr class="border-b">

          <td class="p-2">
            ${new Date(t.date).toLocaleString('es-CO')}
          </td>

          <td class="p-2">
            ${t.saleId ? 'POS' : 'Manual'}
          </td>

          <td class="p-2">
            ${
              t.type === 'income'
                ? 'Ingreso'
                : 'Egreso'
            }
          </td>

          <td class="p-2">
            ${escapeHtml(t.concept)}
          </td>

          <td class="p-2">
            ${escapeHtml(
              t.category || 'general'
            )}
          </td>

          <td class="p-2">
            ${escapeHtml(
              t.paymentMethod || ''
            )}
          </td>

          <td class="p-2 text-right">
            ${money(t.amount)}
          </td>

          <td class="p-2 text-center">

            ${
              t.saleId
                ? '<span class="text-xs">Protegido POS</span>'
                : `
                  <button
                    type="button"
                    class="text-red-600"
                    onclick="HORNO28_DELETE_TRANSACTION('${t.id}')">
                    Eliminar
                  </button>
                `
            }

          </td>

        </tr>

      `).join('') ||

      `
        <tr>

          <td
            colspan="8"
            class="p-4 text-center">

            No hay movimientos
            en este período.

          </td>

        </tr>
      `;
  }

  function escapeHtml(value) {

    return String(value ?? '')
      .replace(
        /[&<>"']/g,
        character => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        }[character])
      );

  }

  async function saveCloudTransaction() {

    const type =
      document.getElementById(
        'tx-type'
      )?.value;

    const concept =
      document.getElementById(
        'tx-concept'
      )?.value?.trim();

    const amount =
      Number(
        document.getElementById(
          'tx-amount'
        )?.value || 0
      );

    if (
      !type ||
      !concept ||
      amount <= 0
    ) {

      alert(
        'Completa tipo, concepto y un valor mayor que cero.'
      );

      return;
    }

    const category =
      document.getElementById(
        'tx-category'
      )?.value ||
      'general';

    const paymentMethod =
      document.getElementById(
        'tx-payment-method'
      )?.value ||
      'cash';

    const reference =
      document.getElementById(
        'tx-reference'
      )?.value?.trim() ||
      null;

    const notes =
      document.getElementById(
        'tx-notes'
      )?.value?.trim() ||
      null;

    const {
      data,
      error
    } = await window.horno28Supabase

      .from('cash_transactions')

      .insert({

        business_id:
          window.HORNO28_CURRENT_BUSINESS_ID,

        type,

        category,

        description:
          concept,

        amount,

        payment_method:
          paymentMethod,

        reference,

        notes

      })

      .select()

      .single();

    if (error) {

      console.error(
        TAG,
        error
      );

      alert(
        'No se pudo guardar el movimiento: ' +
        error.message
      );

      return;
    }

    transactions.unshift({

      id: data.id,

      date:
        data.transaction_date,

      type:
        data.type,

      concept:
        data.description,

      amount:
        Number(data.amount || 0),

      category:
        data.category,

      paymentMethod:
        data.payment_method,

      reference:
        data.reference || '',

      notes:
        data.notes || '',

      saleId:
        data.sale_id || null

    });

    try {

      localStorage.setItem(
        'h28_transactions',
        JSON.stringify(transactions)
      );

    } catch (_) {}

    document
      .getElementById(
        'modal-transaction'
      )
      ?.classList.add('hidden');

    renderLedger();

    console.log(
      TAG,
      'Movimiento guardado:',
      data.id
    );

  }

  async function deleteTransaction(id) {

    const row =
      transactions.find(
        t => t.id === id
      );

    if (!row) return;

    if (row.saleId) {

      alert(
        'Los movimientos generados por POS están protegidos.'
      );

      return;
    }

    if (
      !confirm(
        '¿Eliminar este movimiento?'
      )
    ) {
      return;
    }

    const {
      error
    } = await window.horno28Supabase

      .from('cash_transactions')

      .delete()

      .eq(
        'id',
        id
      )

      .eq(
        'business_id',
        window.HORNO28_CURRENT_BUSINESS_ID
      );

    if (error) {

      console.error(
        TAG,
        error
      );

      alert(
        'No se pudo eliminar: ' +
        error.message
      );

      return;
    }

    const index =
      transactions.findIndex(
        t => t.id === id
      );

    if (index >= 0) {
      transactions.splice(
        index,
        1
      );
    }

    try {

      localStorage.setItem(
        'h28_transactions',
        JSON.stringify(transactions)
      );

    } catch (_) {}

    renderLedger();

  }

  function injectFields() {

    const modal =
      document.getElementById(
        'modal-transaction'
      );

    if (
      !modal ||
      modal.dataset.h28Fields
    ) {
      return;
    }

    const amount =
      document.getElementById(
        'tx-amount'
      );

    if (!amount) return;

    const box =
      document.createElement(
        'div'
      );

    box.className =
      'space-y-3 mt-3';

    box.innerHTML = `

      <div>

        <label class="block text-sm font-medium">
          Categoría
        </label>

        <select
          id="tx-category"
          class="w-full border rounded p-2">

          <option value="general">
            General
          </option>

          <option value="compra_insumos">
            Compra de insumos
          </option>

          <option value="nomina">
            Nómina
          </option>

          <option value="arriendo">
            Arriendo
          </option>

          <option value="servicios">
            Servicios
          </option>

          <option value="transporte">
            Transporte
          </option>

          <option value="impuestos">
            Impuestos
          </option>

          <option value="marketing">
            Marketing
          </option>

          <option value="mantenimiento">
            Mantenimiento
          </option>

          <option value="otros">
            Otros
          </option>

        </select>

      </div>

      <div>

        <label class="block text-sm font-medium">
          Método de pago
        </label>

        <select
          id="tx-payment-method"
          class="w-full border rounded p-2">

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

      <div>

        <label class="block text-sm font-medium">
          Referencia
        </label>

        <input
          id="tx-reference"
          class="w-full border rounded p-2"
          placeholder="Opcional">

      </div>

      <div>

        <label class="block text-sm font-medium">
          Notas
        </label>

        <textarea
          id="tx-notes"
          class="w-full border rounded p-2"
          rows="2"
          placeholder="Opcional">
        </textarea>

      </div>

    `;

    amount
      .closest('.space-y-3')
      ?.appendChild(box);

    modal.dataset.h28Fields = '1';

  }

  async function init() {

    if (
      !window.horno28Supabase ||
      !window.HORNO28_CURRENT_BUSINESS_ID
    ) {

      setTimeout(
        init,
        1000
      );

      return;
    }

    injectFields();

    window.HORNO28_DELETE_TRANSACTION =
      deleteTransaction;

    window.saveTransaction =
      saveCloudTransaction;

    await loadTransactions();

    console.log(
      TAG,
      'Caja y Libro Diario sincronizados.'
    );

  }

  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      init
    );

  } else {

    init();

  }

})();
