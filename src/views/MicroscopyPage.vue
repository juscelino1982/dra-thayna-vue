<template>
  <v-container fluid class="pa-6">
    <v-row>
      <v-col cols="12">
        <div class="d-flex align-center justify-space-between mb-6">
          <div>
            <h1 class="text-h4 font-weight-bold mb-2">Microscopia</h1>
            <p class="text-grey-darken-1">
              Visualize e anote imagens microscópicas de análise de sangue vivo
            </p>
          </div>
        </div>
      </v-col>
    </v-row>

    <!-- Barra de Busca -->
    <v-row class="mb-4">
      <v-col cols="12" md="6">
        <v-text-field
          v-model="search"
          prepend-inner-icon="mdi-magnify"
          label="Buscar por título ou paciente"
          variant="outlined"
          density="compact"
          hide-details
          clearable
        />
      </v-col>
      <v-col cols="12" md="3">
        <v-select
          v-model="filterType"
          :items="analysisTypes"
          label="Tipo de Análise"
          variant="outlined"
          density="compact"
          hide-details
          clearable
        />
      </v-col>
    </v-row>

    <!-- Área de Upload -->
    <v-card class="mb-6" elevation="2" color="primary" variant="tonal">
      <v-card-text>
        <v-row align="center">
          <v-col cols="12" md="6">
            <v-autocomplete
              v-model="selectedPatientId"
              :items="patients"
              item-title="fullName"
              item-value="id"
              label="Selecionar Paciente"
              variant="outlined"
              prepend-inner-icon="mdi-account"
              :loading="patientsLoading"
              :no-data-text="patientsLoading ? 'Carregando pacientes...' : 'Nenhum paciente encontrado'"
              clearable
              hide-details
              bg-color="white"
            />
          </v-col>
          <v-col cols="12" md="6" class="d-flex justify-end gap-2">
            <v-btn
              color="primary"
              size="large"
              prepend-icon="mdi-upload"
              @click="uploadDialog = true"
              variant="elevated"
            >
              Enviar Imagem Microscópica
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Lista de Imagens -->
    <v-row class="mt-4">
      <v-col v-if="loading" cols="12" class="text-center pa-12">
        <v-progress-circular indeterminate color="primary" size="64" />
        <p class="mt-4 text-grey-darken-1">Carregando imagens...</p>
      </v-col>

      <v-col v-else-if="filteredImages.length === 0" cols="12" class="text-center pa-12">
        <v-icon size="64" color="grey-lighten-1">mdi-microscope</v-icon>
        <p class="text-h6 mt-4 text-grey-darken-1">Nenhuma imagem encontrada</p>
        <p class="text-body-2 text-grey-darken-1 mt-2">
          Selecione um paciente acima e clique em "Upload de Imagem" para começar
        </p>
      </v-col>

      <v-col
        v-else
        v-for="image in filteredImages"
        :key="image.id"
        cols="12"
        sm="6"
        md="4"
        lg="3"
      >
        <v-card elevation="2" hover @click="openViewer(image)">
          <v-img
            :src="image.thumbnailUrl || image.fileUrl"
            height="200"
            cover
            class="bg-grey-lighten-2"
          >
            <template v-slot:placeholder>
              <v-progress-circular indeterminate color="primary" />
            </template>
          </v-img>

          <v-card-title class="text-subtitle-1">
            {{ image.title || 'Sem título' }}
          </v-card-title>

          <v-card-subtitle>
            {{ image.patient?.fullName }}
          </v-card-subtitle>

          <v-card-text>
            <v-chip size="small" class="mr-1">
              {{ image.analysisType }}
            </v-chip>
            <v-chip v-if="image.magnification" size="small">
              {{ image.magnification }}
            </v-chip>
            <div class="text-caption text-grey-darken-1 mt-2">
              {{ formatDate(image.createdAt) }}
            </div>
            <div v-if="image.annotations.length" class="text-caption text-primary mt-1">
              <v-icon size="16">mdi-comment-text-outline</v-icon>
              {{ image.annotations.length }} anotações
            </div>
          </v-card-text>

          <v-card-actions>
            <v-btn
              color="primary"
              variant="tonal"
              prepend-icon="mdi-eye"
              @click.stop="openViewer(image)"
              block
            >
              Visualizar Imagem
            </v-btn>
          </v-card-actions>

          <v-card-actions class="pt-0">
            <v-btn
              size="small"
              variant="text"
              prepend-icon="mdi-pencil"
              @click.stop="editImage(image)"
            >
              Editar
            </v-btn>
            <v-spacer />
            <v-btn
              size="small"
              variant="text"
              color="error"
              prepend-icon="mdi-delete"
              @click.stop="deleteImage(image)"
            >
              Deletar
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Dialog de Upload -->
    <v-dialog v-model="uploadDialog" max-width="600">
      <v-card>
        <v-card-title>Upload de Imagem Microscópica</v-card-title>

        <v-card-text>
          <v-form ref="uploadForm">
            <v-file-input
              v-model="uploadFile"
              label="Selecione a imagem"
              prepend-icon="mdi-camera"
              accept="image/*"
              variant="outlined"
              :rules="[v => !!v || 'Imagem obrigatória']"
              class="mb-4"
            />

            <v-text-field
              v-model="uploadData.title"
              label="Título"
              variant="outlined"
              class="mb-4"
            />

            <v-textarea
              v-model="uploadData.description"
              label="Descrição"
              variant="outlined"
              rows="3"
              class="mb-4"
            />

            <v-autocomplete
              v-model="uploadData.patientId"
              :items="patients"
              item-title="fullName"
              item-value="id"
              label="Paciente"
              variant="outlined"
              prepend-inner-icon="mdi-account"
              :loading="patientsLoading"
              :no-data-text="patientsLoading ? 'Carregando pacientes...' : 'Nenhum paciente encontrado'"
              :rules="[v => !!v || 'Paciente obrigatório']"
              clearable
              class="mb-4"
            />

            <v-select
              v-model="uploadData.analysisType"
              :items="analysisTypes"
              label="Tipo de Análise"
              variant="outlined"
              :rules="[v => !!v || 'Tipo obrigatório']"
              class="mb-4"
            />

            <v-select
              v-model="uploadData.magnification"
              :items="magnificationOptions"
              label="Ampliação"
              variant="outlined"
              clearable
            />
          </v-form>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn @click="uploadDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="uploading" @click="handleUpload">
            Enviar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog do Visualizador -->
    <v-dialog v-model="viewerDialog" fullscreen>
      <v-card>
        <v-toolbar color="primary" dark>
          <v-btn icon @click="viewerDialog = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
          <v-toolbar-title>{{ selectedImage?.title || 'Visualizador' }}</v-toolbar-title>
        </v-toolbar>

        <MicroscopyViewer
          v-if="selectedImage"
          :image-id="selectedImage.id"
          @saved="handleSaved"
          @error="handleError"
        />
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import axios from 'axios'
import MicroscopyViewer from '@/components/MicroscopyViewer.vue'

