import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { put } from '@vercel/blob'
import multer from 'multer'
import sharp from 'sharp'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

/**
 * @swagger
 * /api/microscopy/upload:
 *   post:
 *     summary: Upload de imagem microscópica
 *     tags: [Microscopy]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               patientId:
 *                 type: string
 *               examId:
 *                 type: string
 *               analysisType:
 *                 type: string
 *               magnification:
 *                 type: string
 *     responses:
 *       201:
 *         description: Imagem enviada com sucesso
 */
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' })
    }

    const { patientId, examId, analysisType, magnification, title, description } = req.body
    const uploadedBy = req.headers['x-user-id'] as string || 'system'

    // Gerar thumbnail
    const thumbnailBuffer = await sharp(req.file.buffer)
      .resize(300, 300, { fit: 'inside' })
      .jpeg({ quality: 80 })
      .toBuffer()

    // Upload da imagem original para Vercel Blob
    const imageBlob = await put(
      `microscopy/${patientId}/${Date.now()}-${req.file.originalname}`,
      req.file.buffer,
      {
        access: 'public',
        contentType: req.file.mimetype,
      }
    )

    // Upload do thumbnail
    const thumbnailBlob = await put(
      `microscopy/thumbnails/${patientId}/${Date.now()}-thumb.jpg`,
      thumbnailBuffer,
      {
        access: 'public',
        contentType: 'image/jpeg',
      }
    )

    // Obter dimensões da imagem
    const metadata = await sharp(req.file.buffer).metadata()

    // Criar registro no banco
    const microscopyImage = await prisma.microscopyImage.create({
      data: {
        patientId,
        examId: examId || null,
        fileName: req.file.originalname,
        fileUrl: imageBlob.url,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        width: metadata.width,
        height: metadata.height,
        thumbnailUrl: thumbnailBlob.url,
        analysisType: analysisType || 'campo_claro',
        magnification,
        title,
        description,
        uploadedBy,
      },
      include: {
        annotations: true,
      },
    })

    res.status(201).json(microscopyImage)
  } catch (error: any) {
    console.error('Erro ao fazer upload de imagem:', error)
    res.status(500).json({ error: 'Erro ao fazer upload', message: error.message })
  }
})

/**
 * @swagger
 * /api/microscopy/patient/{patientId}:
 *   get:
 *     summary: Listar imagens de um paciente
 *     tags: [Microscopy]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de imagens
 */
router.get('/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params

    const images = await prisma.microscopyImage.findMany({
      where: { patientId },
      include: {
        annotations: true,
        exam: {
          select: {
            id: true,
            fileName: true,
            examDate: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(images)
  } catch (error: any) {
    console.error('Erro ao buscar imagens:', error)
    res.status(500).json({ error: 'Erro ao buscar imagens', message: error.message })
  }
})

/**
 * @swagger
 * /api/microscopy/{id}:
 *   get:
 *     summary: Buscar uma imagem específica
 *     tags: [Microscopy]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dados da imagem
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const image = await prisma.microscopyImage.findUnique({
      where: { id },
      include: {
        annotations: {
          orderBy: { createdAt: 'asc' },
        },
        patient: {
          select: {
            id: true,
            fullName: true,
          },
        },
        exam: true,
      },
    })

    if (!image) {
      return res.status(404).json({ error: 'Imagem não encontrada' })
    }

    res.json(image)
  } catch (error: any) {
    console.error('Erro ao buscar imagem:', error)
    res.status(500).json({ error: 'Erro ao buscar imagem', message: error.message })
  }
})

/**
 * @swagger
 * /api/microscopy/{id}:
 *   patch:
 *     summary: Atualizar metadados da imagem
 *     tags: [Microscopy]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               observations:
 *                 type: string
 *     responses:
 *       200:
 *         description: Imagem atualizada
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { title, description, observations, analysisType, magnification } = req.body

    const image = await prisma.microscopyImage.update({
      where: { id },
      data: {
        title,
        description,
        observations,
        analysisType,
        magnification,
      },
      include: {
        annotations: true,
      },
    })

    res.json(image)
  } catch (error: any) {
    console.error('Erro ao atualizar imagem:', error)
    res.status(500).json({ error: 'Erro ao atualizar imagem', message: error.message })
  }
})

/**
 * @swagger
 * /api/microscopy/{id}/annotations:
 *   post:
 *     summary: Adicionar anotação a uma imagem
 *     tags: [Microscopy]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *               data:
 *                 type: object
 *               label:
 *                 type: string
 *               notes:
 *                 type: string
 *               color:
 *                 type: string
 *     responses:
 *       201:
 *         description: Anotação criada
 */
router.post('/:id/annotations', async (req, res) => {
  try {
    const { id } = req.params
    const { type, data, label, notes, color, opacity } = req.body
    const createdBy = req.headers['x-user-id'] as string || 'system'

    const annotation = await prisma.imageAnnotation.create({
      data: {
        imageId: id,
        type,
        data,
        label,
        notes,
        color: color || '#FF5722',
        opacity: opacity || 0.7,
        createdBy,
      },
    })

    res.status(201).json(annotation)
  } catch (error: any) {
    console.error('Erro ao criar anotação:', error)
    res.status(500).json({ error: 'Erro ao criar anotação', message: error.message })
  }
})

/**
 * @swagger
 * /api/microscopy/{imageId}/annotations/{annotationId}:
 *   patch:
 *     summary: Atualizar anotação
 *     tags: [Microscopy]
 */
router.patch('/:imageId/annotations/:annotationId', async (req, res) => {
  try {
    const { annotationId } = req.params
    const { data, label, notes, color, opacity } = req.body

    const annotation = await prisma.imageAnnotation.update({
      where: { id: annotationId },
      data: {
        data,
        label,
        notes,
        color,
        opacity,
      },
    })

    res.json(annotation)
  } catch (error: any) {
    console.error('Erro ao atualizar anotação:', error)
    res.status(500).json({ error: 'Erro ao atualizar anotação', message: error.message })
  }
})

/**
 * @swagger
 * /api/microscopy/{imageId}/annotations/{annotationId}:
 *   delete:
 *     summary: Deletar anotação
 *     tags: [Microscopy]
 */
router.delete('/:imageId/annotations/:annotationId', async (req, res) => {
  try {
    const { annotationId } = req.params

    await prisma.imageAnnotation.delete({
      where: { id: annotationId },
    })

    res.json({ message: 'Anotação removida com sucesso' })
  } catch (error: any) {
    console.error('Erro ao deletar anotação:', error)
    res.status(500).json({ error: 'Erro ao deletar anotação', message: error.message })
  }
})

/**
 * @swagger
 * /api/microscopy/{id}:
 *   delete:
 *     summary: Deletar imagem
 *     tags: [Microscopy]
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    // TODO: Deletar do Vercel Blob também
    await prisma.microscopyImage.delete({
      where: { id },
    })

    res.json({ message: 'Imagem removida com sucesso' })
  } catch (error: any) {
    console.error('Erro ao deletar imagem:', error)
    res.status(500).json({ error: 'Erro ao deletar imagem', message: error.message })
  }
})

export default router
