<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
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
  fontSize?: number
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
let isPanning = false
let panStartX = 0
let panStartY = 0

// Lifecycle
onMounted(async () => {
  await loadImage()
  // Aguardar o próximo tick para garantir que o DOM está renderizado
  await nextTick()
  // Inicializar canvas após DOM estar pronto
  initCanvas()
})

// Watch tool changes
watch(selectedTool, (newTool) => {
  if (!fabricCanvas.value) return
  const cursorMap: Record<string, string> = {
    select: 'default',
    pan: 'grab',
    text: 'text',
    circle: 'crosshair',
    arrow: 'crosshair',
    rectangle: 'crosshair'
  }
  fabricCanvas.value.style.cursor = cursorMap[newTool] || 'crosshair'
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
  if (!fabricCanvas.value || !canvasContainer.value || !image.value) {
    console.warn('Canvas não pode ser inicializado: elementos não encontrados')
    return
  }

  const canvas = fabricCanvas.value
  ctx = canvas.getContext('2d')
  if (!ctx) {
    console.error('Não foi possível obter contexto 2D do canvas')
    return
  }

  // Definir tamanho do canvas
  const containerWidth = canvasContainer.value.clientWidth
  if (containerWidth > 0) {
    canvas.width = containerWidth
    canvas.height = 600
  } else {
    // Fallback se o container ainda não tem largura
    canvas.width = 800
    canvas.height = 600
  }

  // Carregar imagem de fundo
  backgroundImage = new Image()
  backgroundImage.crossOrigin = 'anonymous'
  backgroundImage.onload = () => {
    drawCanvas()
  }
  backgroundImage.onerror = () => {
    console.error('Erro ao carregar imagem de fundo')
  }
  backgroundImage.src = image.value.fileUrl

  // Remover listeners antigos se existirem
  canvas.removeEventListener('mousedown', handleMouseDown)
  canvas.removeEventListener('mousemove', handleMouseMove)
  canvas.removeEventListener('mouseup', handleMouseUp)
  canvas.removeEventListener('wheel', handleWheel)

  // Adicionar event listeners
  canvas.addEventListener('mousedown', handleMouseDown)
  canvas.addEventListener('mousemove', handleMouseMove)
  canvas.addEventListener('mouseup', handleMouseUp)
  canvas.addEventListener('wheel', handleWheel, { passive: false })
}

// Cleanup ao desmontar o componente
onBeforeUnmount(() => {
  if (fabricCanvas.value) {
    fabricCanvas.value.removeEventListener('mousedown', handleMouseDown)
    fabricCanvas.value.removeEventListener('mousemove', handleMouseMove)
    fabricCanvas.value.removeEventListener('mouseup', handleMouseUp)
    fabricCanvas.value.removeEventListener('wheel', handleWheel)
  }
})

// Funções auxiliares para transformação de coordenadas
function getImageTransform() {
  if (!fabricCanvas.value || !backgroundImage) return null

  const imgScale = Math.min(
    fabricCanvas.value.width / backgroundImage.width,
    fabricCanvas.value.height / backgroundImage.height
  ) * scale

  const imgWidth = backgroundImage.width * imgScale
  const imgHeight = backgroundImage.height * imgScale
  const x = (fabricCanvas.value.width - imgWidth) / 2 + offsetX
  const y = (fabricCanvas.value.height - imgHeight) / 2 + offsetY

  return { x, y, width: imgWidth, height: imgHeight, scale: imgScale }
}

// Converter coordenadas do canvas para coordenadas da imagem original
function canvasToImageCoords(canvasX: number, canvasY: number) {
  const transform = getImageTransform()
  if (!transform || !backgroundImage) return { x: canvasX, y: canvasY }

  const imgX = (canvasX - transform.x) / transform.scale
  const imgY = (canvasY - transform.y) / transform.scale

  return { x: imgX, y: imgY }
}

// Converter coordenadas da imagem original para coordenadas do canvas
function imageToCanvasCoords(imgX: number, imgY: number) {
  const transform = getImageTransform()
  if (!transform) return { x: imgX, y: imgY }

  const canvasX = imgX * transform.scale + transform.x
  const canvasY = imgY * transform.scale + transform.y

  return { x: canvasX, y: canvasY }
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
  ctx.fillStyle = annotation.color
  ctx.lineWidth = 2
  ctx.globalAlpha = annotation.opacity

  const data = annotation.data

  switch (annotation.type) {
    case 'circle': {
      const center = imageToCanvasCoords(data.x, data.y)
      const transform = getImageTransform()
      const radius = data.radius * (transform?.scale || 1)

      ctx.beginPath()
      ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI)
      ctx.stroke()
      break
    }

    case 'rectangle': {
      const topLeft = imageToCanvasCoords(data.x, data.y)
      const transform = getImageTransform()
      const width = data.width * (transform?.scale || 1)
      const height = data.height * (transform?.scale || 1)

      ctx.strokeRect(topLeft.x, topLeft.y, width, height)
      break
    }

    case 'arrow': {
      const start = imageToCanvasCoords(data.x1, data.y1)
      const end = imageToCanvasCoords(data.x2, data.y2)

      // Desenhar linha
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()

      // Desenhar ponta da seta
      const angle = Math.atan2(end.y - start.y, end.x - start.x)
      const arrowLength = 15
      const arrowAngle = Math.PI / 6

      ctx.beginPath()
      ctx.moveTo(end.x, end.y)
      ctx.lineTo(
        end.x - arrowLength * Math.cos(angle - arrowAngle),
        end.y - arrowLength * Math.sin(angle - arrowAngle)
      )
      ctx.moveTo(end.x, end.y)
      ctx.lineTo(
        end.x - arrowLength * Math.cos(angle + arrowAngle),
        end.y - arrowLength * Math.sin(angle + arrowAngle)
      )
      ctx.stroke()
      break
    }

    case 'text': {
      const pos = imageToCanvasCoords(data.x, data.y)
      const fontSize = annotation.fontSize || 16
      const transform = getImageTransform()
      const scaledFontSize = fontSize * (transform?.scale || 1)

      ctx.font = `${scaledFontSize}px Arial`
      ctx.fillText(data.text || '', pos.x, pos.y)
      break
    }
  }

  ctx.globalAlpha = 1
}

