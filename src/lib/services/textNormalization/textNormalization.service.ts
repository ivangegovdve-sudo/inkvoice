import { getPythonClient } from '@/lib/services/pythonClient/pythonClient'

const normalizeTexts = async (texts: string[], language?: string): Promise<string[]> => {
  if (texts.length === 0) return []

  const response = await getPythonClient().fetch('/tts/normalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, language }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(`Text normalization failed: ${response.status} ${await response.text()}`)
  }

  const body: unknown = await response.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    !('texts' in body) ||
    !Array.isArray(body.texts) ||
    body.texts.length !== texts.length ||
    !body.texts.every(text => typeof text === 'string')
  ) {
    throw new Error('Text normalization returned an invalid response')
  }

  return body.texts
}

const resolveTexts = (texts: string[]): Promise<string[]> => normalizeTexts(texts)

const resolveText = async (text: string): Promise<string> => {
  const [resolved] = await resolveTexts([text])

  return resolved ?? text
}

export const textNormalizationService = {
  normalizeTexts,
  resolveTexts,
  resolveText,
}
