import { Router } from 'express'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

// GET /api/patients - Listar todos os pacientes
router.get('/', async (req, res) => {
  try {
    const patients = await prisma.patient.findMany({
      orderBy: { fullName: 'asc' },
      include: {
        _count: {
          select: {
            consultations: true,
            reports: true,
            exams: true,
          },
        },
      },
    })

    res.json(patients)
  } catch (error: any) {
    console.error('Erro ao buscar pacientes:', error)
    res.status(500).json({ error: 'Erro ao buscar pacientes', message: error.message })
  }
})

// GET /api/patients/:id - Buscar um paciente específico
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        consultations: {
          orderBy: { date: 'desc' },
          take: 5,
        },
        reports: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        exams: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!patient) {
      return res.status(404).json({ error: 'Paciente não encontrado' })
    }

    res.json(patient)
  } catch (error: any) {
    console.error('Erro ao buscar paciente:', error)
    res.status(500).json({ error: 'Erro ao buscar paciente', message: error.message })
  }
})

// POST /api/patients - Criar novo paciente
router.post('/', async (req, res) => {
  try {
    const patientData = req.body

    const patient = await prisma.patient.create({
      data: patientData,
    })

    res.status(201).json(patient)
  } catch (error: any) {
    console.error('Erro ao criar paciente:', error)
    res.status(500).json({ error: 'Erro ao criar paciente', message: error.message })
  }
})

// PUT /api/patients/:id - Atualizar paciente
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const patientData = req.body

    const patient = await prisma.patient.update({
      where: { id },
      data: patientData,
    })

    res.json(patient)
  } catch (error: any) {
    console.error('Erro ao atualizar paciente:', error)
    res.status(500).json({ error: 'Erro ao atualizar paciente', message: error.message })
  }
})

export default router
