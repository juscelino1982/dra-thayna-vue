import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import multer from 'multer'
import fs from 'fs/promises'
import path from 'path'
import { transcribeAudio } from '../services/audio-transcription.js'
import { uploadFile, deleteFile, generateUniqueFilename } from '../services/file-storage.js'

const router = Router()

// Usar /tmp em ambientes serverless (Vercel), ou uploads/ localmente
const isVercel = process.env.VERCEL === '1'
const UPLOADS_DIR = isVercel
  ? path.join('/tmp', 'uploads', 'consultations')
  : path.join(process.cwd(), 'uploads', 'consultations')

// Criar diretório se não existir
fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(console.error)

// Configurar multer para upload
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOADS_DIR)
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
      cb(null, uniqueSuffix + path.extname(file.originalname))
    }
  }),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: (_req, file, cb) => {
    const isAudio = file.mimetype.startsWith('audio/') || file.mimetype === 'video/webm'
    if (isAudio) {
      cb(null, true)
    } else {
      cb(new Error('Apenas arquivos de áudio são permitidos'))
    }
  }
})

/**
 * @swagger
 * tags:
 *   name: Consultations
 *   description: Gerenciamento de consultas médicas
 */

/**
 * @swagger
 * /api/consultations:
 *   get:
 *     summary: Lista todas as consultas
 *     tags: [Consultations]
 *     responses:
 *       200:
 *         description: Lista de consultas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Consultation'
 *       500:
 *         description: Erro interno do servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', async (req, res) => {
  try {
    const consultations = await prisma.consultation.findMany({
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
        audioRecordings: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    })

    res.json(consultations)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao listar consultas', message: error.message })
  }
})

// GET /api/consultations/patient/:patientId - Listar consultas de um paciente
router.get('/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params

    const consultations = await prisma.consultation.findMany({
      where: { patientId },
      include: {
        report: true,
        audioRecordings: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    })

    res.json(consultations)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao listar consultas', message: error.message })
  }
})

/**
 * @swagger
 * /api/consultations/{id}:
 *   get:
 *     summary: Busca uma consulta específica por ID
 *     tags: [Consultations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da consulta
 *     responses:
 *       200:
 *         description: Dados da consulta
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Consultation'
 *       404:
 *         description: Consulta não encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Erro interno do servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const consultation = await prisma.consultation.findUnique({
      where: { id },
      include: {
        patient: true,
        report: true,
        audioRecordings: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    })

    if (!consultation) {
      return res.status(404).json({ error: 'Consulta não encontrada' })
    }

    res.json(consultation)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao buscar consulta', message: error.message })
  }
})

/**
 * @swagger
 * /api/consultations:
 *   post:
 *     summary: Cria uma nova consulta
 *     tags: [Consultations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConsultationInput'
 *     responses:
 *       201:
 *         description: Consulta criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Consultation'
 *       400:
 *         description: Dados inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Paciente ou usuário não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Erro interno do servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', async (req, res) => {
  try {
    const { patientId, conductedBy, chiefComplaint, symptoms, status } = req.body

    if (!patientId) {
      return res.status(400).json({
        error: 'PatientId é obrigatório',
      })
    }

    const patientExists = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } })

    if (!patientExists) {
      return res.status(404).json({
        error: 'Paciente não encontrado',
      })
    }

    // Verificar usuário responsável
    let conductedById = conductedBy as string | undefined

    if (!conductedById) {
      const defaultUser = await prisma.user.findFirst({ select: { id: true } })

      if (!defaultUser) {
        return res.status(400).json({
          error: 'Nenhum usuário cadastrado para associar à consulta. Cadastre um usuário ou informe conductedBy.',
        })
      }

      conductedById = defaultUser.id
    } else {
      const userExists = await prisma.user.findUnique({ where: { id: conductedById }, select: { id: true } })

      if (!userExists) {
        return res.status(404).json({
          error: 'Usuário responsável não encontrado',
        })
      }
    }

    const consultation = await prisma.consultation.create({
      data: {
        patientId,
        conductedBy: conductedById,
        chiefComplaint,
        symptoms,
        status: status || 'SCHEDULED',
      },
      include: {
        patient: true,
      },
    })

    res.status(201).json(consultation)
  } catch (error: any) {
    console.error('Erro ao criar consulta:', error)
    res.status(500).json({ error: 'Erro ao criar consulta', message: error.message })
  }
})

// POST /api/consultations/:id/upload-audio - Upload de áudio da consulta
router.post('/:id/upload-audio', upload.single('audio'), async (req, res) => {
  console.log('[Upload Áudio] 🚀 Requisição recebida')

  try {
    const { id } = req.params

    console.log('[Upload Áudio] Verificando consulta...')
    const consultation = await prisma.consultation.findUnique({
      where: { id },
    })

    if (!consultation) {
      console.error('[Upload Áudio] Consulta não encontrada:', id)
      return res.status(404).json({ error: 'Consulta não encontrada' })
    }

    if (!req.file) {
      console.error('[Upload Áudio] Nenhum arquivo recebido')
      return res.status(400).json({ error: 'Arquivo de áudio é obrigatório' })
    }

    console.log('[Upload Áudio] Arquivo recebido:', {
      name: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path,
    })

    // Ler o arquivo como buffer
    console.log('[Upload Áudio] Lendo buffer do arquivo...')
    const fileBuffer = await fs.readFile(req.file.path)
    console.log(`[Upload Áudio] Buffer lido: ${fileBuffer.length} bytes`)

    // Gerar nome único
    const uniqueFilename = generateUniqueFilename(req.file.originalname || 'audio.webm')
    console.log(`[Upload Áudio] Nome único gerado: ${uniqueFilename}`)

    // Upload para Vercel Blob ou sistema de arquivos local
    console.log('[Upload Áudio] Enviando para storage...')
    const fileUrl = await uploadFile(fileBuffer, uniqueFilename, 'consultations')
    console.log(`[Upload Áudio] Arquivo salvo: ${fileUrl}`)

    // Criar registro no banco
    console.log('[Upload Áudio] Criando registro no banco...')
    const audioRecord = await prisma.consultationAudio.create({
      data: {
        consultationId: id,
        fileUrl: fileUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        transcriptionStatus: 'PROCESSING',
      },
    })
    console.log(`[Upload Áudio] Registro criado com ID: ${audioRecord.id}`)

    // Limpar arquivo temporário
    try {
      await fs.unlink(req.file.path)
      console.log('[Upload Áudio] Arquivo temporário removido')
    } catch (unlinkError) {
      console.warn('Não foi possível deletar arquivo temporário:', unlinkError)
    }

    // IMPORTANTE: Enviar resposta IMEDIATAMENTE antes de processar
    console.log('[Upload Áudio] 📤 Enviando resposta ao cliente...')
    res.status(200).json({
      success: true,
      audio: audioRecord,
      message: 'Upload realizado com sucesso. Transcrição enviada para a OpenAI.',
    })
    console.log('[Upload Áudio] ✅ Resposta enviada!')

    // Iniciar transcrição em background DEPOIS de responder
    console.log('[Upload Áudio] Iniciando transcrição em background...')
    processAudioTranscription(audioRecord.id, fileUrl).catch((error) =>
      console.error('Erro ao processar transcrição:', error)
    )
  } catch (error: any) {
    console.error('[Upload Áudio] ❌ Erro ao salvar áudio:', error)
    console.error('[Upload Áudio] Stack:', error.stack)
    res.status(500).json({ error: 'Erro ao salvar áudio', message: error.message })
  }
})

// PUT /api/consultations/:id - Atualizar consulta
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const {
      chiefComplaint,
      symptoms,
      medicalHistory,
      currentMedications,
      status,
      transcription,
    } = req.body

    const updateData: any = {
      chiefComplaint,
      symptoms,
      medicalHistory,
      currentMedications,
      status,
      transcription,
    }

    const consultation = await prisma.consultation.update({
      where: { id },
      data: updateData,
      include: {
        patient: true,
        audioRecordings: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    })

    res.json(consultation)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao atualizar consulta', message: error.message })
  }
})

// DELETE /api/consultations/:consultationId/audios/:audioId - Deletar áudio específico
router.delete('/:consultationId/audios/:audioId', async (req, res) => {
  try {
    const { consultationId, audioId } = req.params

    const audio = await prisma.consultationAudio.findFirst({
      where: {
        id: audioId,
        consultationId,
      },
    })

    if (!audio) {
      return res.status(404).json({ error: 'Registro de áudio não encontrado' })
    }

    if (audio.fileUrl) {
      try {
        await fs.unlink(audio.fileUrl)
      } catch (error) {
        console.error('Erro ao deletar arquivo de áudio:', error)
      }
    }

    await prisma.consultationAudio.delete({
      where: { id: audioId },
    })

    res.json({ success: true, message: 'Áudio removido com sucesso' })
  } catch (error: any) {
    console.error('Erro ao deletar áudio:', error)
    res.status(500).json({ error: 'Erro ao deletar áudio', message: error.message })
  }
})

// DELETE /api/consultations/:id - Deletar consulta
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const consultation = await prisma.consultation.findUnique({
      where: { id },
      include: {
        audioRecordings: true,
      },
    })

    if (!consultation) {
      return res.status(404).json({ error: 'Consulta não encontrada' })
    }

    // Deletar arquivos de áudio associados
    await Promise.all(
      consultation.audioRecordings.map(async audio => {
        if (audio.fileUrl) {
          try {
            await fs.unlink(audio.fileUrl)
          } catch (error) {
            console.error('Erro ao deletar arquivo de áudio:', error)
          }
        }
      })
    )

    await prisma.consultation.delete({
      where: { id },
    })

    res.json({ success: true, message: 'Consulta deletada com sucesso' })
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao deletar consulta', message: error.message })
  }
})

/**
 * Processa a transcrição do áudio em background
 */