interface MicroscopyImage {
  id: string
  fileUrl: string
  thumbnailUrl?: string
  title?: string
  description?: string
  analysisType: string
  magnification?: string
  createdAt: string
  patient?: {
    id: string
    fullName: string
  }
  annotations: any[]
}

interface Patient {
  id: string
  fullName: string
}

const search = ref('')
const filterType = ref<string | null>(null)
const loading = ref(true)
const patientsLoading = ref(false)
const images = ref<MicroscopyImage[]>([])
const patients = ref<Patient[]>([])
const selectedPatientId = ref<string | null>(null)

const uploadDialog = ref(false)
const uploadFile = ref<File[]>([])
const uploadData = ref({
  title: '',
  description: '',
  patientId: '',
  analysisType: 'campo_claro',
  magnification: '',
})
const uploading = ref(false)
const uploadForm = ref()

const viewerDialog = ref(false)
const selectedImage = ref<MicroscopyImage | null>(null)

const analysisTypes = [
  { title: 'Campo Claro', value: 'campo_claro' },
  { title: 'Campo Escuro', value: 'campo_escuro' },
  { title: 'Contraste de Fase', value: 'contraste_fase' },
]

const magnificationOptions = [
  { title: '4x (Objetiva de Varredura)', value: '4x' },
  { title: '10x (Objetiva de Baixo Aumento)', value: '10x' },
  { title: '40x (Objetiva de Alto Aumento Seco)', value: '40x' },
  { title: '100x (Objetiva de Imersão em Óleo)', value: '100x' },
  { title: '400x (Aumento Total)', value: '400x' },
  { title: '1000x (Aumento Total)', value: '1000x' },
]

