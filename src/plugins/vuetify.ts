import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import '@mdi/font/css/materialdesignicons.css'

const clinicTheme = {
  dark: false,
  colors: {
    primary: '#667eea', // Roxo principal da landing
    secondary: '#764ba2', // Roxo mais escuro
    accent: '#a78bfa', // Roxo claro
    error: '#ef4444', // Vermelho
    info: '#3b82f6', // Azul
    success: '#10b981', // Verde
    warning: '#f59e0b', // Amarelo
    background: '#ffffff', // Branco puro
    surface: '#ffffff', // Branco puro
  },
}

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'clinicTheme',
    themes: {
      clinicTheme,
    },
  },
  icons: {
    defaultSet: 'mdi',
  },
})