async function processAudioTranscription(audioId: string, audioFilePath: string) {
  try {
    console.log(`[audio:${audioId}] Iniciando transcrição...`)

    // 1. Transcrever áudio com Whisper
    const result = await transcribeAudio(audioFilePath)

    // 2. Atualizar o áudio com a transcrição
    const updatedAudio = await prisma.consultationAudio.update({
      where: { id: audioId },
      data: {
        transcription: result.text,
        duration: result.duration ? Math.round(result.duration) : null,
        transcriptionStatus: 'COMPLETED',
        transcriptionError: null,
      },
      include: {
        consultation: true
      }
    })

    console.log(`[audio:${audioId}] Transcrição concluída: ${result.text.length} caracteres`)

    // 3. Extrair informações estruturadas com Claude (se transcrição tiver conteúdo significativo)
    if (result.text.length > 50) {
      try {
        console.log(`[audio:${audioId}] Extraindo informações estruturadas...`)

        const { extractConsultationData } = await import('../services/audio-transcription.js')
        const extracted = await extractConsultationData(result.text)

        // 4. Atualizar a consulta com as informações extraídas
        await prisma.consultation.update({
          where: { id: updatedAudio.consultationId },
          data: {
            chiefComplaint: extracted.chiefComplaint || updatedAudio.consultation.chiefComplaint,
            symptoms: extracted.symptoms.length > 0
              ? extracted.symptoms.join('; ')
              : updatedAudio.consultation.symptoms,
            medicalHistory: extracted.medicalHistory.length > 0
              ? extracted.medicalHistory.join('; ')
              : updatedAudio.consultation.medicalHistory,
            transcription: `${extracted.summary}\n\n---\n\nTRANSCRIÇÃO COMPLETA:\n${result.text}`,
          },
        })

        console.log(`[audio:${audioId}] Informações estruturadas extraídas e salvas na consulta`)
      } catch (extractError: any) {
        console.error(`[audio:${audioId}] Erro ao extrair informações:`, extractError.message)
        // Não falha a transcrição se a extração falhar - continua apenas com a transcrição
      }
    }

    console.log(`[audio:${audioId}] Processamento completo!`)
  } catch (error: any) {
    console.error(`[audio:${audioId}] Erro na transcrição:`, error)
    console.error(`[audio:${audioId}] Erro detalhado:`, {
      message: error.message,
      code: error.code,
      type: error.type,
      status: error.status,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'), // Primeiras 3 linhas do stack
    })

    // Criar mensagem de erro mais detalhada
    let errorMessage = error.message || 'Erro desconhecido'
    if (error.code) {
      errorMessage = `[${error.code}] ${errorMessage}`
    }
    if (error.status) {
      errorMessage = `${errorMessage} (HTTP ${error.status})`
    }

    await prisma.consultationAudio.update({
      where: { id: audioId },
      data: {
        transcriptionStatus: 'FAILED',
        transcriptionError: errorMessage,
      },
    })
  }
}

export default router
