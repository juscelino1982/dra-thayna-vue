import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginPage.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'home',
      redirect: '/dashboard',
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/HomePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/pacientes',
      name: 'patients',
      component: () => import('@/views/PatientsPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/pacientes/:id',
      name: 'patient-detail',
      component: () => import('@/views/PatientDetailPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/calendario',
      name: 'calendario',
      component: () => import('@/views/CalendarioPage.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

// Navigation guard para proteção de rotas
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  const isAuthenticated = !!token

  // Se a rota requer autenticação e usuário não está autenticado
  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login')
  }
  // Se usuário está autenticado e tenta acessar login
  else if (to.path === '/login' && isAuthenticated) {
    next('/dashboard')
  }
  // Caso contrário, permite navegação
  else {
    next()
  }
})

export default router
