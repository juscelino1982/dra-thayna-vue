<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'

interface Patient {
  id: string
  fullName: string
  email?: string
  phone: string
}

interface Appointment {
  id: string
  title: string
  description?: string
  startTime: string
  endTime: string
  status: string
  type: string
  location?: string
  isOnline: boolean
  notes?: string
  patient: {
    id: string
    fullName: string
    email?: string
    phone?: string
  }
  user: {
    id: string
    name: string
    email: string
  }
}

interface NewAppointmentForm {
  patientId: string
  title: string
  description: string
  startDate: string
  startTime: string
  endTime: string
  type: string
  location: string
  isOnline: boolean
  notes: string
}

const loading = ref(false)
const appointments = ref<Appointment[]>([])
const patients = ref<Patient[]>([])
const showNewAppointmentDialog = ref(false)
const showAppointmentDetails = ref(false)
const selectedAppointment = ref<Appointment | null>(null)
const submittingForm = ref(false)
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

// Filtros
const statusFilter = ref<string>('all')
const searchQuery = ref('')

// Formulário de novo agendamento
const newAppointmentForm = ref<NewAppointmentForm>({
  patientId: '',
  title: '',
  description: '',
  startDate: new Date().toISOString().split('T')[0],
  startTime: '09:00',
  endTime: '10:00',
  type: 'CONSULTATION',
  location: 'Consultório',
  isOnline: false,
  notes: ''
})

const appointmentTypes = [
  { value: 'CONSULTATION', title: 'Consulta' },
  { value: 'EXAM', title: 'Exame' },
  { value: 'FOLLOWUP', title: 'Retorno' },
  { value: 'OTHER', title: 'Outro' }
]

const statusOptions = [
  { value: 'all', title: 'Todos' },
  { value: 'SCHEDULED', title: 'Agendado' },
  { value: 'CONFIRMED', title: 'Confirmado' },
  { value: 'COMPLETED', title: 'Concluído' },
  { value: 'CANCELLED', title: 'Cancelado' }
]

const filteredAppointments = computed(() => {
  let filtered = appointments.value

  // Filtro por status
  if (statusFilter.value !== 'all') {
    filtered = filtered.filter(apt => apt.status === statusFilter.value)
  }

  // Filtro por busca
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(apt =>
      apt.title.toLowerCase().includes(query) ||
      apt.patient.fullName.toLowerCase().includes(query) ||
      apt.description?.toLowerCase().includes(query)
    )
  }

  return filtered.sort((a, b) =>
    new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  )
})

function getEventColor(status: string) {
  const colors: Record<string, string> = {
    SCHEDULED: 'primary',
    CONFIRMED: 'success',
    CANCELLED: 'error',
    COMPLETED: 'grey',
    NO_SHOW: 'warning'
  }
  return colors[status] || 'primary'
}

function getTypeLabel(type: string) {
  const labels: Record<string, string> = {
    CONSULTATION: 'Consulta',
    EXAM: 'Exame',
    FOLLOWUP: 'Retorno',
    OTHER: 'Outro'
  }
  return labels[type] || type
}

async function loadAppointments() {
  loading.value = true
  try {
    const response = await axios.get('/api/appointments')
    appointments.value = response.data
  } catch (error) {
    console.error('Erro ao carregar agendamentos:', error)
    showSnackbar('Erro ao carregar agendamentos', 'error')
  } finally {
    loading.value = false
  }
}

async function loadPatients() {
  try {
    const response = await axios.get('/api/patients')
    patients.value = response.data
  } catch (error) {
    console.error('Erro ao carregar pacientes:', error)
  }
}

function openNewAppointmentDialog() {
  newAppointmentForm.value = {
    patientId: '',
    title: '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '10:00',
    type: 'CONSULTATION',
    location: 'Consultório',
    isOnline: false,
    notes: ''
  }
  showNewAppointmentDialog.value = true
}