let isDrawing = false
let startX = 0
let startY = 0
let currentAnnotation: Partial<ImageAnnotation> | null = null

function handleMouseDown(e: MouseEvent) {
  if (!fabricCanvas.value) return

  const rect = fabricCanvas.value.getBoundingClientRect()
  const canvasX = e.clientX - rect.left
  const canvasY = e.clientY - rect.top

  // Modo Pan
  if (selectedTool.value === 'pan' || e.button === 1) {
    isPanning = true
    panStartX = canvasX - offsetX
    panStartY = canvasY - offsetY
    if (fabricCanvas.value) {
      fabricCanvas.value.style.cursor = 'grabbing'
    }
    return
  }

  // Modo Select - não faz nada no mousedown
  if (selectedTool.value === 'select') return

  // Modo Text - criar anotação de texto
  if (selectedTool.value === 'text') {
    const imgCoords = canvasToImageCoords(canvasX, canvasY)
    const text = prompt('Digite o texto da anotação:')

    if (text) {
      const newAnnotation: ImageAnnotation = {
        id: `temp-${Date.now()}`,
        type: 'text',
        color: selectedColor.value,
        opacity: 1,
        fontSize: 16,
        data: { x: imgCoords.x, y: imgCoords.y, text },
      }
      annotations.value.push(newAnnotation)
      drawCanvas()
    }

    selectedTool.value = 'select'
    return
  }

  // Outros modos de desenho
  startX = canvasX
  startY = canvasY
  isDrawing = true

  const imgCoords = canvasToImageCoords(canvasX, canvasY)

  currentAnnotation = {
    id: `temp-${Date.now()}`,
    type: selectedTool.value,
    color: selectedColor.value,
    opacity: 0.7,
    data: { x: imgCoords.x, y: imgCoords.y },
  }
}

