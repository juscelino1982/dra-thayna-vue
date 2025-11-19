/**
 * Serviço de Integração com Google Calendar
 *
 * Funções para sincronização bidirecional de eventos entre o sistema
 * e o Google Calendar usando a API oficial do Google.
 */

import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SCOPES = ['https://www.googleapis.com/auth/calendar']

/**
 * Cria um cliente OAuth2 configurado
 */
export function getOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3002/api/calendar/oauth/callback'
  )
}

/**
 * Gera a URL de autorização OAuth2
 */
export function getAuthUrl(userId: string): string {
  const oauth2Client = getOAuth2Client()

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: userId, // Passa o userId no state para recuperar depois
    prompt: 'consent' // Força mostrar tela de consentimento para sempre pegar refresh_token
  })
}

/**
 * Troca o código de autorização por tokens de acesso
 */
export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

/**
 * Salva a integração no banco de dados
 */
export async function saveIntegration(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiryDate: number
) {
  // Remove integrações antigas do Google para este usuário
  await prisma.calendarIntegration.deleteMany({
    where: {
      userId,
      provider: 'google'
    }
  })

  // Cria nova integração
  return await prisma.calendarIntegration.create({
    data: {
      userId,
      provider: 'google',
      accessToken,
      refreshToken,
      tokenExpiry: new Date(expiryDate),
      isActive: true,
      syncStatus: 'ACTIVE'
    }
  })
}

/**
 * Busca a integração do Google Calendar do usuário
 */
export async function getUserIntegration(userId: string) {
  return await prisma.calendarIntegration.findFirst({
    where: {
      userId,
      provider: 'google',
      isActive: true
    }
  })
}

/**
 * Configura o OAuth2Client com os tokens salvos
 */
async function getAuthenticatedClient(userId: string): Promise<OAuth2Client | null> {
  const integration = await getUserIntegration(userId)

  if (!integration || !integration.accessToken) {
    return null
  }

  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({
    access_token: integration.accessToken,
    refresh_token: integration.refreshToken || undefined,
    expiry_date: integration.tokenExpiry?.getTime()
  })

  // Verifica se o token expirou e atualiza se necessário
  if (integration.tokenExpiry && integration.tokenExpiry < new Date()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken()

      // Atualiza tokens no banco
      await prisma.calendarIntegration.update({
        where: { id: integration.id },
        data: {
          accessToken: credentials.access_token || undefined,
          refreshToken: credentials.refresh_token || integration.refreshToken,
          tokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined
        }
      })

      oauth2Client.setCredentials(credentials)
    } catch (error) {
      console.error('Erro ao renovar token:', error)

      // Marca integração como erro
      await prisma.calendarIntegration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'ERROR',
          syncError: 'Erro ao renovar token de acesso'
        }
      })

      return null
    }
  }

  return oauth2Client
}

/**
 * Lista os calendários disponíveis do usuário
 */
export async function listCalendars(userId: string) {
  const auth = await getAuthenticatedClient(userId)
  if (!auth) {
    throw new Error('Usuário não autenticado com Google Calendar')
  }

  const calendar = google.calendar({ version: 'v3', auth })
  const response = await calendar.calendarList.list()

  return response.data.items || []
}

/**
 * Cria um evento no Google Calendar
 */
export async function createCalendarEvent(
  userId: string,
  eventData: {
    title: string
    description?: string
    startTime: Date
    endTime: Date
    location?: string
    attendees?: string[] // Array de emails
  }
) {
  const auth = await getAuthenticatedClient(userId)
  if (!auth) {
    throw new Error('Usuário não autenticado com Google Calendar')
  }

  const integration = await getUserIntegration(userId)
  const calendarId = integration?.calendarId || 'primary'

  const calendar = google.calendar({ version: 'v3', auth })

  const event = {
    summary: eventData.title,
    description: eventData.description,
    location: eventData.location,
    start: {
      dateTime: eventData.startTime.toISOString(),
      timeZone: 'America/Sao_Paulo'
    },
    end: {
      dateTime: eventData.endTime.toISOString(),
      timeZone: 'America/Sao_Paulo'
    },
    attendees: eventData.attendees?.map(email => ({ email })),
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 1 dia antes
        { method: 'popup', minutes: 60 }       // 1 hora antes
      ]
    }
  }

  const response = await calendar.events.insert({
    calendarId,
    requestBody: event,
    sendUpdates: 'all' // Envia convites para os participantes
  })

  return response.data
}

