import { randomUUID } from 'node:crypto'
import { createAdminDataBackup } from '@/lib/adminDataBackup'

export const ADMIN_BACKUP_BUCKET = 'admin-backups'
export const ADMIN_BACKUP_MEDIA_BUCKETS = [
  'profile-media',
  'post-media',
  'blogs',
  'announcements',
  'events',
  'tourist-spots',
]

async function listStorageObjects(storage, bucket, root = '') {
  const pendingFolders = [root]
  const objects = []

  while (pendingFolders.length) {
    const folder = pendingFolders.pop()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await storage.from(bucket).list(folder, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw new Error(`Unable to list media in "${bucket}": ${error.message}`)
      const entries = data || []

      for (const entry of entries) {
        const path = folder ? `${folder}/${entry.name}` : entry.name
        if (entry.id === null) pendingFolders.push(path)
        else objects.push({ path, metadata: entry.metadata || {} })
      }

      if (entries.length < 1000) break
    }
  }

  return objects
}

async function removeBackupPath(storage, path) {
  const objects = await listStorageObjects(storage, ADMIN_BACKUP_BUCKET, path)
  const paths = objects.map((object) => object.path)
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { error } = await storage.from(ADMIN_BACKUP_BUCKET).remove(paths.slice(offset, offset + 100))
    if (error) throw error
  }
}

async function copyMediaToBackup(storage, backupPath) {
  const files = []
  let totalBytes = 0

  for (const bucket of ADMIN_BACKUP_MEDIA_BUCKETS) {
    const { data: bucketData, error: bucketError } = await storage.getBucket(bucket)
    if (bucketError || !bucketData) {
      throw new Error(`Media backup cannot continue because storage bucket "${bucket}" is unavailable.`)
    }

    const objects = await listStorageObjects(storage, bucket)
    for (const object of objects) {
      const { data: file, error: downloadError } = await storage.from(bucket).download(object.path)
      if (downloadError || !file) {
        throw new Error(`Unable to download media object "${bucket}/${object.path}": ${downloadError?.message || 'No file returned.'}`)
      }

      const archivedPath = `${backupPath}/media/${bucket}/${object.path}`
      const contentType = object.metadata.mimetype || 'application/octet-stream'
      const bytes = Buffer.from(await file.arrayBuffer())
      const { error: uploadError } = await storage.from(ADMIN_BACKUP_BUCKET).upload(archivedPath, bytes, {
        contentType,
        upsert: false,
      })
      if (uploadError) {
        throw new Error(`Unable to archive media object "${bucket}/${object.path}": ${uploadError.message}`)
      }

      totalBytes += bytes.byteLength
      files.push({
        bucket,
        path: object.path,
        archivedPath: `media/${bucket}/${object.path}`,
        contentType,
        size: bytes.byteLength,
      })
    }
  }

  return { files, totalBytes }
}

async function pruneExpiredBackups(adminSupabase, storage, retentionDays) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
  const { data: expired, error: queryError } = await adminSupabase
    .from('admin_backup_runs')
    .select('id, storage_path')
    .in('status', ['succeeded', 'failed'])
    .not('storage_path', 'is', null)
    .lt('started_at', cutoff)
    .limit(100)
  if (queryError) throw queryError

  for (const run of expired || []) {
    await removeBackupPath(storage, run.storage_path)
    const { error: deleteError } = await adminSupabase
      .from('admin_backup_runs')
      .delete()
      .eq('id', run.id)
    if (deleteError) throw deleteError
  }
}

export async function pruneScheduledBackups(adminSupabase) {
  const { data: settings, error } = await adminSupabase
    .from('admin_backup_settings')
    .select('retention_days')
    .eq('id', 1)
    .single()
  if (error || !settings) {
    throw new Error('Backup settings are unavailable. Apply migration 095 before cleaning up backups.')
  }
  await pruneExpiredBackups(adminSupabase, adminSupabase.storage, settings.retention_days)
}

