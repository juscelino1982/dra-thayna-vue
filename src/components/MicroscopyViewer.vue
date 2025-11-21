<template>
  <v-card class="microscopy-viewer" elevation="2">
    <!-- Toolbar Superior -->
    <v-toolbar density="compact" color="grey-lighten-4">
      <v-toolbar-title class="text-subtitle-1">
        <v-icon>mdi-microscope</v-icon>
        {{ image?.title || 'Visualizador de Microscopia' }}
      </v-toolbar-title>

      <v-spacer />

      <!-- Ferramentas de Anotação -->
      <v-btn-toggle v-model="selectedTool" mandatory density="compact" class="mr-2">
        <v-btn value="select" size="small">
          <v-icon>mdi-cursor-default</v-icon>
        </v-btn>
        <v-btn value="circle" size="small">
          <v-icon>mdi-circle-outline</v-icon>
        </v-btn>
        <v-btn value="arrow" size="small">
          <v-icon>mdi-arrow-right</v-icon>
        </v-btn>
        <v-btn value="rectangle" size="small">
          <v-icon>mdi-rectangle-outline</v-icon>
        </v-btn>
        <v-btn value="text" size="small">
          <v-icon>mdi-format-text</v-icon>
        </v-btn>
      </v-btn-toggle>

      <v-divider vertical class="mx-2" />

      <!-- Cores -->
      <v-menu>
        <template v-slot:activator="{ props }">
          <v-btn v-bind="props" size="small">
            <v-icon :color="selectedColor">mdi-palette</v-icon>
          </v-btn>
        </template>
        <v-card>
          <v-card-text>
            <v-color-picker v-model="selectedColor" mode="hex" hide-inputs />
          </v-card-text>
        </v-card>
      </v-menu>

      <v-divider vertical class="mx-2" />

      <!-- Controles de Zoom -->
      <v-btn size="small" @click="zoomIn" icon>
        <v-icon>mdi-magnify-plus</v-icon>
      </v-btn>
      <v-btn size="small" @click="zoomOut" icon>
        <v-icon>mdi-magnify-minus</v-icon>
      </v-btn>
      <v-btn size="small" @click="resetZoom" icon>
        <v-icon>mdi-magnify</v-icon>
      </v-btn>

      <v-divider vertical class="mx-2" />

      <!-- Ações -->
      <v-btn size="small" @click="saveAnnotations" color="primary">
        <v-icon left>mdi-content-save</v-icon>
        Salvar
      </v-btn>
    </v-toolbar>

    <!-- Área do Canvas -->
    <v-row no-gutters>
      <!-- Canvas Principal -->
      <v-col :cols="showSidebar ? 9 : 12">
        <div class="canvas-container" ref="canvasContainer">
          <canvas ref="fabricCanvas"></canvas>
        </div>
      </v-col>

      <!-- Sidebar de Anotações -->
      <v-col v-if="showSidebar" cols="3">
        <v-card flat class="annotations-sidebar">
          <v-card-title class="text-subtitle-2 py-2">
            Anotações ({{ annotations.length }})
            <v-spacer />
            <v-btn icon size="x-small" @click="showSidebar = false">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </v-card-title>

          <v-divider />

          <v-list density="compact" class="py-0">
            <v-list-item
              v-for="(annotation, index) in annotations"
              :key="annotation.id"
              @click="selectAnnotation(annotation)"
              :class="{ 'bg-primary-lighten-5': selectedAnnotation?.id === annotation.id }"
            >
              <template v-slot:prepend>
                <v-avatar :color="annotation.color" size="24">
                  <v-icon size="16" color="white">{{ getAnnotationIcon(annotation.type) }}</v-icon>
                </v-avatar>
              </template>

              <v-list-item-title class="text-caption">
                {{ annotation.label || `Anotação ${index + 1}` }}
              </v-list-item-title>

              <template v-slot:append>
                <v-btn icon size="x-small" @click.stop="deleteAnnotation(annotation)">
                  <v-icon size="16">mdi-delete</v-icon>
                </v-btn>
              </template>
            </v-list-item>
          </v-list>

          <!-- Formulário de Edição -->
          <v-card v-if="selectedAnnotation" flat class="pa-3 mt-2">
            <v-text-field
              v-model="selectedAnnotation.label"
              label="Rótulo"
              density="compact"
              variant="outlined"
              hide-details
              class="mb-2"
            />
            <v-textarea
              v-model="selectedAnnotation.notes"
              label="Observações"
              density="compact"
              variant="outlined"
              rows="3"
              hide-details
            />
          </v-card>
        </v-card>
      </v-col>
    </v-row>

    <!-- Toolbar Inferior com Info -->
    <v-toolbar density="compact" color="grey-lighten-5">
      <v-toolbar-title class="text-caption">
        {{ image?.analysisType }} | {{ image?.magnification || 'N/A' }} |
        {{ image?.width }}x{{ image?.height }}px
      </v-toolbar-title>
      <v-spacer />
      <v-btn size="small" @click="showSidebar = !showSidebar" variant="text">
        <v-icon>{{ showSidebar ? 'mdi-chevron-right' : 'mdi-chevron-left' }}</v-icon>
        Anotações
      </v-btn>
    </v-toolbar>

    <!-- Loading -->
    <v-overlay v-model="loading" contained class="align-center justify-center">
      <v-progress-circular indeterminate color="primary" />
    </v-overlay>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import axios from 'axios'

