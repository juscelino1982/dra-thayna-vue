/**
 * Rotas de API para Integração com Calendários
 *
 * Endpoints para:
 * - Autenticação OAuth com Google Calendar
 * - Sincronização de agendamentos
 * - Geração de arquivos .ics para Apple Calendar
 */

import express, { Request, Response } from 'express'
import {
  getAuthUrl,
  exchangeCodeForTokens,
  saveIntegration,
  listCalendars,
  getUserIntegration,
  syncAppointmentToGoogle,
  unsyncAppointmentFromGoogle,
  disconnectGoogleCalendar
} from '../services/google-calendar'
import {
  generateICalForAppointment,
  generateICalForPatient,
  generateICalForDateRange
} from '../services/ical-generator'

const router = express.Router()

// ====================================
// GOOGLE CALENDAR OAUTH
// ====================================

/**
 * @swagger
 * /api/calendar/google/auth:
 *   get:
 *     summary: Inicia o fluxo OAuth com Google Calendar
 *     tags: [Calendar]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do usuário
 *     responses:
 *       200:
 *         description: URL de autorização gerada
 *       400:
 *         description: userId não fornecido
 */
router.get('/google/auth', (req: Request, res: Response) => {
  const { userId } = req.query

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId é obrigatório' })
  }

  const authUrl = getAuthUrl(userId)
  res.json({ authUrl })
})

/**
 * @swagger
 * /api/calendar/google/callback:
 *   get:
 *     summary: Callback do OAuth do Google Calendar
 *     tags: [Calendar]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: userId passado no state
 *     responses:
 *       200:
 *         description: Integração configurada com sucesso
 *       400:
 *         description: Código ou state inválido
 */
router.get('/google/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Código de autorização não fornecido' })
  }

  if (!state || typeof state !== 'string') {
    return res.status(400).json({ error: 'State (userId) não fornecido' })
  }

  const userId = state

  try {
    const tokens = await exchangeCodeForTokens(code)

    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
      return res.status(400).json({ error: 'Tokens inválidos retornados pelo Google' })
    }

    const integration = await saveIntegration(
      userId,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expiry_date
    )

    // Redireciona de volta para o frontend com sucesso
    res.redirect(`http://localhost:3000/settings/calendar?success=true`)
  } catch (error: any) {
    console.error('Erro ao salvar integração:', error)
    res.redirect(`http://localhost:3000/settings/calendar?error=${encodeURIComponent(error.message)}`)
  }
})

/**
 * @swagger
 * /api/calendar/google/calendars:
 *   get:
 *     summary: Lista os calendários do usuário no Google
 *     tags: [Calendar]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de calendários
 *       401:
 *         description: Usuário não autenticado
 */
router.get('/google/calendars', async (req: Request, res: Response) => {
  const { userId } = req.query

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId é obrigatório' })
  }

  try {
    const calendars = await listCalendars(userId)
    res.json({ calendars })
  } catch (error: any) {
    console.error('Erro ao listar calendários:', error)
    res.status(401).json({ error: error.message })
  }
})

/**
 * @swagger
 * /api/calendar/google/status:
 *   get:
 *     summary: Verifica status da integração com Google Calendar
 *     tags: [Calendar]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status da integração
 */
