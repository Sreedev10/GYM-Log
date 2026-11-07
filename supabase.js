
import 'react-native-url-polyfill/auto';

import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl.startsWith('https://')
);

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase is not configured. Check your .env file.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseKey || 'placeholder-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// Automatically manage token refresh
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
