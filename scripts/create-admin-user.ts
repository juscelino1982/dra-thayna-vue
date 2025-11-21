import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function createAdminUser() {
  try {
    const email = 'juscelino@drathayna.com'
    const password = '251225'
    const name = 'Juscelino'

    // Verificar se já existe
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      console.log('✅ Usuário já existe:', email)
      return
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10)

    // Criar usuário
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: 'ADMIN',
      },
    })

    console.log('✅ Usuário admin criado com sucesso!')
    console.log('📧 Email:', email)
    console.log('🔑 Senha:', password)
    console.log('👤 ID:', user.id)
  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

createAdminUser()
