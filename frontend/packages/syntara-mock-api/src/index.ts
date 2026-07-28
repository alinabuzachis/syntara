import { createServer } from '@mswjs/http-middleware'
import { handlers } from './handlers.js'

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000

const server = createServer(...handlers)

server.listen(port, () => {
  console.log(`Mock API server is running on http://localhost:${port}`)
})
