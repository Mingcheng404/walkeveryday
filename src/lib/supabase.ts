import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const rawSupabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

const normalizedSupabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl)
const normalizedSupabaseAnonKey = normalizeSupabaseKey(rawSupabaseAnonKey)

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

function normalizeSupabaseUrl(value: string): string {
  const trimmed = cleanToken(value)
  const withoutPrefix = stripEnvPrefix(trimmed, ['VITE_SUPABASE_URL', 'SUPABASE_URL'])

  if (!withoutPrefix) {
    return ''
  }

  if (isValidHttpUrl(withoutPrefix)) {
    return withoutPrefix
  }

  if (/^[a-z0-9-]+$/i.test(withoutPrefix)) {
    return `https://${withoutPrefix}.supabase.co`
  }

  if (/^[a-z0-9-]+\.supabase\.co$/i.test(withoutPrefix)) {
    return `https://${withoutPrefix}`
  }

  return withoutPrefix
}

function normalizeSupabaseKey(value: string): string {
  const trimmed = cleanToken(value)
  const withoutPrefix = stripEnvPrefix(trimmed, [
    'VITE_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
  ])
  return cleanToken(withoutPrefix)
}

function cleanToken(value: string): string {
  let output = value.replace(/\r/g, '').trim()
  if (output.startsWith('"') && output.endsWith('"')) {
    output = output.slice(1, -1)
  }
  if (output.startsWith("'") && output.endsWith("'")) {
    output = output.slice(1, -1)
  }
  return output.trim()
}

function stripEnvPrefix(value: string, keys: string[]): string {
  for (const key of keys) {
    const prefix = `${key}=`
    if (value.toUpperCase().startsWith(prefix)) {
      return value.slice(prefix.length).trim()
    }
  }
  return value
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