async function createAppointment() {
  if (!newAppointmentForm.value.patientId || !newAppointmentForm.value.title) {
    showSnackbar('Preencha todos os campos obrigatórios', 'warning')
    return
  }

  submittingForm.value = true
  try {
    const form = newAppointmentForm.value

    // Combina data e hora
    const startDateTime = `${form.startDate}T${form.startTime}:00`
    const endDateTime = `${form.startDate}T${form.endTime}:00`

    const payload = {
      patientId: form.patientId,
      // userId será definido automaticamente pelo backend
      title: form.title,
      description: form.description,
      startTime: startDateTime,
      endTime: endDateTime,
      type: form.type,
      location: form.location,
      isOnline: form.isOnline,
      notes: form.notes
    }

    await axios.post('/api/appointments', payload)
    showSnackbar('Agendamento criado com sucesso!', 'success')
    showNewAppointmentDialog.value = false
    await loadAppointments()
  } catch (error: any) {
    console.error('Erro ao criar agendamento:', error)
    showSnackbar(error.response?.data?.error || 'Erro ao criar agendamento', 'error')
  } finally {
    submittingForm.value = false
  }
}

function openAppointmentDetails(appointment: Appointment) {
  selectedAppointment.value = appointment
  showAppointmentDetails.value = true
}

async function updateAppointmentStatus(appointmentId: string, newStatus: string) {
  try {
    await axios.put(`/api/appointments/${appointmentId}`, { status: newStatus })
    showSnackbar('Status atualizado com sucesso!', 'success')
    await loadAppointments()
    showAppointmentDetails.value = false
  } catch (error: any) {
    console.error('Erro ao atualizar status:', error)
    showSnackbar('Erro ao atualizar status', 'error')
  }
}

async function deleteAppointment(appointmentId: string) {
  if (!confirm('Tem certeza que deseja excluir este agendamento?')) {
    return
  }

  try {
    await axios.delete(`/api/appointments/${appointmentId}`)
    showSnackbar('Agendamento excluído com sucesso!', 'success')
    await loadAppointments()
    showAppointmentDetails.value = false
  } catch (error: any) {
    console.error('Erro ao excluir agendamento:', error)
    showSnackbar('Erro ao excluir agendamento', 'error')
  }
}