interface MicroscopyImage {
  id: string
  fileUrl: string
  title?: string
  width?: number
  height?: number
  analysisType: string
  magnification?: string
  annotations: ImageAnnotation[]
}

interface ImageAnnotation {
  id: string
  type: string
  data: any
  label?: string
  notes?: string
  color: string
  opacity: number
}

const props = defineProps<{
  imageId: string
}>()

const emit = defineEmits<{
  (e: 'saved'): void
  (e: 'error', error: string): void
}>()

// Refs
const canvasContainer = ref<HTMLDivElement>()
const fabricCanvas = ref<HTMLCanvasElement>()
let ctx: CanvasRenderingContext2D | null = null
let backgroundImage: HTMLImageElement | null = null

// State
const loading = ref(true)
const image = ref<MicroscopyImage | null>(null)
const annotations = ref<ImageAnnotation[]>([])
const selectedTool = ref('select')
const selectedColor = ref('#FF5722')
const showSidebar = ref(true)
const selectedAnnotation = ref<ImageAnnotation | null>(null)

let scale = 1
let offsetX = 0
let offsetY = 0

// Lifecycle
onMounted(async () => {
  await loadImage()
  initCanvas()
})

// Watch tool changes
watch(selectedTool, (newTool) => {
  if (!fabricCanvas.value) return
  fabricCanvas.value.style.cursor = newTool === 'select' ? 'default' : 'crosshair'
})

// Methods
async function loadImage() {
  try {
    loading.value = true
    const response = await axios.get(`/api/microscopy/${props.imageId}`)
    image.value = response.data
    annotations.value = response.data.annotations || []
  } catch (error) {
    console.error('Erro ao carregar imagem:', error)
    emit('error', 'Erro ao carregar imagem')
  } finally {
    loading.value = false
  }
}

function initCanvas() {
  if (!fabricCanvas.value || !canvasContainer.value || !image.value) return

  const canvas = fabricCanvas.value
  ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = canvasContainer.value.clientWidth
  canvas.height = 600

  // Carregar imagem de fundo
  backgroundImage = new Image()
  backgroundImage.crossOrigin = 'anonymous'
  backgroundImage.onload = () => {
    drawCanvas()
  }
  backgroundImage.src = image.value.fileUrl

  // Event listeners
  canvas.addEventListener('mousedown', handleMouseDown)
  canvas.addEventListener('mousemove', handleMouseMove)
  canvas.addEventListener('mouseup', handleMouseUp)
}

function drawCanvas() {
  if (!ctx || !fabricCanvas.value || !backgroundImage) return

  ctx.clearRect(0, 0, fabricCanvas.value.width, fabricCanvas.value.height)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, fabricCanvas.value.width, fabricCanvas.value.height)

  // Desenhar imagem de fundo
  if (backgroundImage.complete) {
    const imgScale = Math.min(
      fabricCanvas.value.width / backgroundImage.width,
      fabricCanvas.value.height / backgroundImage.height
    ) * scale

    const imgWidth = backgroundImage.width * imgScale
    const imgHeight = backgroundImage.height * imgScale
    const x = (fabricCanvas.value.width - imgWidth) / 2 + offsetX
    const y = (fabricCanvas.value.height - imgHeight) / 2 + offsetY

    ctx.drawImage(backgroundImage, x, y, imgWidth, imgHeight)
  }

  // Desenhar anotações
  annotations.value.forEach((annotation) => {
    drawAnnotation(annotation)
  })
}

