import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  voiceMetadata: {
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  voicePreference: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
}))

vi.mock('../db/db.service', () => ({
  prisma: mockPrisma,
}))

import { createVoiceService } from './voice.service'

const createWavBuffer = (sampleRate = 22050, durationSeconds = 12): Buffer => {
  const channels = 1
  const bitsPerSample = 16
  const blockAlign = channels * (bitsPerSample / 8)
  const numSamples = Math.floor(sampleRate * durationSeconds)
  const dataSize = numSamples * blockAlign
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * blockAlign, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  return buffer
}

describe('voiceService', () => {
  let voicesDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    mockPrisma.voiceMetadata.findUnique.mockResolvedValue(null)
    mockPrisma.voiceMetadata.findMany.mockResolvedValue([])
    mockPrisma.voiceMetadata.upsert.mockResolvedValue({})
    mockPrisma.voiceMetadata.update.mockResolvedValue({})
    mockPrisma.voiceMetadata.delete.mockResolvedValue({})
    mockPrisma.voicePreference.deleteMany.mockResolvedValue({ count: 0 })

    voicesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voices-'))

    // Create an app voice
    const narratorDir = path.join(voicesDir, 'narrator')

    await fs.mkdir(narratorDir)
    await fs.writeFile(path.join(narratorDir, 'source.wav'), createWavBuffer())
    await fs.writeFile(path.join(narratorDir, 'sample.wav'), Buffer.alloc(100))

    // Create another app voice without sample
    const casualDir = path.join(voicesDir, 'casual')

    await fs.mkdir(casualDir)
    await fs.writeFile(path.join(casualDir, 'source.wav'), createWavBuffer())

    // Create an app voice matching APP_VOICES const (for metadata/tag tests)
    const claraDir = path.join(voicesDir, 'clara')

    await fs.mkdir(claraDir)
    await fs.writeFile(path.join(claraDir, 'source.wav'), createWavBuffer())

    // Create custom dir with one voice
    const customDir = path.join(voicesDir, 'custom', 'my-voice')

    await fs.mkdir(customDir, { recursive: true })
    await fs.writeFile(path.join(customDir, 'source.wav'), createWavBuffer())
    await fs.writeFile(
      path.join(customDir, 'metadata.json'),
      JSON.stringify({ displayName: 'My Voice' }),
    )
  })

  afterEach(async () => {
    await fs.rm(voicesDir, { recursive: true })
  })

  it('lists app voices with type "app"', async () => {
    const service = createVoiceService(voicesDir)
    const voices = await service.listVoices()
    const appVoices = voices.filter(v => v.type === 'app')

    expect(appVoices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'narrator', type: 'app', hasSample: true }),
        expect.objectContaining({ name: 'casual', type: 'app', hasSample: false }),
      ]),
    )
  })

  it('lists custom voices with type "custom"', async () => {
    const service = createVoiceService(voicesDir)
    const voices = await service.listVoices()
    const customVoices = voices.filter(v => v.type === 'custom')

    expect(customVoices).toEqual([
      expect.objectContaining({ name: 'my-voice', type: 'custom', displayName: 'My Voice' }),
    ])
  })

  it('prettifies app voice display names from slug', async () => {
    const service = createVoiceService(voicesDir)
    const voices = await service.listVoices()
    const narrator = voices.find(v => v.name === 'narrator')

    expect(narrator?.displayName).toBe('Narrator')
  })

  it('uses APP_VOICES metadata for known app voices', async () => {
    const service = createVoiceService(voicesDir)
    const voices = await service.listVoices()
    const clara = voices.find(v => v.name === 'clara')

    expect(clara).toEqual(
      expect.objectContaining({
        displayName: 'Clara',
        tags: ['british', 'clear', 'female', 'warm'],
        type: 'app',
      }),
    )
    // Should not have queried DB for this voice
    const findCalls = mockPrisma.voiceMetadata.findUnique.mock.calls
    const claraDbCall = findCalls.find(call => call[0]?.where?.name === 'clara')

    expect(claraDbCall).toBeUndefined()
  })

  it('sorts voices alphabetically within each type, app first', async () => {
    const service = createVoiceService(voicesDir)
    const voices = await service.listVoices()
    const types = voices.map(v => v.type)
    const appEnd = types.lastIndexOf('app')
    const customStart = types.indexOf('custom')

    if (customStart !== -1) {
      expect(appEnd).toBeLessThan(customStart)
    }
  })

  it('uploads a voice with WAV file', async () => {
    const service = createVoiceService(voicesDir)
    const wavBuffer = createWavBuffer(22050, 12)
    const result = await service.uploadVoice('New Voice', wavBuffer, 'recording.wav')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.name).toBe('new-voice')
    expect(result.displayName).toBe('New Voice')

    // Verify file was saved
    const sourcePath = path.join(voicesDir, 'custom', 'new-voice', 'source.wav')
    const fileStat = await fs.stat(sourcePath)

    expect(fileStat.isFile()).toBe(true)

    // Verify metadata was saved to DB
    expect(mockPrisma.voiceMetadata.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'new-voice' },
        create: expect.objectContaining({ displayName: 'New Voice' }),
      }),
    )
  })

  it('rejects upload with too-short audio', async () => {
    const service = createVoiceService(voicesDir)
    const shortWav = createWavBuffer(22050, 3)
    const result = await service.uploadVoice('Short Voice', shortWav, 'short.wav')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('TOO_SHORT')
  })

  it('rejects upload with duplicate name', async () => {
    const service = createVoiceService(voicesDir)
    const wav = createWavBuffer()
    const result = await service.uploadVoice('My Voice', wav, 'test.wav')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('NAME_TAKEN')
  })

  it('rejects upload that collides with app voice name', async () => {
    const service = createVoiceService(voicesDir)
    const wav = createWavBuffer()
    const result = await service.uploadVoice('Narrator', wav, 'test.wav')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('NAME_TAKEN')
  })

  it('soft-deletes a custom voice by setting deletedAt in DB', async () => {
    const service = createVoiceService(voicesDir)
    const derivedDir = path.join(voicesDir, 'custom', 'my-voice', '.derived')

    await fs.mkdir(derivedDir)
    await fs.writeFile(path.join(derivedDir, 'prompt.pt'), Buffer.alloc(10))
    const result = await service.deleteVoice('my-voice')

    expect(result).toEqual({ ok: true })
    await expect(fs.stat(derivedDir)).rejects.toThrow()
    expect(await fs.readFile(path.join(voicesDir, 'custom', 'my-voice', '.deleted'), 'utf8')).toBe(
      '',
    )

    // Directory should still exist (not renamed)
    const dir = await fs.stat(path.join(voicesDir, 'custom', 'my-voice'))

    expect(dir.isDirectory()).toBe(true)

    // DB should have been updated with deletedAt
    expect(mockPrisma.voiceMetadata.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'my-voice' },
        update: expect.objectContaining({ deletedAt: expect.any(Number) }),
      }),
    )

    expect(mockPrisma.voicePreference.deleteMany).toHaveBeenCalledWith({
      where: { voiceName: 'my-voice' },
    })
  })

  it('refuses to delete an app voice', async () => {
    const service = createVoiceService(voicesDir)
    const result = await service.deleteVoice('clara')

    expect(result).toEqual({ ok: false, reason: 'app_voice' })

    // Verify not deleted
    const fileStat = await fs.stat(path.join(voicesDir, 'clara', 'source.wav'))

    expect(fileStat.isFile()).toBe(true)
  })

  it('returns not_found when deleting non-existent voice', async () => {
    const service = createVoiceService(voicesDir)
    const result = await service.deleteVoice('does-not-exist')

    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('restores a soft-deleted voice by clearing deletedAt', async () => {
    const service = createVoiceService(voicesDir)
    const deletionMarker = path.join(voicesDir, 'custom', 'my-voice', '.deleted')
    const derivedDir = path.join(voicesDir, 'custom', 'my-voice', '.derived')

    // Mock: voice exists in DB with deletedAt set
    mockPrisma.voiceMetadata.findUnique.mockResolvedValueOnce({ deletedAt: 1710000000000 })
    await fs.writeFile(deletionMarker, '')
    await fs.mkdir(derivedDir)
    await fs.writeFile(path.join(derivedDir, 'prompt.pt'), Buffer.alloc(10))

    const result = await service.restoreVoice('my-voice')

    expect(result).toEqual({ ok: true })
    await expect(fs.stat(deletionMarker)).rejects.toThrow()
    await expect(fs.stat(derivedDir)).rejects.toThrow()

    // DB should have been updated to clear deletedAt
    expect(mockPrisma.voiceMetadata.update).toHaveBeenCalledWith({
      where: { name: 'my-voice' },
      data: { deletedAt: null },
    })
  })

  it('returns not_found when restoring a voice that is not deleted', async () => {
    const service = createVoiceService(voicesDir)

    // Voice exists in DB but is not deleted
    mockPrisma.voiceMetadata.findUnique.mockResolvedValueOnce({ deletedAt: null })
    const activeResult = await service.restoreVoice('my-voice')

    expect(activeResult).toEqual({ ok: false, reason: 'not_found' })

    // Voice doesn't exist in DB at all
    mockPrisma.voiceMetadata.findUnique.mockResolvedValueOnce(null)
    const missingResult = await service.restoreVoice('does-not-exist')

    expect(missingResult).toEqual({ ok: false, reason: 'not_found' })
  })

  it('returns not_found when the row is hard-deleted between check and update (P2025)', async () => {
    const { Prisma } = await import('../../../../generated/prisma')
    const service = createVoiceService(voicesDir)

    mockPrisma.voiceMetadata.findUnique.mockResolvedValueOnce({ deletedAt: 1710000000000 })
    mockPrisma.voiceMetadata.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    )

    const result = await service.restoreVoice('my-voice')

    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('excludes soft-deleted voices from listing', async () => {
    const service = createVoiceService(voicesDir)

    // Mock: my-voice is marked as deleted in DB
    mockPrisma.voiceMetadata.findMany.mockResolvedValueOnce([{ name: 'my-voice' }])

    const voices = await service.listVoices()
    const names = voices.map(v => v.name)

    expect(names).not.toContain('my-voice')
  })

  it('allows re-upload over a soft-deleted voice', async () => {
    const service = createVoiceService(voicesDir)
    const derivedDir = path.join(voicesDir, 'custom', 'my-voice', '.derived')
    const deletionMarker = path.join(voicesDir, 'custom', 'my-voice', '.deleted')
    const transcriptPath = path.join(voicesDir, 'custom', 'my-voice', 'source.txt')

    await fs.mkdir(derivedDir)
    await fs.writeFile(path.join(derivedDir, 'prompt.pt'), Buffer.alloc(10))
    await fs.writeFile(deletionMarker, '')
    await fs.writeFile(transcriptPath, 'transcript for deleted audio')

    // my-voice exists on disk (from beforeEach) and is soft-deleted in DB
    mockPrisma.voiceMetadata.findUnique.mockResolvedValueOnce({ deletedAt: 1710000000000 })

    const wav = createWavBuffer()
    const result = await service.uploadVoice('My Voice', wav, 'recording.wav')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.name).toBe('my-voice')
    await expect(fs.stat(derivedDir)).rejects.toThrow()
    await expect(fs.stat(deletionMarker)).rejects.toThrow()
    await expect(fs.stat(transcriptPath)).rejects.toThrow()

    // upsert should clear deletedAt
    expect(mockPrisma.voiceMetadata.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'my-voice' },
        update: expect.objectContaining({ deletedAt: null }),
      }),
    )
  })

  it('rejects tag update for app voices', async () => {
    const service = createVoiceService(voicesDir)
    const result = await service.updateVoiceTags('clara', ['new-tag'])

    expect(result).toEqual({ ok: false, reason: 'app_voice' })
    expect(mockPrisma.voiceMetadata.upsert).not.toHaveBeenCalled()
  })

  it('resolves voice path for app voice', async () => {
    const service = createVoiceService(voicesDir)
    const voicePath = await service.resolveVoicePath('narrator')

    expect(voicePath).toBe(path.join(voicesDir, 'narrator', 'source.wav'))
  })

  it('resolves voice path for custom voice', async () => {
    const service = createVoiceService(voicesDir)
    const voicePath = await service.resolveVoicePath('my-voice')

    expect(voicePath).toBe(path.join(voicesDir, 'custom', 'my-voice', 'source.wav'))
  })

  it('returns null for non-existent voice path', async () => {
    const service = createVoiceService(voicesDir)
    const voicePath = await service.resolveVoicePath('nope')

    expect(voicePath).toBeNull()
  })

  it('returns null from resolveVoicePath when voice is soft-deleted', async () => {
    const service = createVoiceService(voicesDir)

    mockPrisma.voiceMetadata.findUnique.mockResolvedValueOnce({ deletedAt: Date.now() })
    const voicePath = await service.resolveVoicePath('my-voice')

    expect(voicePath).toBeNull()
  })

  it('clears derived prompt data when the transcript changes', async () => {
    const service = createVoiceService(voicesDir)
    const voiceDir = path.join(voicesDir, 'custom', 'my-voice')
    const derivedDir = path.join(voiceDir, '.derived')

    await fs.mkdir(derivedDir)
    await fs.writeFile(path.join(derivedDir, 'prompt.pt'), Buffer.alloc(10))

    const result = await service.saveTranscript('my-voice', ' updated transcript ')

    expect(result).toEqual({ ok: true })
    expect(await fs.readFile(path.join(voiceDir, 'source.txt'), 'utf8')).toBe('updated transcript')
    await expect(fs.stat(derivedDir)).rejects.toThrow()
  })

  it('cleanup skips voices still inside the undo window', async () => {
    const service = createVoiceService(voicesDir)

    mockPrisma.voiceMetadata.findMany.mockResolvedValueOnce([])

    const result = await service.cleanupExpiredDeletedVoices()

    expect(result).toEqual({ removed: 0 })
    const dirStat = await fs.stat(path.join(voicesDir, 'custom', 'my-voice'))

    expect(dirStat.isDirectory()).toBe(true)
    expect(mockPrisma.voiceMetadata.delete).not.toHaveBeenCalled()
    expect(mockPrisma.voicePreference.deleteMany).not.toHaveBeenCalled()
  })

  it('cleanup hard-deletes voices past the undo window', async () => {
    const service = createVoiceService(voicesDir)

    mockPrisma.voiceMetadata.findMany.mockResolvedValueOnce([{ name: 'my-voice' }])

    const result = await service.cleanupExpiredDeletedVoices()

    expect(result).toEqual({ removed: 1 })

    await expect(fs.stat(path.join(voicesDir, 'custom', 'my-voice'))).rejects.toThrow()

    expect(mockPrisma.voicePreference.deleteMany).toHaveBeenCalledWith({
      where: { voiceName: 'my-voice' },
    })

    expect(mockPrisma.voiceMetadata.delete).toHaveBeenCalledWith({
      where: { name: 'my-voice' },
    })
  })
})
