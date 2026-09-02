import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const rawSupabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

const normalizedSupabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl)
const normalizedSupabaseAnonKey = normalizeToken(rawSupabaseAnonKey)
const validSupabaseUrl = isValidHttpUrl(normalizedSupabaseUrl)
const validSupabaseKey = normalizedSupabaseAnonKey.length > 0

export const isSupabaseConfigured = validSupabaseUrl && validSupabaseKey

export const supabase = createClient<Database>(
  validSupabaseUrl ? normalizedSupabaseUrl : 'https://placeholder.supabase.co',
  validSupabaseKey ? normalizedSupabaseAnonKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)

function normalizeToken(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

function normalizeSupabaseUrl(value: string): string {
  const sanitized = normalizeToken(value)
  if (!sanitized) {
    return ''
  }

  if (isValidHttpUrl(sanitized)) {
    return sanitized
  }

  // Support common secret mistakes:
  // 1) Project ref only: "abcd1234"
  // 2) Domain without protocol: "abcd1234.supabase.co"
  if (/^[a-z0-9-]+$/i.test(sanitized)) {
    return `https://${sanitized}.supabase.co`
  }
  if (/^[a-z0-9-]+\.supabase\.co$/i.test(sanitized)) {
    return `https://${sanitized}`
  }

  return sanitized
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
