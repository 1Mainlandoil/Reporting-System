import { hasSupabaseEnv, supabase } from '../lib/supabaseClient'

export const REPORT_EVIDENCE_BUCKET = 'report-evidence'

const sanitizePathPart = (value) =>
  String(value || 'file')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'file'

export const uploadReportEvidence = async (file, folderPath) => {
  if (!hasSupabaseEnv || !supabase || !file) {
    return null
  }
  const extension = String(file.name || '').split('.').pop()?.toLowerCase() || 'jpg'
  const safeExtension = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension) ? extension : 'jpg'
  const objectPath = `${folderPath}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${safeExtension}`

  const { error } = await supabase.storage.from(REPORT_EVIDENCE_BUCKET).upload(objectPath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })

  if (error) {
    throw new Error(error.message)
  }

  const { data } = supabase.storage.from(REPORT_EVIDENCE_BUCKET).getPublicUrl(objectPath)
  return data?.publicUrl || null
}

export const uploadReportEvidenceFiles = async (files, folderPath) => {
  const list = Array.isArray(files) ? files.filter(Boolean) : []
  const urls = []
  for (const file of list) {
    const url = await uploadReportEvidence(file, folderPath)
    if (url) {
      urls.push(url)
    }
  }
  return urls
}