/**
 * Atualiza um evento no Google Calendar
 */
export async function updateCalendarEvent(
  userId: string,
  googleEventId: string,
  eventData: {
    title?: string
    description?: string
    startTime?: Date
    endTime?: Date
    location?: string
    attendees?: string[]
  }
) {
  const auth = await getAuthenticatedClient(userId)
  if (!auth) {
    throw new Error('Usuário não autenticado com Google Calendar')
  }

  const integration = await getUserIntegration(userId)
  const calendarId = integration?.calendarId || 'primary'

  const calendar = google.calendar({ version: 'v3', auth })

  const event: any = {}

  if (eventData.title) event.summary = eventData.title
  if (eventData.description) event.description = eventData.description
  if (eventData.location) event.location = eventData.location
  if (eventData.startTime) {
    event.start = {
      dateTime: eventData.startTime.toISOString(),
      timeZone: 'America/Sao_Paulo'
    }
  }
  if (eventData.endTime) {
    event.end = {
      dateTime: eventData.endTime.toISOString(),
      timeZone: 'America/Sao_Paulo'
    }
  }
  if (eventData.attendees) {
    event.attendees = eventData.attendees.map(email => ({ email }))
  }

  const response = await calendar.events.patch({
    calendarId,
    eventId: googleEventId,
    requestBody: event,
    sendUpdates: 'all'
  })

  return response.data
}

/**
 * Deleta um evento do Google Calendar
 */
export async function deleteCalendarEvent(
  userId: string,
  googleEventId: string
) {
  const auth = await getAuthenticatedClient(userId)
  if (!auth) {
    throw new Error('Usuário não autenticado com Google Calendar')
  }

  const integration = await getUserIntegration(userId)
  const calendarId = integration?.calendarId || 'primary'

  const calendar = google.calendar({ version: 'v3', auth })

  await calendar.events.delete({
    calendarId,
    eventId: googleEventId,
    sendUpdates: 'all'
  })
}

/**
 * Sincroniza um agendamento do sistema com o Google Calendar
 */
export async function syncAppointmentToGoogle(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: true,
      user: true
    }
  })

  if (!appointment) {
    throw new Error('Agendamento não encontrado')
  }

  try {
    // Se já tem um evento no Google, atualiza
    if (appointment.googleEventId) {
      const event = await updateCalendarEvent(
        appointment.userId,
        appointment.googleEventId,
        {
          title: appointment.title,
          description: appointment.description || undefined,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          location: appointment.location || undefined,
          attendees: appointment.patient.email ? [appointment.patient.email] : []
        }
      )

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          syncStatus: 'SYNCED',
          lastSyncAt: new Date(),
          syncError: null
        }
      })

      return event
    }
    // Senão, cria um novo evento
    else {
      const event = await createCalendarEvent(
        appointment.userId,
        {
          title: appointment.title,
          description: appointment.description || undefined,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          location: appointment.location || undefined,
          attendees: appointment.patient.email ? [appointment.patient.email] : []
        }
      )

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          googleEventId: event.id || null,
          syncStatus: 'SYNCED',
          lastSyncAt: new Date(),
          syncError: null
        }
      })

      return event
    }
  } catch (error: any) {
    console.error('Erro ao sincronizar com Google Calendar:', error)

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        syncStatus: 'FAILED',
        syncError: error.message
      }
    })

    throw error
  }
}

/**
 * Remove sincronização de um agendamento do Google Calendar
 */
export async function unsyncAppointmentFromGoogle(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId }
  })

  if (!appointment || !appointment.googleEventId) {
    return
  }

  try {
    await deleteCalendarEvent(appointment.userId, appointment.googleEventId)

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        googleEventId: null,
        syncStatus: 'PENDING',
        lastSyncAt: new Date()
      }
    })
  } catch (error: any) {
    console.error('Erro ao remover sincronização:', error)
    throw error
  }
}

/**
 * Desativa a integração do usuário
 */
export async function disconnectGoogleCalendar(userId: string) {
  await prisma.calendarIntegration.updateMany({
    where: {
      userId,
      provider: 'google'
    },
    data: {
      isActive: false,
      syncStatus: 'DISABLED'
    }
  })

  // Remove googleEventId de todos os agendamentos do usuário
  await prisma.appointment.updateMany({
    where: { userId },
    data: {
      googleEventId: null,
      syncStatus: 'PENDING'
    }
  })
}
