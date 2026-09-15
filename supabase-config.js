// HORNO 28 - Supabase configuration

window.HORNO28_SUPABASE_URL =
    'https://ebqdrjckswulwfdxmsdq.supabase.co';

// Supabase Publishable Key
window.HORNO28_SUPABASE_PUBLISHABLE_KEY =
    'sb_publishable_eOFVdJGI9gMfi8wXorHpuw_7BWvKDxy';

// Configuration status
window.HORNO28_SUPABASE_CONFIGURED =
    Boolean(
        window.HORNO28_SUPABASE_URL &&
        window.HORNO28_SUPABASE_PUBLISHABLE_KEY &&
        window.HORNO28_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')
    );
