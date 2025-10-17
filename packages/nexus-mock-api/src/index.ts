import { createServer } from 'http'
import { setupServer } from 'msw/node'
import { handlers } from './handlers.js'

export const mswServer = setupServer(...handlers)

mswServer.listen({ onUnhandledRequest: 'bypass' })

console.log('Mock API server is running...')

const server = createServer().listen(3000, () => {
  console.log('HTTP server is running on http://localhost:3000')
})

process.on('SIGINT', () => {
  mswServer.close()
  server.close()
  console.log('Mock API server has been stopped.')
  process.exit()
})
