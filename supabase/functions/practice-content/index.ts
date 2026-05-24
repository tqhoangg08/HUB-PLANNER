import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'

const STORAGE_BUCKET = 'practice-sets'

const json = (data: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, ...extraHeaders, 'Content-Type': 'application/json' },
    status,
  })

const getRequestUser = async (req: Request) => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return data.user
}

const hasPracticeProAccess = async (userId: string) => {
  const [{ data: access }, { data: roleRow }] = await Promise.all([
    supabase
      .from('practice_pro_access')
      .select('expires_at')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('user_roles')
      .select('role')
      .or(`id.eq.${userId},user_id.eq.${userId}`)
      .maybeSingle(),
  ])

  if (['admin', 'ctv'].includes(String(roleRow?.role || '').toLowerCase())) return true
  if (!access) return false
  if (!access.expires_at) return true
  return new Date(access.expires_at).getTime() > Date.now()
}

const readSupabaseStorageJson = async (key: string) => {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(key)
  if (error) throw error
  return JSON.parse(await data.text())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const url = new URL(req.url)
    const setId = url.searchParams.get('id') || ''
    if (!setId) return json({ error: 'Missing practice set id.' }, 400)

    const user = await getRequestUser(req)
    const { data: set, error } = await supabase
      .from('practice_sets')
      .select('id, owner_id, visibility, storage_provider, content_url, content_key')
      .eq('id', setId)
      .single()

    if (error || !set) return json({ error: 'Practice set not found.' }, 404)
    if (!['supabase', 'external'].includes(set.storage_provider)) {
      return json({ error: 'Practice set is not backed by Supabase Storage or external JSON.' }, 400)
    }

    const isOwner = Boolean(user?.id && set.owner_id === user.id)
    const isPublic = set.visibility === 'public'
    const isPro = set.visibility === 'pro'

    if (!isPublic && !isOwner && !user?.id) {
      return json({ error: 'Login is required to open this practice set.' }, 401)
    }

    if (isPro && !user?.id) {
      return json({ error: 'This Pro practice set requires login.' }, 401)
    }

    if (isPro && user?.id && !isOwner && !(await hasPracticeProAccess(user.id))) {
      return json({ error: 'Your account does not have access to this Pro practice set.' }, 403)
    }

    if (set.storage_provider === 'external') {
      if (!set.content_url) return json({ error: 'External practice set has no content_url.' }, 400)
      const response = await fetch(set.content_url)
      if (!response.ok) return json({ error: 'Cannot load external practice set content.' }, 502)
      return json(await response.json())
    }

    if (!set.content_key) {
      return json({ error: 'Practice set has no content_key.' }, 400)
    }

    return json(await readSupabaseStorageJson(set.content_key))
  } catch (error) {
    console.error('practice-content error:', error)
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
