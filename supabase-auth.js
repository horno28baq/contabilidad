// ============================================================
// HORNO 28 - SUPABASE AUTHENTICATION
// Etapa 2A - Login y conexión con el negocio
// ============================================================

(function () {
    'use strict';

    let authInitialized = false;

    function createLoginScreen() {
        if (document.getElementById('h28-auth-overlay')) return;

        const overlay = document.createElement('div');

        overlay.id = 'h28-auth-overlay';

        overlay.innerHTML = `
            <div style="
                position:fixed;
                inset:0;
                z-index:99999;
                background:#0f1015;
                display:flex;
                align-items:center;
                justify-content:center;
                padding:20px;
                font-family:Montserrat,Arial,sans-serif;
            ">
                <div style="
                    width:100%;
                    max-width:420px;
                    background:#181920;
                    border:1px solid #2f3242;
                    border-radius:20px;
                    padding:32px;
                    box-shadow:0 0 40px rgba(225,6,0,.18);
                ">

                    <div style="text-align:center;margin-bottom:28px;">

                        <div style="
                            width:70px;
                            height:70px;
                            margin:0 auto 15px;
                            background:#e10600;
                            border-radius:14px;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            color:white;
                            font-size:38px;
                            font-weight:900;
                            transform:skewX(-8deg);
                        ">
                            28
                        </div>

                        <div style="
                            color:white;
                            font-size:30px;
                            font-weight:900;
                            letter-spacing:2px;
                        ">
                            HORNO <span style="color:#e10600;">28 🔱</span>
                        </div>

                        <div style="
                            color:#9ca3af;
                            font-size:10px;
                            font-weight:700;
                            letter-spacing:2px;
                            margin-top:5px;
                        ">
                            PIT STOP POS
                        </div>

                        <div style="
                            color:#d4af37;
                            font-size:11px;
                            font-weight:700;
                            letter-spacing:1px;
                            margin-top:18px;
                        ">
                            ACCESO AL SISTEMA
                        </div>

                    </div>

                    <form id="h28-login-form">

                        <label style="
                            display:block;
                            color:#9ca3af;
                            font-size:11px;
                            font-weight:700;
                            margin-bottom:7px;
                            text-transform:uppercase;
                        ">
                            Correo electrónico
                        </label>

                        <input
                            id="h28-login-email"
                            type="email"
                            autocomplete="username"
                            required
                            placeholder="correo@ejemplo.com"
                            style="
                                width:100%;
                                box-sizing:border-box;
                                background:#0f1015;
                                border:1px solid #2f3242;
                                border-radius:10px;
                                padding:13px;
                                color:white;
                                outline:none;
                                margin-bottom:16px;
                            "
                        >

                        <label style="
                            display:block;
                            color:#9ca3af;
                            font-size:11px;
                            font-weight:700;
                            margin-bottom:7px;
                            text-transform:uppercase;
                        ">
                            Contraseña
                        </label>

                        <input
                            id="h28-login-password"
                            type="password"
                            autocomplete="current-password"
                            required
                            placeholder="Contraseña"
                            style="
                                width:100%;
                                box-sizing:border-box;
                                background:#0f1015;
                                border:1px solid #2f3242;
                                border-radius:10px;
                                padding:13px;
                                color:white;
                                outline:none;
                                margin-bottom:20px;
                            "
                        >

                        <button
                            type="submit"
                            id="h28-login-button"
                            style="
                                width:100%;
                                border:0;
                                border-radius:10px;
                                padding:14px;
                                background:#e10600;
                                color:white;
                                font-weight:900;
                                font-size:13px;
                                letter-spacing:1px;
                                cursor:pointer;
                                text-transform:uppercase;
                            "
                        >
                            <i class="fa-solid fa-right-to-bracket"></i>
                            INGRESAR AL PIT WALL
                        </button>

                        <div
                            id="h28-login-message"
                            style="
                                min-height:20px;
                                margin-top:15px;
                                text-align:center;
                                font-size:11px;
                                font-weight:700;
                                color:#9ca3af;
                            "
                        ></div>

                    </form>

                    <div style="
                        text-align:center;
                        color:#4b5563;
                        font-size:9px;
                        margin-top:24px;
                        letter-spacing:1px;
                    ">
                        HORNO 28 • GESTIÓN CONTABLE, RECETAS & COSTOS
                    </div>

                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document
            .getElementById('h28-login-form')
            .addEventListener('submit', handleLogin);
    }

    function setMessage(message, isError = false) {
        const element = document.getElementById('h28-login-message');

        if (!element) return;

        element.textContent = message;
        element.style.color = isError ? '#e10600' : '#00e676';
    }

    async function handleLogin(event) {
        event.preventDefault();

        const email = document
            .getElementById('h28-login-email')
            .value
            .trim();

        const password = document
            .getElementById('h28-login-password')
            .value;

        const button = document.getElementById('h28-login-button');

        if (!email || !password) {
            setMessage('Ingresa correo y contraseña.', true);
            return;
        }

        button.disabled = true;
        button.style.opacity = '0.6';
        button.textContent = 'CONECTANDO...';

        setMessage('Conectando con HORNO 28...');

        try {
            const { data, error } =
                await window.horno28Supabase.auth.signInWithPassword({
                    email,
                    password
                });

            if (error) {
                throw error;
            }

            await loadBusiness(data.user);

        } catch (error) {
            console.error('HORNO 28 Login Error:', error);

            setMessage(
                error.message || 'No fue posible iniciar sesión.',
                true
            );

            button.disabled = false;
            button.style.opacity = '1';
            button.innerHTML =
                '<i class="fa-solid fa-right-to-bracket"></i> INGRESAR AL PIT WALL';
        }
    }

    async function loadBusiness(user) {
        setMessage('Verificando acceso al negocio HORNO 28...');

        const { data, error } = await window.horno28Supabase
            .from('businesses')
            .select('id, name, currency')
            .eq('owner_id', user.id)
            .limit(1)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            throw new Error(
                'El usuario inició sesión, pero no tiene un negocio HORNO 28 asignado.'
            );
        }

        window.HORNO28_CURRENT_USER = user;
        window.HORNO28_CURRENT_BUSINESS_ID = data.id;
        window.HORNO28_CURRENT_BUSINESS = data;

        console.log('========================================');
        console.log('HORNO 28 - SUPABASE CONECTADO');
        console.log('Usuario:', user.email);
        console.log('Negocio:', data.name);
        console.log('Business ID:', data.id);
        console.log('========================================');

        setMessage('Acceso autorizado. Iniciando HORNO 28...');

        setTimeout(() => {
            const overlay = document.getElementById('h28-auth-overlay');

            if (overlay) {
                overlay.remove();
            }

            document.body.classList.remove('h28-auth-loading');

            if (typeof showNotification === 'function') {
                showNotification(
                    `Conectado a ${data.name}. Sistema listo.`
                );
            }
        }, 500);
    }

    async function initializeAuth() {
        if (authInitialized) return;

        authInitialized = true;

        if (
            !window.supabase ||
            !window.HORNO28_SUPABASE_URL ||
            !window.HORNO28_SUPABASE_PUBLISHABLE_KEY
        ) {
            console.error(
                'HORNO 28: configuración de Supabase no disponible.'
            );
            return;
        }

        window.horno28Supabase = window.supabase.createClient(
            window.HORNO28_SUPABASE_URL,
            window.HORNO28_SUPABASE_PUBLISHABLE_KEY
        );

        createLoginScreen();

        try {
            const {
                data: { session }
            } = await window.horno28Supabase.auth.getSession();

            if (session && session.user) {
                await loadBusiness(session.user);
            }

        } catch (error) {
            console.error(
                'HORNO 28: error verificando sesión:',
                error
            );
        }

        window.horno28Supabase.auth.onAuthStateChange(
            async (event, session) => {

                console.log(
                    'HORNO 28 Auth event:',
                    event
                );

                if (
                    session &&
                    session.user &&
                    event === 'SIGNED_IN'
                ) {
                    try {
                        await loadBusiness(session.user);
                    } catch (error) {
                        console.error(error);
                    }
                }

                if (event === 'SIGNED_OUT') {
                    window.HORNO28_CURRENT_USER = null;
                    window.HORNO28_CURRENT_BUSINESS_ID = null;
                    window.HORNO28_CURRENT_BUSINESS = null;

                    createLoginScreen();
                }
            }
        );
    }

    window.HORNO28_LOGOUT = async function () {

        if (!window.horno28Supabase) return;

        await window.horno28Supabase.auth.signOut();

        window.HORNO28_CURRENT_USER = null;
        window.HORNO28_CURRENT_BUSINESS_ID = null;
        window.HORNO28_CURRENT_BUSINESS = null;

        location.reload();
    };

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            initializeAuth
        );
    } else {
        initializeAuth();
    }

})();
