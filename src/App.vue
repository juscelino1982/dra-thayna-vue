<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const drawer = ref(true)
const userMenu = ref(false)

const isLoginPage = computed(() => route.path === '/login')
const userName = computed(() => {
  const user = localStorage.getItem('user')
  return user ? JSON.parse(user).name : ''
})

function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/login')
}
</script>

<template>
  <v-app>
    <template v-if="!isLoginPage">
      <v-app-bar color="primary" elevation="0" class="app-bar-clean">
        <v-app-bar-nav-icon @click="drawer = !drawer"></v-app-bar-nav-icon>
        <v-toolbar-title class="font-weight-bold">Sistema de Gestão Clínica</v-toolbar-title>
        <v-spacer></v-spacer>

        <v-menu v-model="userMenu" :close-on-content-click="false" location="bottom">
          <template v-slot:activator="{ props }">
            <v-btn icon v-bind="props">
              <v-avatar color="white" size="36">
                <v-icon color="primary">mdi-account</v-icon>
              </v-avatar>
            </v-btn>
          </template>

          <v-card min-width="250">
            <v-list>
              <v-list-item :prepend-avatar="`https://ui-avatars.com/api/?name=${userName}&background=667eea&color=fff`">
                <v-list-item-title class="font-weight-bold">{{ userName }}</v-list-item-title>
                <v-list-item-subtitle>Administrador</v-list-item-subtitle>
              </v-list-item>
            </v-list>

            <v-divider></v-divider>

            <v-list>
              <v-list-item prepend-icon="mdi-logout" @click="logout">
                <v-list-item-title>Sair</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card>
        </v-menu>
      </v-app-bar>

      <v-navigation-drawer v-model="drawer" class="drawer-clean">
        <v-list density="comfortable" class="pa-2">
          <v-list-item
            prepend-icon="mdi-view-dashboard"
            title="Dashboard"
            to="/dashboard"
            rounded="lg"
            class="mb-1"
          ></v-list-item>
          <v-list-item
            prepend-icon="mdi-account-group"
            title="Pacientes"
            to="/pacientes"
            rounded="lg"
            class="mb-1"
          ></v-list-item>
          <v-list-item
            prepend-icon="mdi-calendar"
            title="Calendário"
            to="/calendario"
            rounded="lg"
            class="mb-1"
          ></v-list-item>
        </v-list>
      </v-navigation-drawer>
    </template>

    <v-main :class="{ 'main-clean': !isLoginPage }">
      <router-view />
    </v-main>
  </v-app>
</template>

<style scoped>
.app-bar-clean {
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.drawer-clean {
  border-right: 1px solid rgba(0, 0, 0, 0.05);
}

.main-clean {
  background: #f8f9fa;
}
</style>

<style scoped>
</style>
