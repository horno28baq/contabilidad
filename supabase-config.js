// HORNO 28 - Supabase configuration

window.HORNO28_SUPABASE_URL =
    'https://ebqdrjckswulwfdxmsdq.supabase.co';

// Pega aquí tu SUPABASE PUBLISHABLE KEY
window.HORNO28_SUPABASE_PUBLISHABLE_KEY =
    'sb_publishable_eOFVdJGI9';

window.HORNO28_SUPABASE_CONFIGURED =
    window.HORNO28_SUPABASE_URL.includes('supabase.co') &&
    !window.HORNO28_SUPABASE_PUBLISHABLE_KEY.includes('sb_publishable_eOFVdJGI9');