function drawAnnotation(annotation: ImageAnnotation) {
  if (!ctx) return

  ctx.strokeStyle = annotation.color
  ctx.lineWidth = 2
  ctx.globalAlpha = annotation.opacity

  const data = annotation.data

  switch (annotation.type) {
    case 'circle':
      ctx.beginPath()
      ctx.arc(data.x, data.y, data.radius, 0, 2 * Math.PI)
      ctx.stroke()
      break

    case 'rectangle':
      ctx.strokeRect(data.x, data.y, data.width, data.height)
      break

    case 'arrow':
      ctx.beginPath()
      ctx.moveTo(data.x1, data.y1)
      ctx.lineTo(data.x2, data.y2)
      ctx.stroke()
      break
  }

  ctx.globalAlpha = 1
}

let isDrawing = false
let startX = 0
let startY = 0
let currentAnnotation: Partial<ImageAnnotation> | null = null

function handleMouseDown(e: MouseEvent) {
  if (!fabricCanvas.value || selectedTool.value === 'select') return

  const rect = fabricCanvas.value.getBoundingClientRect()
  startX = e.clientX - rect.left
  startY = e.clientY - rect.top
  isDrawing = true

  currentAnnotation = {
    id: `temp-${Date.now()}`,
    type: selectedTool.value,
    color: selectedColor.value,
    opacity: 0.7,
    data: {},
  }
}

function handleMouseMove(e: MouseEvent) {
  if (!fabricCanvas.value || !isDrawing || !currentAnnotation) return

  const rect = fabricCanvas.value.getBoundingClientRect()
  const currentX = e.clientX - rect.left
  const currentY = e.clientY - rect.top

  switch (selectedTool.value) {
    case 'circle':
      const radius = Math.sqrt(
        Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2)
      )
      currentAnnotation.data = { x: startX, y: startY, radius }
      break

    case 'rectangle':
      currentAnnotation.data = {
        x: startX,
        y: startY,
        width: currentX - startX,
        height: currentY - startY,
      }
      break

    case 'arrow':
      currentAnnotation.data = {
        x1: startX,
        y1: startY,
        x2: currentX,
        y2: currentY,
      }
      break
  }

  drawCanvas()
  if (currentAnnotation.data) {
    drawAnnotation(currentAnnotation as ImageAnnotation)
  }
}

function handleMouseUp() {
  if (!isDrawing || !currentAnnotation) return

  isDrawing = false

  if (currentAnnotation.data) {
    annotations.value.push(currentAnnotation as ImageAnnotation)
  }

  currentAnnotation = null
  selectedTool.value = 'select'
  drawCanvas()
}

function selectAnnotation(annotation: ImageAnnotation) {
  selectedAnnotation.value = annotation
}

async function deleteAnnotation(annotation: ImageAnnotation) {
  try {
    if (!annotation.id.startsWith('temp-')) {
      await axios.delete(`/api/microscopy/${props.imageId}/annotations/${annotation.id}`)
    }

    annotations.value = annotations.value.filter((a) => a.id !== annotation.id)
    drawCanvas()

    if (selectedAnnotation.value?.id === annotation.id) {
      selectedAnnotation.value = null
    }
  } catch (error) {
    console.error('Erro ao deletar anotação:', error)
    emit('error', 'Erro ao deletar anotação')
  }
}

async function saveAnnotations() {
  try {
    loading.value = true

    // Salvar cada anotação nova
    for (const annotation of annotations.value) {
      if (!annotation.id.startsWith('temp-')) continue

      await axios.post(`/api/microscopy/${props.imageId}/annotations`, annotation)
    }

    emit('saved')
  } catch (error) {
    console.error('Erro ao salvar anotações:', error)
    emit('error', 'Erro ao salvar anotações')
  } finally {
    loading.value = false
  }
}

function getAnnotationIcon(type: string) {
  const icons: Record<string, string> = {
    circle: 'mdi-circle-outline',
    arrow: 'mdi-arrow-right',
    rectangle: 'mdi-rectangle-outline',
    text: 'mdi-format-text',
  }
  return icons[type] || 'mdi-label'
}

function zoomIn() {
  scale *= 1.1
  drawCanvas()
}

function zoomOut() {
  scale /= 1.1
  drawCanvas()
}

function resetZoom() {
  scale = 1
  offsetX = 0
  offsetY = 0
  drawCanvas()
}
</script>

<style scoped>
.microscopy-viewer {
  width: 100%;
  height: 100%;
}

.canvas-container {
  position: relative;
  width: 100%;
  height: 600px;
  background: #000;
  overflow: hidden;
}

.annotations-sidebar {
  height: 600px;
  overflow-y: auto;
  border-left: 1px solid rgba(0, 0, 0, 0.12);
}
</style>
