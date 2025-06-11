// Corrigido para Supabase v2 - CDN
const SUPABASE_URL = 'https://wvequdxcckksnkkncqkd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2ZXF1ZHhjY2trc25ra25jcWtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkzNDY1NzcsImV4cCI6MjA2NDkyMjU3N30.4NbQ9FsF0kKVeKlHPbWou8viOoUOHMqFcXl-m3NS_p0';

// Inicializar cliente Supabase de forma correta (v2)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exportar para uso em outros arquivos
window.supabaseClient = supabase;