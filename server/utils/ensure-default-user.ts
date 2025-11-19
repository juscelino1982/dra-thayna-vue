/**
 * Utilitário para garantir que existe um usuário padrão no banco
 */

import { prisma } from '../config/prisma'
import bcrypt from 'bcryptjs'

export async function ensureDefaultUser() {
  try {
    // Verifica se já existe algum usuário
    const userCount = await prisma.user.count()

    if (userCount === 0) {
      console.log('📝 Nenhum usuário encontrado. Criando usuário padrão...')

      const passwordHash = await bcrypt.hash('admin123', 10)

      const defaultUser = await prisma.user.create({
        data: {
          email: 'admin@drathaynamarra.com.br',
          name: 'Dra. Thayná Marra',
          passwordHash,
          role: 'ADMIN'
        }
      })

      console.log('✅ Usuário padrão criado com sucesso!')
      console.log('   Email: admin@drathaynamarra.com.br')
      console.log('   Senha: admin123')
      console.log('   ID:', defaultUser.id)

      return defaultUser
    } else {
      const firstUser = await prisma.user.findFirst()
      console.log('✅ Usuário encontrado:', firstUser?.email, '- ID:', firstUser?.id)
      return firstUser
    }
  } catch (error) {
    console.error('❌ Erro ao garantir usuário padrão:', error)
    throw error
  }
}

export async function getDefaultUserId(): Promise<string> {
  console.log('🔍 getDefaultUserId() chamada')
  const user = await ensureDefaultUser()
  if (!user) {
    console.error('❌ Nenhum usuário encontrado!')
    throw new Error('Nenhum usuário encontrado no banco de dados')
  }
  console.log('🔑 Usando userId:', user.id)
  return user.id
}