function handleMouseMove(e: MouseEvent) {
  if (!fabricCanvas.value) return

  const rect = fabricCanvas.value.getBoundingClientRect()
  const canvasX = e.clientX - rect.left
  const canvasY = e.clientY - rect.top

  // Modo Pan
  if (isPanning) {
    offsetX = canvasX - panStartX
    offsetY = canvasY - panStartY
    drawCanvas()
    return
  }

  // Desenho de anotações
  if (!isDrawing || !currentAnnotation) return

  const startImgCoords = canvasToImageCoords(startX, startY)
  const currentImgCoords = canvasToImageCoords(canvasX, canvasY)

  switch (selectedTool.value) {
    case 'circle': {
      const radius = Math.sqrt(
        Math.pow(currentImgCoords.x - startImgCoords.x, 2) +
          Math.pow(currentImgCoords.y - startImgCoords.y, 2)
      )
      currentAnnotation.data = { x: startImgCoords.x, y: startImgCoords.y, radius }
      break
    }

    case 'rectangle': {
      currentAnnotation.data = {
        x: startImgCoords.x,
        y: startImgCoords.y,
        width: currentImgCoords.x - startImgCoords.x,
        height: currentImgCoords.y - startImgCoords.y,
      }
      break
    }

    case 'arrow': {
      currentAnnotation.data = {
        x1: startImgCoords.x,
        y1: startImgCoords.y,
        x2: currentImgCoords.x,
        y2: currentImgCoords.y,
      }
      break
    }
  }

  drawCanvas()
  if (currentAnnotation.data) {
    drawAnnotation(currentAnnotation as ImageAnnotation)
  }
}

function handleMouseUp() {
  // Finalizar pan
  if (isPanning) {
    isPanning = false
    if (fabricCanvas.value) {
      fabricCanvas.value.style.cursor = selectedTool.value === 'pan' ? 'grab' : 'default'
    }
    return
  }

  // Finalizar desenho
  if (!isDrawing || !currentAnnotation) return

  isDrawing = false

  // Validar dados da anotação antes de adicionar
  if (currentAnnotation.data && validateAnnotation(currentAnnotation as ImageAnnotation)) {
    annotations.value.push(currentAnnotation as ImageAnnotation)
  }

  currentAnnotation = null
  selectedTool.value = 'select'
  drawCanvas()
}

// Adicionar função de wheel para zoom
function handleWheel(e: WheelEvent) {
  e.preventDefault()

  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const oldScale = scale
  scale *= delta

  // Limitar zoom
  scale = Math.max(0.1, Math.min(scale, 10))

  // Ajustar offset para zoom centrado no cursor
  if (fabricCanvas.value) {
    const rect = fabricCanvas.value.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const scaleChange = scale / oldScale
    offsetX = mouseX - (mouseX - offsetX) * scaleChange
    offsetY = mouseY - (mouseY - offsetY) * scaleChange
  }

  drawCanvas()
}

// Validar anotação antes de salvar
function validateAnnotation(annotation: ImageAnnotation): boolean {
  if (!annotation.data) return false

  switch (annotation.type) {
    case 'circle':
      return annotation.data.radius > 5 // Raio mínimo

    case 'rectangle':
      return Math.abs(annotation.data.width) > 5 && Math.abs(annotation.data.height) > 5

    case 'arrow':
      const dx = annotation.data.x2 - annotation.data.x1
      const dy = annotation.data.y2 - annotation.data.y1
      const length = Math.sqrt(dx * dx + dy * dy)
      return length > 10 // Comprimento mínimo

    case 'text':
      return annotation.data.text && annotation.data.text.trim().length > 0

    default:
      return false
  }
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
  scale *= 1.2
  scale = Math.min(scale, 10) // Limitar zoom máximo
  drawCanvas()
}

function zoomOut() {
  scale /= 1.2
  scale = Math.max(scale, 0.1) // Limitar zoom mínimo
  drawCanvas()
}

function resetZoom() {
  scale = 1
  offsetX = 0
  offsetY = 0
  drawCanvas()
}
</script>

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
        <v-btn value="pan" size="small">
          <v-icon>mdi-cursor-move</v-icon>
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
