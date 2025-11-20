import OpenAI, { toFile } from 'openai'
import fs from 'fs/promises'
import path from 'path'

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

    let audioBuffer: Buffer | null = null
    let fileName: string = ''

    // Verificar se é URL do Vercel Blob ou path local
    if (audioFilePathOrUrl.startsWith('http://') || audioFilePathOrUrl.startsWith('https://')) {
      console.log('[Transcrição] Baixando áudio do Vercel Blob...')

      // Retry com timeout para download do Vercel Blob
      let lastError: Error | null = null
      const maxRetries = 3

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[Transcrição] Tentativa ${attempt}/${maxRetries} de download...`)

          // Fetch com timeout de 30 segundos
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000)

          const response = await fetch(audioFilePathOrUrl, {
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const arrayBuffer = await response.arrayBuffer()
          audioBuffer = Buffer.from(arrayBuffer)
          fileName = audioFilePathOrUrl.split('/').pop() || 'audio.webm'

          console.log(`[Transcrição] Download concluído: ${audioBuffer.length} bytes`)
          break // Sucesso, sair do loop

        } catch (error: any) {
          lastError = error
          console.error(`[Transcrição] Erro na tentativa ${attempt}:`, error.message)

          if (attempt < maxRetries) {
            const delay = attempt * 1000 // 1s, 2s, 3s
            console.log(`[Transcrição] Aguardando ${delay}ms antes de tentar novamente...`)
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }
      }

      if (!audioBuffer) {
        throw new Error(`Falha ao baixar áudio após ${maxRetries} tentativas: ${lastError?.message}`)
      }
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
    const mimeType = getAudioMimeType(fileName)
    console.log(`[Transcrição] Criando File object:`, {
      fileName,
      mimeType,
      bufferSize: audioBuffer.length,
      bufferSizeKB: (audioBuffer.length / 1024).toFixed(2),
    })

    // Usar toFile() do SDK OpenAI - maneira OFICIAL e CORRETA para Node.js
    const file = await toFile(audioBuffer, fileName, {
      type: mimeType, // ou contentType: mimeType
    })

    console.log(`[Transcrição] File criado com toFile():`, {
      name: fileName,
      size: audioBuffer.length,
      type: mimeType,
    })

    // Chamar Whisper API (mantendo retry por segurança)
    const startTime = Date.now()
    let transcription: any = null
    let lastError: Error | null = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Transcrição] Tentativa ${attempt}/${maxRetries} de chamada à API OpenAI Whisper...`)

        transcription = await openai.audio.transcriptions.create({
          file: file,
          model: 'whisper-1',
          language: 'pt',
          response_format: 'verbose_json',
          temperature: 0.2,
        })

        console.log(`[Transcrição] ✅ API OpenAI respondeu com sucesso na tentativa ${attempt}`)
        break // Sucesso, sair do loop

      } catch (error: any) {
        lastError = error
        console.error(`[Transcrição] ❌ Erro COMPLETO na tentativa ${attempt}:`, error)
        console.error(`[Transcrição] ❌ Erro detalhado:`, {
          message: error.message,
          code: error.code,
          type: error.type,
          status: error.status,
          name: error.name,
          stack: error.stack?.substring(0, 500),
        })

        if (attempt < maxRetries) {
          const delay = attempt * 2000 // 2s, 4s, 6s
          console.log(`[Transcrição] Aguardando ${delay}ms antes de tentar novamente...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    if (!transcription) {
      throw new Error(
        `Falha ao chamar OpenAI Whisper após ${maxRetries} tentativas: ${lastError?.message || 'Erro desconhecido'}`
      )
    }

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
  try {
    console.log('[Extração] Analisando transcrição com Claude...')

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    const prompt = `Você é um assistente médico especializado em análise de consultas. Analise a seguinte transcrição de uma consulta médica e extraia as informações estruturadas em JSON.

TRANSCRIÇÃO DA CONSULTA:
${transcription}

Extraia e retorne um JSON com a seguinte estrutura:
{
  "chiefComplaint": "Queixa principal do paciente (1-2 frases)",
  "symptoms": ["Lista de sintomas mencionados"],
  "medicalHistory": ["Histórico médico relevante mencionado"],
  "recommendations": ["Recomendações e orientações dadas"],
  "summary": "Resumo estruturado da consulta em 2-3 parágrafos, incluindo: queixa principal, sintomas relatados, achados do exame físico (se mencionado), hipóteses diagnósticas, e plano de tratamento/acompanhamento"
}

IMPORTANTE:
- Seja conciso mas preserve informações médicas importantes
- Use termos médicos quando apropriado
- Se uma seção não tiver informação, use array vazio [] ou string vazia ""
- O resumo deve ser claro e útil para a Dra. Thayná revisar rapidamente a consulta

Retorne APENAS o JSON, sem explicações adicionais.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Resposta inesperada do Claude')
    }

    // Extrair JSON da resposta (remover markdown se houver)
    let jsonText = content.text.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '')
    }

    const extracted = JSON.parse(jsonText)

    console.log('[Extração] Dados estruturados extraídos com sucesso')

    return {
      chiefComplaint: extracted.chiefComplaint || '',
      symptoms: Array.isArray(extracted.symptoms) ? extracted.symptoms : [],
      medicalHistory: Array.isArray(extracted.medicalHistory) ? extracted.medicalHistory : [],
      recommendations: Array.isArray(extracted.recommendations) ? extracted.recommendations : [],
      summary: extracted.summary || transcription,
    }
  } catch (error: any) {
    console.error('[Extração] Erro ao processar com Claude:', error.message)
    console.warn('[Extração] Retornando estrutura básica como fallback')

    // Fallback: retornar estrutura básica
    return {
      chiefComplaint: transcription.split('\n')[0] || '',
      symptoms: [],
      medicalHistory: [],
      recommendations: [],
      summary: transcription,
    }
  }
}
