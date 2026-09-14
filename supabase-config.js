// HORNO 28 - Supabase configuration

window.HORNO28_SUPABASE_URL =
    'https://ebqdrjckswulwfdxmsdq.supabase.co';

// Supabase Publishable Key
window.HORNO28_SUPABASE_PUBLISHABLE_KEY =
    'TU_PUBLISHABLE_KEY';

window.HORNO28_SUPABASE_CONFIGURED =
    window.HORNO28_SUPABASE_URL.includes('supabase.co') &&
    window.HORNO28_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_');
