<template>
  <v-app>
    <v-main class="login-background">
      <v-container fluid class="fill-height pa-0">
        <v-row no-gutters class="fill-height">
          <!-- Lado Esquerdo - Apresentação -->
          <v-col cols="12" md="7" class="presentation-side d-flex flex-column justify-center align-center pa-12">
            <v-card flat color="transparent" max-width="600" class="text-center">
              <v-img
                src="/logo-dra-thayna.png"
                max-width="180"
                class="mx-auto mb-8"
                contain
              />

              <h1 class="text-h3 font-weight-bold mb-4 text-white">
                Sistema de Gestão Clínica
              </h1>

              <h2 class="text-h5 mb-6 text-grey-lighten-2">
                Dra. Thayná Marra
              </h2>

              <p class="text-body-1 text-grey-lighten-3 mb-8">
                Plataforma completa para medicina integrativa com análise de exames, gestão de pacientes e acompanhamento personalizado.
              </p>

              <v-row class="mt-8">
                <v-col cols="12" sm="4" v-for="feature in features" :key="feature.icon">
                  <v-icon :icon="feature.icon" size="48" color="white" class="mb-2" />
                  <div class="text-body-2 text-white font-weight-medium">{{ feature.title }}</div>
                  <div class="text-caption text-grey-lighten-2">{{ feature.description }}</div>
                </v-col>
              </v-row>
            </v-card>
          </v-col>

          <!-- Lado Direito - Login -->
          <v-col cols="12" md="5" class="login-side d-flex align-center justify-center pa-8">
            <v-card
              elevation="0"
              max-width="400"
              width="100%"
              class="pa-8 rounded-xl"
              color="white"
            >
              <div class="text-center mb-8">
                <v-avatar color="primary" size="64" class="mb-4">
                  <v-icon icon="mdi-lock-outline" size="32" color="white" />
                </v-avatar>
                <h2 class="text-h5 font-weight-bold mb-2">Bem-vindo</h2>
                <p class="text-body-2 text-grey-darken-1">Faça login para acessar o sistema</p>
              </div>

              <v-form @submit.prevent="handleLogin" ref="formRef">
                <v-text-field
                  v-model="email"
                  label="Email"
                  type="email"
                  prepend-inner-icon="mdi-email-outline"
                  variant="outlined"
                  :rules="[rules.required, rules.email]"
                  :error-messages="errorMessage"
                  class="mb-4"
                  autofocus
                />

                <v-text-field
                  v-model="password"
                  label="Senha"
                  :type="showPassword ? 'text' : 'password'"
                  prepend-inner-icon="mdi-lock-outline"
                  :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                  @click:append-inner="showPassword = !showPassword"
                  variant="outlined"
                  :rules="[rules.required]"
                  :error-messages="errorMessage"
                  class="mb-6"
                  @keyup.enter="handleLogin"
                />

                <v-btn
                  type="submit"
                  color="primary"
                  size="large"
                  block
                  :loading="loading"
                  class="text-none font-weight-bold mb-4"
                  elevation="0"
                >
                  Entrar
                </v-btn>

                <v-alert
                  v-if="errorMessage"
                  type="error"
                  variant="tonal"
                  density="compact"
                  class="mb-4"
                >
                  {{ errorMessage }}
                </v-alert>
              </v-form>

              <v-divider class="my-6" />

              <div class="text-center text-caption text-grey-darken-1">
                <p class="mb-1">Sistema desenvolvido para gestão clínica profissional</p>
                <p>© 2025 Dra. Thayná Marra - Todos os direitos reservados</p>
              </div>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const formRef = ref()

const features = [
  {
    icon: 'mdi-test-tube',
    title: 'Análise de Exames',
    description: 'Interpretação e laudos',
  },
  {
    icon: 'mdi-account-heart',
    title: 'Gestão Completa',
    description: 'Pacientes e consultas',
  },
  {
    icon: 'mdi-chart-line',
    title: 'Acompanhamento',
    description: 'Evolução detalhada',
  },
]

const rules = {
  required: (v: string) => !!v || 'Campo obrigatório',
  email: (v: string) => /.+@.+\..+/.test(v) || 'Email inválido',
}

async function handleLogin() {
  errorMessage.value = ''

  const { valid } = await formRef.value.validate()
  if (!valid) return

  loading.value = true

  try {
    const response = await axios.post('/api/auth/login', {
      email: email.value,
      password: password.value,
    })

    // Salvar token e dados do usuário
    localStorage.setItem('token', response.data.token)
    localStorage.setItem('user', JSON.stringify(response.data.user))

    // Redirecionar para dashboard
    router.push('/dashboard')
  } catch (error: any) {
    console.error('Erro no login:', error)
    errorMessage.value =
      error.response?.data?.error || 'Erro ao fazer login. Verifique suas credenciais.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-background {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}

.presentation-side {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%);
}

.login-side {
  background: rgba(255, 255, 255, 0.98);
}

@media (max-width: 960px) {
  .presentation-side {
    min-height: 40vh;
  }

  .login-side {
    min-height: 60vh;
  }
}
</style>
