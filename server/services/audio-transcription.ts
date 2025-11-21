import OpenAI from 'openai'
import fs from 'fs/promises'
import path from 'path'
// @ts-ignore - undici exports File in runtime
import { File } from 'undici'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface TranscriptionResult {
  text: string
  duration?: number
  language?: string
  segments?: Array<{
    start: number
    end: number
    text: string
  }>
}

/**
 * Transcreve um arquivo de áudio usando OpenAI Whisper API
 * @param audioFilePathOrUrl - Caminho local ou URL do Vercel Blob
 * @returns Resultado da transcrição
 */
export async function transcribeAudio(
  audioFilePathOrUrl: string
): Promise<TranscriptionResult> {
  try {
    console.log(`[Transcrição] Iniciando transcrição do arquivo: ${audioFilePathOrUrl}`)

    let audioBuffer: Buffer
    let fileName: string

    // Verificar se é URL do Vercel Blob ou path local
    if (audioFilePathOrUrl.startsWith('http://') || audioFilePathOrUrl.startsWith('https://')) {
      console.log('[Transcrição] Baixando áudio do Vercel Blob...')
      // URL do Vercel Blob - baixar
      const response = await fetch(audioFilePathOrUrl)
      if (!response.ok) {
        throw new Error(`Erro ao baixar áudio: ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      audioBuffer = Buffer.from(arrayBuffer)
      fileName = audioFilePathOrUrl.split('/').pop() || 'audio.webm'
    } else {
      console.log('[Transcrição] Lendo áudio local...')
      // Path local - ler
      const fileStats = await fs.stat(audioFilePathOrUrl)
      if (!fileStats.isFile()) {
        throw new Error('Arquivo não encontrado')
      }
      audioBuffer = await fs.readFile(audioFilePathOrUrl)
      fileName = path.basename(audioFilePathOrUrl)
    }

    // Criar File object para OpenAI
    const file = new File([new Uint8Array(audioBuffer)], fileName, {
      type: getAudioMimeType(fileName),
    })

    // Chamar Whisper API
    const startTime = Date.now()
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'pt', // Português
      response_format: 'verbose_json', // Retorna mais detalhes
      temperature: 0.2, // Mais conservador = mais preciso
    })

    const duration = Date.now() - startTime

    console.log(`[Transcrição] Concluída em ${duration}ms`)
    console.log(`[Transcrição] Idioma detectado: ${transcription.language}`)
    console.log(`[Transcrição] Texto: ${transcription.text.substring(0, 100)}...`)

    return {
      text: transcription.text,
      duration: transcription.duration,
      language: transcription.language,
      segments: transcription.segments?.map((seg: any) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
      })),
    }
  } catch (error: any) {
    console.error('[Transcrição] Erro:', error)
    throw new Error(`Erro ao transcrever áudio: ${error.message}`)
  }
}

/**
 * Detecta o MIME type baseado na extensão do arquivo
 */
function getAudioMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.mp4': 'audio/mp4',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
    '.ogg': 'audio/ogg',
    '.mpeg': 'audio/mpeg',
  }
  return mimeTypes[ext] || 'audio/mpeg'
}

/**
 * Processa a transcrição e extrai informações estruturadas usando Claude
 */
export async function extractConsultationData(transcription: string): Promise<{
  chiefComplaint: string
  symptoms: string[]
  medicalHistory: string[]
  recommendations: string[]
  summary: string
}> {
  // Aqui podemos usar Claude para estruturar melhor a transcrição
  // Por enquanto, retornamos a transcrição como está
  // TODO: Implementar extração estruturada com Claude AI

  return {
    chiefComplaint: transcription.split('\n')[0] || '',
    symptoms: [],
    medicalHistory: [],
    recommendations: [],
    summary: transcription,
  }
}