const filteredImages = computed(() => {
  let result = images.value

  if (search.value) {
    const searchLower = search.value.toLowerCase()
    result = result.filter(
      (img) =>
        img.title?.toLowerCase().includes(searchLower) ||
        img.patient?.fullName.toLowerCase().includes(searchLower)
    )
  }

  if (filterType.value) {
    result = result.filter((img) => img.analysisType === filterType.value)
  }

  return result
})

onMounted(async () => {
  await Promise.all([loadImages(), loadPatients()])
})

// Pré-preencher paciente no modal quando abrir
watch(uploadDialog, (newValue) => {
  if (newValue && selectedPatientId.value) {
    uploadData.value.patientId = selectedPatientId.value
  }
})

async function loadImages() {
  try {
    loading.value = true
    // TODO: Ajustar para listar todas as imagens ou filtrar por paciente
    const response = await axios.get('/api/microscopy/all')
    images.value = response.data
  } catch (error) {
    console.error('Erro ao carregar imagens:', error)
  } finally {
    loading.value = false
  }
}

async function loadPatients() {
  try {
    patientsLoading.value = true
    console.log('🔍 Carregando pacientes...')
    const response = await axios.get('/api/patients')
    console.log('✅ Pacientes carregados:', response.data)
    patients.value = response.data
    console.log('📊 Total de pacientes:', patients.value.length)
  } catch (error: any) {
    console.error('❌ Erro ao carregar pacientes:', error)
    console.error('Detalhes do erro:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    })
    // Mostrar alerta para o usuário
    alert('Erro ao carregar pacientes. Verifique o console para mais detalhes.')
  } finally {
    patientsLoading.value = false
  }
}

async function handleUpload() {
  const { valid } = await uploadForm.value.validate()
  if (!valid || !uploadFile.value[0]) return

  try {
    uploading.value = true

    const formData = new FormData()
    formData.append('image', uploadFile.value[0])
    formData.append('patientId', uploadData.value.patientId)
    formData.append('title', uploadData.value.title)
    formData.append('description', uploadData.value.description)
    formData.append('analysisType', uploadData.value.analysisType)
    formData.append('magnification', uploadData.value.magnification)

    const response = await axios.post('/api/microscopy/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })

    images.value.unshift(response.data)
    uploadDialog.value = false
    resetUploadForm()
  } catch (error) {
    console.error('Erro ao fazer upload:', error)
    alert('Erro ao fazer upload da imagem')
  } finally {
    uploading.value = false
  }
}

function resetUploadForm() {
  uploadFile.value = []
  uploadData.value = {
    title: '',
    description: '',
    patientId: '',
    analysisType: 'campo_claro',
    magnification: '',
  }
}

function openViewer(image: MicroscopyImage) {
  alert('🔴 BOTÃO CLICADO! ID: ' + image.id)

  console.log('🖼️ Abrindo visualizador para imagem:', image)
  console.log('📋 ID da imagem:', image.id)
  console.log('🔗 URL da imagem:', image.fileUrl)

  selectedImage.value = image
  viewerDialog.value = true

  console.log('✅ selectedImage definido:', selectedImage.value)
  console.log('✅ viewerDialog aberto:', viewerDialog.value)
  console.log('🎯 MicroscopyViewer será renderizado com imageId:', image.id)
}

function editImage(image: MicroscopyImage) {
  // TODO: Implementar edição
  console.log('Edit:', image)
}

async function deleteImage(image: MicroscopyImage) {
  if (!confirm('Tem certeza que deseja deletar esta imagem?')) return

  try {
    await axios.delete(`/api/microscopy/${image.id}`)
    images.value = images.value.filter((img) => img.id !== image.id)
  } catch (error) {
    console.error('Erro ao deletar imagem:', error)
    alert('Erro ao deletar imagem')
  }
}

function handleSaved() {
  alert('Anotações salvas com sucesso!')
  loadImages()
}

function handleError(error: string) {
  alert(error)
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
</script>

<style scoped>
.v-card:hover {
  transform: translateY(-2px);
  transition: transform 0.2s;
}
</style>