router.get('/google/status', async (req: Request, res: Response) => {
  const { userId } = req.query

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId é obrigatório' })
  }

  try {
    const integration = await getUserIntegration(userId)

    if (!integration) {
      return res.json({ connected: false })
    }

    res.json({
      connected: true,
      isActive: integration.isActive,
      syncStatus: integration.syncStatus,
      lastSyncAt: integration.lastSyncAt,
      email: integration.email,
      calendarName: integration.calendarName
    })
  } catch (error: any) {
    console.error('Erro ao verificar status:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * @swagger
 * /api/calendar/google/disconnect:
 *   post:
 *     summary: Desconecta a integração com Google Calendar
 *     tags: [Calendar]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Integração desconectada
 */
router.post('/google/disconnect', async (req: Request, res: Response) => {
  const { userId } = req.body

  if (!userId) {
    return res.status(400).json({ error: 'userId é obrigatório' })
  }

  try {
    await disconnectGoogleCalendar(userId)
    res.json({ success: true, message: 'Integração desconectada com sucesso' })
  } catch (error: any) {
    console.error('Erro ao desconectar:', error)
    res.status(500).json({ error: error.message })
  }
})

// ====================================
// SINCRONIZAÇÃO DE AGENDAMENTOS
// ====================================

/**
 * @swagger
 * /api/calendar/sync/:appointmentId:
 *   post:
 *     summary: Sincroniza um agendamento com Google Calendar
 *     tags: [Calendar]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agendamento sincronizado
 */
router.post('/sync/:appointmentId', async (req: Request, res: Response) => {
  const { appointmentId } = req.params

  try {
    const event = await syncAppointmentToGoogle(appointmentId)
    res.json({
      success: true,
      message: 'Agendamento sincronizado com sucesso',
      event
    })
  } catch (error: any) {
    console.error('Erro ao sincronizar:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * @swagger
 * /api/calendar/unsync/:appointmentId:
 *   post:
 *     summary: Remove sincronização de um agendamento
 *     tags: [Calendar]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sincronização removida
 */
router.post('/unsync/:appointmentId', async (req: Request, res: Response) => {
  const { appointmentId } = req.params

  try {
    await unsyncAppointmentFromGoogle(appointmentId)
    res.json({
      success: true,
      message: 'Sincronização removida com sucesso'
    })
  } catch (error: any) {
    console.error('Erro ao remover sincronização:', error)
    res.status(500).json({ error: error.message })
  }
})

// ====================================
// GERAÇÃO DE ARQUIVOS .ICS
// ====================================

/**
 * @swagger
 * /api/calendar/ics/appointment/:appointmentId:
 *   get:
 *     summary: Gera arquivo .ics para um agendamento
 *     tags: [Calendar]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Arquivo .ics gerado
 *         content:
 *           text/calendar:
 *             schema:
 *               type: string
 */
router.get('/ics/appointment/:appointmentId', async (req: Request, res: Response) => {
  const { appointmentId } = req.params

  try {
    const icsContent = await generateICalForAppointment(appointmentId)

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="agendamento-${appointmentId}.ics"`)
    res.send(icsContent)
  } catch (error: any) {
    console.error('Erro ao gerar .ics:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * @swagger
 * /api/calendar/ics/patient/:patientId:
 *   get:
 *     summary: Gera arquivo .ics com todos agendamentos de um paciente
 *     tags: [Calendar]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Arquivo .ics gerado
 */
router.get('/ics/patient/:patientId', async (req: Request, res: Response) => {
  const { patientId } = req.params

  try {
    const icsContent = await generateICalForPatient(patientId)

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="agendamentos-paciente-${patientId}.ics"`)
    res.send(icsContent)
  } catch (error: any) {
    console.error('Erro ao gerar .ics:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * @swagger
 * /api/calendar/ics/range:
 *   get:
 *     summary: Gera arquivo .ics para um período
 *     tags: [Calendar]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Arquivo .ics gerado
 */
router.get('/ics/range', async (req: Request, res: Response) => {
  const { startDate, endDate, userId } = req.query

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate e endDate são obrigatórios' })
  }

  try {
    const start = new Date(startDate as string)
    const end = new Date(endDate as string)

    const icsContent = await generateICalForDateRange(
      start,
      end,
      userId as string | undefined
    )

    const filename = userId
      ? `agendamentos-${userId}-${startDate}-${endDate}.ics`
      : `agendamentos-${startDate}-${endDate}.ics`

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(icsContent)
  } catch (error: any) {
    console.error('Erro ao gerar .ics:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
