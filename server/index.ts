import express from 'express'
import cors from 'cors'
import patientsRouter from './routes/patients'
import examsRouter from './routes/exams'
import consultationsRouter from './routes/consultations'
import reportsRouter from './routes/reports'

const app = express()
const PORT = 3001

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api/patients', patientsRouter)
app.use('/api/exams', examsRouter)
app.use('/api/consultations', consultationsRouter)
app.use('/api/reports', reportsRouter)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'API funcionando' })
})

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
})
