/**
 * THE ONLY FILE THAT KNOWS WHERE PHOTOS LIVE.
 *
 * Everything else in the app deals in an opaque `string` path stored in
 * checkins.wide_photo / close_photo / tag_photo. Swapping Supabase Storage for
 * S3, Cloudflare R2 or anything else is a rewrite of this file and nothing more.
 *
 * That is a deliberate hedge: Supabase's free storage allowance is the most
 * likely thing to run out mid-pilot, and having to migrate it in week 3 while
 * also building the attack set would be the worst possible time to discover the
 * upload logic was smeared across six components.
 */

import { supabase } from './supabase'
import { DEMO, refuseWriteInDemo } from './demo'

const BUCKET = 'tree-photos'

export type PhotoRole = 'wide' | 'close' | 'tag'

/**
 * Photos are keyed by a client-generated capture id, NOT by tree id.
 *
 * Reason: the client is not granted `insert (id)` on trees, so a tree's id only
 * exists after the row is inserted. Keying on the tree would force
 * insert-then-upload, and a failed upload would leave an orphan tree row with no
 * photos. Uploading first means a failure leaves only unreferenced blobs, which
 * are harmless and cheap to sweep.
 */
export function newCaptureId(): string {
  return crypto.randomUUID()
}

export function photoPath(
  userId: string,
  captureId: string,
  role: PhotoRole,
): string {
  return `${userId}/${captureId}/${role}.jpg`
}

/** Upload one prepared JPEG. Returns the storage path to persist in the DB. */
export async function uploadPhoto(
  userId: string,
  captureId: string,
  role: PhotoRole,
  blob: Blob,
): Promise<string> {
  // Demo mode must never write to Storage — that allowance is reserved for
  // pilot photos, and a demo upload would be indistinguishable from real
  // evidence once it landed.
  if (DEMO) refuseWriteInDemo('photo upload')

  const path = photoPath(userId, captureId, role)
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    // Retries after a dropped connection re-upload the same path. Without
    // upsert the second attempt fails with "already exists" and the whole
    // registration is lost — on a Ghanaian mobile connection this is the
    // common case, not the edge case.
    upsert: true,
  })
  if (error) throw new Error(`Photo upload failed (${role}): ${error.message}`)
  return path
}

// ---------------------------------------------------------------------------
// Reading photos back
// ---------------------------------------------------------------------------

/**
 * The bucket is PRIVATE. Tree photos are evidence in a system that pays money,
 * and a public bucket would let anyone enumerate and download every photo —
 * which also hands an attacker the exact images needed to replay a check-in.
 * So reads go through short-lived signed URLs.
 */
const SIGNED_URL_TTL_S = 60 * 60

interface CachedUrl {
  url: string
  expiresAt: number
}
const urlCache = new Map<string, CachedUrl>()

/** Signed URL for one path, memoised until shortly before it expires. */
export async function photoUrl(path: string): Promise<string | null> {
  // Demo paths are already public URLs under /demo — serve them as-is.
  if (DEMO) return path

  const hit = urlCache.get(path)
  if (hit && hit.expiresAt > Date.now()) return hit.url

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_S)
  if (error || !data) return null

  urlCache.set(path, {
    url: data.signedUrl,
    // Expire our copy 5 minutes early so a long-open My Grove list never shows
    // broken thumbnails.
    expiresAt: Date.now() + (SIGNED_URL_TTL_S - 300) * 1000,
  })
  return data.signedUrl
}

/**
 * Signed URLs for many paths in ONE request.
 *
 * My Grove renders a thumbnail per tree. Calling photoUrl() per card would fire
 * 40 sequential round trips on a phone — several seconds of blank cards. This
 * is the difference between the list feeling instant and feeling broken.
 */
export async function photoUrls(
  paths: string[],
): Promise<Map<string, string>> {
  if (DEMO) return new Map(paths.map((p) => [p, p]))

  const out = new Map<string, string>()
  const missing: string[] = []

  for (const p of new Set(paths)) {
    const hit = urlCache.get(p)
    if (hit && hit.expiresAt > Date.now()) out.set(p, hit.url)
    else missing.push(p)
  }
  if (missing.length === 0) return out

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(missing, SIGNED_URL_TTL_S)
  if (error || !data) return out

  const expiresAt = Date.now() + (SIGNED_URL_TTL_S - 300) * 1000
  for (const row of data) {
    if (row.signedUrl && row.path) {
      urlCache.set(row.path, { url: row.signedUrl, expiresAt })
      out.set(row.path, row.signedUrl)
    }
  }
  return out
}