export async function runAdminBackup(adminSupabase, {
  triggerType = 'manual',
  createdBy = null,
  scheduledFor = null,
} = {}) {
  const { data: settings, error: settingsError } = await adminSupabase
    .from('admin_backup_settings')
    .select('enabled, retention_days, include_media')
    .eq('id', 1)
    .single()
  if (settingsError || !settings) {
    throw new Error('Backup settings are unavailable. Apply migration 095 before running backups.')
  }

  const staleBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString()
  const { error: staleError } = await adminSupabase
    .from('admin_backup_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: 'The previous backup did not finish within the allowed time.',
    })
    .eq('status', 'running')
    .lt('started_at', staleBefore)
  if (staleError) throw new Error(`Unable to check for unfinished backups: ${staleError.message}`)

  const storage = adminSupabase.storage
  if (triggerType === 'scheduled' && !settings.enabled) {
    await pruneExpiredBackups(adminSupabase, storage, settings.retention_days)
    return { skipped: true, reason: 'Automated backups are disabled.' }
  }

  const runId = randomUUID()
  const attemptId = randomUUID()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const storagePath = `${triggerType}/${timestamp}_${attemptId}`
  let run = null

  if (scheduledFor) {
    const { data: previousRun, error: previousRunError } = await adminSupabase
      .from('admin_backup_runs')
      .select('id, trigger_type, scheduled_for, status, storage_path, started_at, completed_at, media_object_count, total_bytes')
      .eq('scheduled_for', scheduledFor)
      .maybeSingle()
    if (previousRunError) throw previousRunError

    if (previousRun?.status === 'succeeded') return { alreadyRan: true, run: previousRun }
    if (previousRun?.status === 'running') return { alreadyRunning: true, run: previousRun }

    if (previousRun?.status === 'failed') {
      if (previousRun.storage_path) await removeBackupPath(storage, previousRun.storage_path)
      const { data: retriedRun, error: retryError } = await adminSupabase
        .from('admin_backup_runs')
        .update({
          status: 'running',
          storage_path: storagePath,
          media_object_count: 0,
          total_bytes: 0,
          error_message: null,
          started_at: new Date().toISOString(),
          completed_at: null,
        })
        .eq('id', previousRun.id)
        .eq('status', 'failed')
        .select('id, trigger_type, scheduled_for, status, storage_path, started_at')
        .maybeSingle()
      if (retryError) throw retryError
      if (retriedRun) run = retriedRun
    }
  }

  if (!run) {
    const { data: insertedRun, error: insertError } = await adminSupabase
      .from('admin_backup_runs')
      .insert({
        id: runId,
        trigger_type: triggerType,
        scheduled_for: scheduledFor,
        status: 'running',
        storage_path: storagePath,
        created_by: createdBy,
      })
      .select('id, trigger_type, scheduled_for, status, storage_path, started_at')
      .single()
    run = insertedRun

    if (insertError) {
      if (insertError.code === '23505') {
        if (scheduledFor) {
          const { data: existingRun, error: existingRunError } = await adminSupabase
            .from('admin_backup_runs')
            .select('id, trigger_type, scheduled_for, status, storage_path, started_at, completed_at, media_object_count, total_bytes')
            .eq('scheduled_for', scheduledFor)
            .maybeSingle()
          if (existingRunError) throw existingRunError
          if (existingRun?.status === 'succeeded') return { alreadyRan: true, run: existingRun }
          if (existingRun?.status === 'running') return { alreadyRunning: true, run: existingRun }
        }

        const { data: activeRun, error: activeRunError } = await adminSupabase
          .from('admin_backup_runs')
          .select('id, status, started_at')
          .eq('status', 'running')
          .maybeSingle()
        if (activeRunError) throw activeRunError
        if (activeRun) return { alreadyRunning: true, run: activeRun }
      }
      throw new Error(`Unable to start backup: ${insertError.message}`)
    }
  }

  let mediaObjectCount = 0
  let totalBytes = 0

  try {
    const { data: backupBucket, error: backupBucketError } = await storage.getBucket(ADMIN_BACKUP_BUCKET)
    if (backupBucketError || !backupBucket || backupBucket.public) {
      throw new Error('The private admin-backups bucket is unavailable. Apply migration 095 and keep this bucket private.')
    }

    const databaseBackup = await createAdminDataBackup(adminSupabase, {
      includeMedia: settings.include_media,
    })
    const { error: databaseUploadError } = await storage
      .from(ADMIN_BACKUP_BUCKET)
      .upload(`${storagePath}/database.json`, Buffer.from(databaseBackup), {
        contentType: 'application/json',
        upsert: false,
      })
    if (databaseUploadError) throw new Error(`Unable to store database snapshot: ${databaseUploadError.message}`)

    totalBytes = Buffer.byteLength(databaseBackup, 'utf8')
    let mediaManifest = null
    if (settings.include_media) {
      const media = await copyMediaToBackup(storage, storagePath)
      mediaManifest = media.files
      mediaObjectCount = media.files.length
      totalBytes += media.totalBytes
    }

    const manifest = {
      format: 'connect-daet-scheduled-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      databaseSnapshot: 'database.json',
      mediaIncluded: settings.include_media,
      mediaObjectCount,
      media: mediaManifest,
    }
    const { error: manifestError } = await storage
      .from(ADMIN_BACKUP_BUCKET)
      .upload(`${storagePath}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), {
        contentType: 'application/json',
        upsert: false,
      })
    if (manifestError) throw new Error(`Unable to store backup manifest: ${manifestError.message}`)

    const completedAt = new Date().toISOString()
    const { data: completedRun, error: finishError } = await adminSupabase
      .from('admin_backup_runs')
      .update({
        status: 'succeeded',
        media_object_count: mediaObjectCount,
        total_bytes: totalBytes,
        completed_at: completedAt,
      })
      .eq('id', run.id)
      .select('id, trigger_type, scheduled_for, status, storage_path, media_object_count, total_bytes, started_at, completed_at')
      .single()
    if (finishError) throw new Error(`Backup files were saved but run status could not be updated: ${finishError.message}`)

    let retentionWarning = null
    try {
      await pruneExpiredBackups(adminSupabase, storage, settings.retention_days)
    } catch (error) {
      retentionWarning = `Backup succeeded, but expired files could not be cleaned up: ${error.message}`
      const { error: warningError } = await adminSupabase
        .from('admin_backup_runs')
        .update({ error_message: retentionWarning })
        .eq('id', run.id)
      if (warningError) console.error('Could not record backup retention warning:', warningError)
    }

    return { run: completedRun, retentionWarning }
  } catch (error) {
    try {
      await removeBackupPath(storage, storagePath)
    } catch (cleanupError) {
      console.error('Failed backup file cleanup failed:', cleanupError)
    }

    const { error: finishError } = await adminSupabase
      .from('admin_backup_runs')
      .update({
        status: 'failed',
        error_message: error.message || 'Backup failed.',
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id)
    if (finishError) {
      console.error('Failed backup status update failed:', finishError)
      throw new Error(`${error.message || 'Backup failed.'} Run status could not be updated.`)
    }
    throw error
  }
}
