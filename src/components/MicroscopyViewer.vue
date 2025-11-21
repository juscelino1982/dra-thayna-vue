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
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { fabric } from 'fabric'
import panzoom, { type PanZoom } from 'panzoom'
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
let canvas: fabric.Canvas | null = null
let panZoomInstance: PanZoom | null = null

// State
const loading = ref(true)
const image = ref<MicroscopyImage | null>(null)
const annotations = ref<ImageAnnotation[]>([])
const selectedTool = ref('select')
const selectedColor = ref('#FF5722')
const showSidebar = ref(true)
const selectedAnnotation = ref<ImageAnnotation | null>(null)

// Lifecycle
onMounted(async () => {
  await loadImage()
  initCanvas()
})

onUnmounted(() => {
  if (canvas) {
    canvas.dispose()
  }
  if (panZoomInstance) {
    panZoomInstance.dispose()
  }
})

// Watch tool changes
watch(selectedTool, (newTool) => {
  if (!canvas) return

  canvas.isDrawingMode = newTool === 'freehand'
  canvas.selection = newTool === 'select'

  if (newTool === 'select') {
    canvas.defaultCursor = 'default'
  } else {
    canvas.defaultCursor = 'crosshair'
  }
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

  // Criar canvas
  canvas = new fabric.Canvas(fabricCanvas.value, {
    width: canvasContainer.value.clientWidth,
    height: 600,
    backgroundColor: '#000000',
  })

  // Carregar imagem de fundo
  fabric.Image.fromURL(image.value.fileUrl, (img) => {
    if (!canvas) return

    const scale = Math.min(
      canvas.width! / img.width!,
      canvas.height! / img.height!
    )

    img.scale(scale)
    img.set({
      left: (canvas.width! - img.width! * scale) / 2,
      top: (canvas.height! - img.height! * scale) / 2,
      selectable: false,
      evented: false,
    })

    canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas))

    // Carregar anotações existentes
    loadAnnotations()
  })

  // Event listeners
  canvas.on('mouse:down', handleMouseDown)
  canvas.on('mouse:move', handleMouseMove)
  canvas.on('mouse:up', handleMouseUp)
  canvas.on('object:modified', handleObjectModified)
}

let isDrawing = false
let startX = 0
let startY = 0
let currentShape: fabric.Object | null = null

function handleMouseDown(e: fabric.IEvent) {
  if (!canvas || selectedTool.value === 'select') return

  const pointer = canvas.getPointer(e.e)
  isDrawing = true
  startX = pointer.x
  startY = pointer.y

  switch (selectedTool.value) {
    case 'circle':
      currentShape = new fabric.Circle({
        left: startX,
        top: startY,
        radius: 1,
        fill: 'transparent',
        stroke: selectedColor.value,
        strokeWidth: 2,
      })
      canvas.add(currentShape)
      break

    case 'rectangle':
      currentShape = new fabric.Rect({
        left: startX,
        top: startY,
        width: 1,
        height: 1,
        fill: 'transparent',
        stroke: selectedColor.value,
        strokeWidth: 2,
      })
      canvas.add(currentShape)
      break

    case 'arrow':
      currentShape = new fabric.Line([startX, startY, startX, startY], {
        stroke: selectedColor.value,
        strokeWidth: 2,
      })
      canvas.add(currentShape)
      break
  }
}

function handleMouseMove(e: fabric.IEvent) {
  if (!canvas || !isDrawing || !currentShape) return

  const pointer = canvas.getPointer(e.e)

  switch (selectedTool.value) {
    case 'circle':
      const radius = Math.sqrt(
        Math.pow(pointer.x - startX, 2) + Math.pow(pointer.y - startY, 2)
      )
      ;(currentShape as fabric.Circle).set({ radius })
      break

    case 'rectangle':
      const width = pointer.x - startX
      const height = pointer.y - startY
      ;(currentShape as fabric.Rect).set({ width, height })
      break

    case 'arrow':
      ;(currentShape as fabric.Line).set({ x2: pointer.x, y2: pointer.y })
      break
  }

  canvas.renderAll()
}

function handleMouseUp() {
  if (!canvas || !currentShape) return

  isDrawing = false

  // Adicionar à lista de anotações
  const annotation: ImageAnnotation = {
    id: Date.now().toString(),
    type: selectedTool.value,
    data: currentShape.toJSON(),
    color: selectedColor.value,
    opacity: 0.7,
  }

  annotations.value.push(annotation)
  currentShape = null

  // Voltar para modo select
  selectedTool.value = 'select'
}

function handleObjectModified(e: fabric.IEvent) {
  // Atualizar anotação quando modificada
  console.log('Object modified:', e.target)
}

function loadAnnotations() {
  if (!canvas) return

  annotations.value.forEach((annotation) => {
    // Reconstruir objetos fabric a partir dos dados salvos
    fabric.util.enlivenObjects([annotation.data], (objects) => {
      objects.forEach((obj) => {
        canvas?.add(obj)
      })
      canvas?.renderAll()
    })
  })
}

function selectAnnotation(annotation: ImageAnnotation) {
  selectedAnnotation.value = annotation
}

async function deleteAnnotation(annotation: ImageAnnotation) {
  try {
    await axios.delete(`/api/microscopy/${props.imageId}/annotations/${annotation.id}`)
    annotations.value = annotations.value.filter((a) => a.id !== annotation.id)

    // Remover do canvas também
    // TODO: implementar

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

    // Salvar cada anotação
    for (const annotation of annotations.value) {
      if (!annotation.id.startsWith('temp-')) continue // Já salva

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
  if (!canvas) return
  const zoom = canvas.getZoom()
  canvas.setZoom(zoom * 1.1)
}

function zoomOut() {
  if (!canvas) return
  const zoom = canvas.getZoom()
  canvas.setZoom(zoom / 1.1)
}

function resetZoom() {
  if (!canvas) return
  canvas.setZoom(1)
  canvas.absolutePan({ x: 0, y: 0 })
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