function formatDateTime(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatTime(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function showSnackbar(text: string, color: string = 'success') {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

onMounted(() => {
  loadAppointments()
  loadPatients()
})
</script>

<template>
  <v-container fluid class="pa-6">
    <!-- Header -->
    <v-row>
      <v-col cols="12">
        <div class="d-flex justify-space-between align-center mb-6">
          <div>
            <h1 class="text-h3 font-weight-bold">Agenda</h1>
            <p class="text-subtitle-1 text-grey-darken-1">
              Gerencie seus agendamentos e consultas
            </p>
          </div>
          <v-btn
            color="primary"
            size="large"
            prepend-icon="mdi-plus"
            @click="openNewAppointmentDialog"
          >
            Novo Agendamento
          </v-btn>
        </div>
      </v-col>
    </v-row>

    <!-- Filters and Search -->
    <v-row>
      <v-col cols="12" md="8">
        <v-text-field
          v-model="searchQuery"
          prepend-inner-icon="mdi-magnify"
          label="Buscar agendamento"
          variant="outlined"
          density="comfortable"
          clearable
          hide-details
        ></v-text-field>
      </v-col>
      <v-col cols="12" md="4">
        <v-select
          v-model="statusFilter"
          :items="statusOptions"
          item-title="title"
          item-value="value"
          label="Filtrar por status"
          variant="outlined"
          density="comfortable"
          hide-details
        ></v-select>
      </v-col>
    </v-row>

    <!-- Appointments List -->
    <v-row class="mt-6">
      <v-col cols="12">
        <v-card elevation="2">
          <v-card-title class="d-flex justify-space-between align-center">
            <span>Agendamentos ({{ filteredAppointments.length }})</span>
          </v-card-title>
          <v-card-text>
            <v-progress-linear v-if="loading" indeterminate color="primary"></v-progress-linear>

            <!-- List view of appointments -->
            <v-list v-if="!loading && filteredAppointments.length > 0">
              <v-list-item
                v-for="appointment in filteredAppointments"
                :key="appointment.id"
                @click="openAppointmentDetails(appointment)"
                class="mb-2 appointment-item"
              >
                <template v-slot:prepend>
                  <v-avatar :color="getEventColor(appointment.status)">
                    <v-icon color="white">mdi-calendar-clock</v-icon>
                  </v-avatar>
                </template>

                <v-list-item-title class="font-weight-bold">
                  {{ appointment.title }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  <div class="d-flex align-center mt-1">
                    <v-icon size="small" class="mr-1">mdi-account</v-icon>
                    {{ appointment.patient.fullName }}
                  </div>
                  <div class="d-flex align-center mt-1">
                    <v-icon size="small" class="mr-1">mdi-clock-outline</v-icon>
                    {{ formatDate(appointment.startTime) }} às {{ formatTime(appointment.startTime) }}
                  </div>
                </v-list-item-subtitle>

                <template v-slot:append>
                  <div class="d-flex flex-column align-end">
                    <v-chip
                      :color="getEventColor(appointment.status)"
                      size="small"
                      variant="flat"
                      class="mb-1"
                    >
                      {{ appointment.status }}
                    </v-chip>
                    <v-chip
                      size="small"
                      variant="outlined"
                    >
                      {{ getTypeLabel(appointment.type) }}
                    </v-chip>
                  </div>
                </template>
              </v-list-item>
            </v-list>

            <div v-else-if="!loading && filteredAppointments.length === 0" class="text-center pa-8">
              <v-icon icon="mdi-calendar-blank" size="64" color="grey-lighten-1"></v-icon>
              <div class="text-h6 text-grey-darken-1 mt-4">
                Nenhum agendamento encontrado
              </div>
              <v-btn
                color="primary"
                class="mt-4"
                prepend-icon="mdi-plus"
                @click="openNewAppointmentDialog"
              >
                Criar Primeiro Agendamento
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- New Appointment Dialog -->
    <v-dialog v-model="showNewAppointmentDialog" max-width="700" persistent>
      <v-card>
        <v-card-title class="bg-primary d-flex justify-space-between align-center">
          <span>Novo Agendamento</span>
          <v-btn icon variant="text" @click="showNewAppointmentDialog = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text class="pa-6">
          <v-form @submit.prevent="createAppointment">
            <v-row>
              <v-col cols="12">
                <v-select
                  v-model="newAppointmentForm.patientId"
                  :items="patients"
                  item-title="fullName"
                  item-value="id"
                  label="Paciente *"
                  variant="outlined"
                  prepend-inner-icon="mdi-account"
                  :rules="[v => !!v || 'Paciente é obrigatório']"
                ></v-select>
              </v-col>

              <v-col cols="12" md="6">
                <v-select
                  v-model="newAppointmentForm.type"
                  :items="appointmentTypes"
                  item-title="title"
                  item-value="value"
                  label="Tipo de Agendamento *"
                  variant="outlined"
                  prepend-inner-icon="mdi-format-list-bulleted-type"
                ></v-select>
              </v-col>

              <v-col cols="12" md="6">
                <v-text-field
                  v-model="newAppointmentForm.title"
                  label="Título *"
                  variant="outlined"
                  prepend-inner-icon="mdi-text"
                  :rules="[v => !!v || 'Título é obrigatório']"
                ></v-text-field>
              </v-col>

              <v-col cols="12">
                <v-textarea
                  v-model="newAppointmentForm.description"
                  label="Descrição"
                  variant="outlined"
                  prepend-inner-icon="mdi-text-box-outline"
                  rows="2"
                ></v-textarea>
              </v-col>

              <v-col cols="12" md="4">
                <v-text-field
                  v-model="newAppointmentForm.startDate"
                  label="Data *"
                  type="date"
                  variant="outlined"
                  prepend-inner-icon="mdi-calendar"
                ></v-text-field>
              </v-col>

              <v-col cols="12" md="4">
                <v-text-field
                  v-model="newAppointmentForm.startTime"
                  label="Hora Início *"
                  type="time"
                  variant="outlined"
                  prepend-inner-icon="mdi-clock-start"
                ></v-text-field>
              </v-col>

              <v-col cols="12" md="4">
                <v-text-field
                  v-model="newAppointmentForm.endTime"
                  label="Hora Fim *"
                  type="time"
                  variant="outlined"
                  prepend-inner-icon="mdi-clock-end"
                ></v-text-field>
              </v-col>

              <v-col cols="12" md="6">
                <v-text-field
                  v-model="newAppointmentForm.location"
                  label="Local"
                  variant="outlined"
                  prepend-inner-icon="mdi-map-marker"
                ></v-text-field>
              </v-col>

              <v-col cols="12" md="6">
                <v-switch
                  v-model="newAppointmentForm.isOnline"
                  label="Consulta Online"
                  color="primary"
                  hide-details
                ></v-switch>
              </v-col>

              <v-col cols="12">
                <v-textarea
                  v-model="newAppointmentForm.notes"
                  label="Observações"
                  variant="outlined"
                  prepend-inner-icon="mdi-note-text"
                  rows="2"
                ></v-textarea>
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn
            variant="text"
            @click="showNewAppointmentDialog = false"
            :disabled="submittingForm"
          >
            Cancelar
          </v-btn>
          <v-btn
            color="primary"
            @click="createAppointment"
            :loading="submittingForm"
          >
            Criar Agendamento
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Appointment Details Dialog -->
    <v-dialog v-model="showAppointmentDetails" max-width="600">
      <v-card v-if="selectedAppointment">
        <v-card-title class="bg-primary d-flex justify-space-between align-center">
          <span>{{ selectedAppointment.title }}</span>
          <v-btn icon variant="text" @click="showAppointmentDetails = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text class="pa-4">
          <v-list>
            <v-list-item prepend-icon="mdi-account">
              <v-list-item-title>Paciente</v-list-item-title>
              <v-list-item-subtitle>{{ selectedAppointment.patient.fullName }}</v-list-item-subtitle>
            </v-list-item>

            <v-list-item prepend-icon="mdi-phone">
              <v-list-item-title>Telefone</v-list-item-title>
              <v-list-item-subtitle>{{ selectedAppointment.patient.phone }}</v-list-item-subtitle>
            </v-list-item>

            <v-list-item prepend-icon="mdi-calendar-clock">
              <v-list-item-title>Data e Hora</v-list-item-title>
              <v-list-item-subtitle>
                {{ formatDateTime(selectedAppointment.startTime) }} - {{ formatTime(selectedAppointment.endTime) }}
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item prepend-icon="mdi-format-list-bulleted-type">
              <v-list-item-title>Tipo</v-list-item-title>
              <v-list-item-subtitle>{{ getTypeLabel(selectedAppointment.type) }}</v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="selectedAppointment.location" prepend-icon="mdi-map-marker">
              <v-list-item-title>Local</v-list-item-title>
              <v-list-item-subtitle>{{ selectedAppointment.location }}</v-list-item-subtitle>
            </v-list-item>

            <v-list-item prepend-icon="mdi-label">
              <v-list-item-title>Status</v-list-item-title>
              <v-list-item-subtitle>
                <v-chip :color="getEventColor(selectedAppointment.status)" size="small">
                  {{ selectedAppointment.status }}
                </v-chip>
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="selectedAppointment.description" prepend-icon="mdi-text">
              <v-list-item-title>Descrição</v-list-item-title>
              <v-list-item-subtitle>{{ selectedAppointment.description }}</v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="selectedAppointment.notes" prepend-icon="mdi-note-text">
              <v-list-item-title>Observações</v-list-item-title>
              <v-list-item-subtitle>{{ selectedAppointment.notes }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>

          <!-- Status Actions -->
          <v-card class="mt-4" variant="outlined">
            <v-card-text>
              <div class="text-subtitle-2 mb-2">Atualizar Status:</div>
              <div class="d-flex flex-wrap gap-2">
                <v-btn
                  v-if="selectedAppointment.status === 'SCHEDULED'"
                  size="small"
                  color="success"
                  @click="updateAppointmentStatus(selectedAppointment.id, 'CONFIRMED')"
                >
                  Confirmar
                </v-btn>
                <v-btn
                  v-if="['SCHEDULED', 'CONFIRMED'].includes(selectedAppointment.status)"
                  size="small"
                  color="grey"
                  @click="updateAppointmentStatus(selectedAppointment.id, 'COMPLETED')"
                >
                  Concluir
                </v-btn>
                <v-btn
                  v-if="['SCHEDULED', 'CONFIRMED'].includes(selectedAppointment.status)"
                  size="small"
                  color="error"
                  @click="updateAppointmentStatus(selectedAppointment.id, 'CANCELLED')"
                >
                  Cancelar
                </v-btn>
              </div>
            </v-card-text>
          </v-card>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-btn
            color="error"
            variant="outlined"
            @click="deleteAppointment(selectedAppointment.id)"
          >
            <v-icon start>mdi-delete</v-icon>
            Excluir
          </v-btn>
          <v-spacer></v-spacer>
          <v-btn
            variant="text"
            @click="showAppointmentDetails = false"
          >
            Fechar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar -->
    <v-snackbar
      v-model="snackbar"
      :color="snackbarColor"
      :timeout="3000"
    >
      {{ snackbarText }}
      <template v-slot:actions>
        <v-btn variant="text" @click="snackbar = false">
          Fechar
        </v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<style scoped>
.appointment-item {
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.appointment-item:hover {
  background-color: rgba(0, 0, 0, 0.04);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.gap-2 {
  gap: 8px;
}
</style>
