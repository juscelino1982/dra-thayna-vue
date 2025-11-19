/**
 * Serviço de Geração de Arquivos iCalendar (.ics)
 *
 * Gera arquivos .ics compatíveis com Apple Calendar, Outlook, Google Calendar
 * e outros clientes de calendário que suportam o padrão iCalendar (RFC 5545)
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Formata uma data para o formato iCalendar (YYYYMMDDTHHMMSS)
 */
function formatICalDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`
}

/**
 * Escapa caracteres especiais para o formato iCalendar
 */
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/**
 * Quebra linhas longas (máximo 75 caracteres por linha conforme RFC)
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line

  const lines: string[] = []
  let currentLine = line.substring(0, 75)
  let remaining = line.substring(75)

  lines.push(currentLine)

  while (remaining.length > 0) {
    currentLine = ' ' + remaining.substring(0, 74) // Continua com espaço
    remaining = remaining.substring(74)
    lines.push(currentLine)
  }

  return lines.join('\r\n')
}

/**
 * Gera um arquivo .ics para um único agendamento
 */
export async function generateICalForAppointment(appointmentId: string): Promise<string> {
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

  const now = new Date()
  const uid = `appointment-${appointment.id}@dra-thayna-marra.com.br`

  // Monta o conteúdo do arquivo .ics
  const lines: string[] = []

  // Cabeçalho
  lines.push('BEGIN:VCALENDAR')
  lines.push('VERSION:2.0')
  lines.push('PRODID:-//Dra. Thayná Marra//Sistema de Agendamento//PT-BR')
  lines.push('CALSCALE:GREGORIAN')
  lines.push('METHOD:PUBLISH')
  lines.push('X-WR-CALNAME:Dra. Thayná Marra - Análise do Sangue Vivo')
  lines.push('X-WR-TIMEZONE:America/Sao_Paulo')

  // Fuso horário
  lines.push('BEGIN:VTIMEZONE')
  lines.push('TZID:America/Sao_Paulo')
  lines.push('BEGIN:STANDARD')
  lines.push('DTSTART:19700101T000000')
  lines.push('TZOFFSETFROM:-0300')
  lines.push('TZOFFSETTO:-0300')
  lines.push('TZNAME:BRT')
  lines.push('END:STANDARD')
  lines.push('END:VTIMEZONE')

  // Evento
  lines.push('BEGIN:VEVENT')
  lines.push(`UID:${uid}`)
  lines.push(`DTSTAMP:${formatICalDate(now)}`)
  lines.push(`DTSTART;TZID=America/Sao_Paulo:${formatICalDate(appointment.startTime)}`)
  lines.push(`DTEND;TZID=America/Sao_Paulo:${formatICalDate(appointment.endTime)}`)
  lines.push(foldLine(`SUMMARY:${escapeICalText(appointment.title)}`))

  if (appointment.description) {
    lines.push(foldLine(`DESCRIPTION:${escapeICalText(appointment.description)}`))
  }

  if (appointment.location) {
    lines.push(foldLine(`LOCATION:${escapeICalText(appointment.location)}`))
  }

  // Status
  const statusMap: Record<string, string> = {
    SCHEDULED: 'TENTATIVE',
    CONFIRMED: 'CONFIRMED',
    CANCELLED: 'CANCELLED',
    COMPLETED: 'CONFIRMED',
    NO_SHOW: 'CANCELLED'
  }
  lines.push(`STATUS:${statusMap[appointment.status] || 'TENTATIVE'}`)

  // Organizador
  lines.push(`ORGANIZER;CN=${escapeICalText(appointment.user.name)}:mailto:${appointment.user.email}`)

  // Participante (paciente)
  if (appointment.patient.email) {
    lines.push(
      `ATTENDEE;CN=${escapeICalText(appointment.patient.fullName)};RSVP=TRUE:mailto:${appointment.patient.email}`
    )
  }

  // Lembretes (alarmes)
  // Lembrete 1 dia antes
  lines.push('BEGIN:VALARM')
  lines.push('ACTION:DISPLAY')
  lines.push(foldLine(`DESCRIPTION:Lembrete: ${escapeICalText(appointment.title)} amanhã`))
  lines.push('TRIGGER:-P1D') // 1 dia antes
  lines.push('END:VALARM')

  // Lembrete 1 hora antes
  lines.push('BEGIN:VALARM')
  lines.push('ACTION:DISPLAY')
  lines.push(foldLine(`DESCRIPTION:Lembrete: ${escapeICalText(appointment.title)} em 1 hora`))
  lines.push('TRIGGER:-PT1H') // 1 hora antes
  lines.push('END:VALARM')

  lines.push('END:VEVENT')
  lines.push('END:VCALENDAR')

  return lines.join('\r\n')
}

/**
 * Gera um arquivo .ics com múltiplos agendamentos
 */
export async function generateICalForMultipleAppointments(
  appointmentIds: string[]
): Promise<string> {
  const appointments = await prisma.appointment.findMany({
    where: {
      id: { in: appointmentIds }
    },
    include: {
      patient: true,
      user: true
    }
  })

  if (appointments.length === 0) {
    throw new Error('Nenhum agendamento encontrado')
  }

  const now = new Date()
  const lines: string[] = []

  // Cabeçalho
  lines.push('BEGIN:VCALENDAR')
  lines.push('VERSION:2.0')
  lines.push('PRODID:-//Dra. Thayná Marra//Sistema de Agendamento//PT-BR')
  lines.push('CALSCALE:GREGORIAN')
  lines.push('METHOD:PUBLISH')
  lines.push('X-WR-CALNAME:Dra. Thayná Marra - Agendamentos')
  lines.push('X-WR-TIMEZONE:America/Sao_Paulo')

  // Fuso horário
  lines.push('BEGIN:VTIMEZONE')
  lines.push('TZID:America/Sao_Paulo')
  lines.push('BEGIN:STANDARD')
  lines.push('DTSTART:19700101T000000')
  lines.push('TZOFFSETFROM:-0300')
  lines.push('TZOFFSETTO:-0300')
  lines.push('TZNAME:BRT')
  lines.push('END:STANDARD')
  lines.push('END:VTIMEZONE')

  // Eventos
  for (const appointment of appointments) {
    const uid = `appointment-${appointment.id}@dra-thayna-marra.com.br`

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${formatICalDate(now)}`)
    lines.push(`DTSTART;TZID=America/Sao_Paulo:${formatICalDate(appointment.startTime)}`)
    lines.push(`DTEND;TZID=America/Sao_Paulo:${formatICalDate(appointment.endTime)}`)
    lines.push(foldLine(`SUMMARY:${escapeICalText(appointment.title)}`))

    if (appointment.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeICalText(appointment.description)}`))
    }

    if (appointment.location) {
      lines.push(foldLine(`LOCATION:${escapeICalText(appointment.location)}`))
    }

    const statusMap: Record<string, string> = {
      SCHEDULED: 'TENTATIVE',
      CONFIRMED: 'CONFIRMED',
      CANCELLED: 'CANCELLED',
      COMPLETED: 'CONFIRMED',
      NO_SHOW: 'CANCELLED'
    }
    lines.push(`STATUS:${statusMap[appointment.status] || 'TENTATIVE'}`)

    lines.push(`ORGANIZER;CN=${escapeICalText(appointment.user.name)}:mailto:${appointment.user.email}`)

    if (appointment.patient.email) {
      lines.push(
        `ATTENDEE;CN=${escapeICalText(appointment.patient.fullName)};RSVP=TRUE:mailto:${appointment.patient.email}`
      )
    }

    // Lembretes
    lines.push('BEGIN:VALARM')
    lines.push('ACTION:DISPLAY')
    lines.push(foldLine(`DESCRIPTION:Lembrete: ${escapeICalText(appointment.title)} amanhã`))
    lines.push('TRIGGER:-P1D')
    lines.push('END:VALARM')

    lines.push('BEGIN:VALARM')
    lines.push('ACTION:DISPLAY')
    lines.push(foldLine(`DESCRIPTION:Lembrete: ${escapeICalText(appointment.title)} em 1 hora`))
    lines.push('TRIGGER:-PT1H')
    lines.push('END:VALARM')

    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  return lines.join('\r\n')
}

/**
 * Gera um arquivo .ics com todos os agendamentos de um paciente
 */
export async function generateICalForPatient(patientId: string): Promise<string> {
  const appointments = await prisma.appointment.findMany({
    where: {
      patientId,
      status: { in: ['SCHEDULED', 'CONFIRMED'] } // Apenas agendamentos ativos
    },
    include: {
      patient: true,
      user: true
    },
    orderBy: {
      startTime: 'asc'
    }
  })

  if (appointments.length === 0) {
    throw new Error('Nenhum agendamento encontrado para este paciente')
  }

  return generateICalForMultipleAppointments(appointments.map(a => a.id))
}

/**
 * Gera um arquivo .ics para todos os agendamentos de um período
 */
export async function generateICalForDateRange(
  startDate: Date,
  endDate: Date,
  userId?: string
): Promise<string> {
  const where: any = {
    startTime: {
      gte: startDate,
      lte: endDate
    },
    status: { in: ['SCHEDULED', 'CONFIRMED', 'COMPLETED'] }
  }

  if (userId) {
    where.userId = userId
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      patient: true,
      user: true
    },
    orderBy: {
      startTime: 'asc'
    }
  })

  if (appointments.length === 0) {
    throw new Error('Nenhum agendamento encontrado para este período')
  }

  return generateICalForMultipleAppointments(appointments.map(a => a.id))
}
