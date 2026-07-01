import { z } from 'zod'

const sortParam = z.string().optional()
const cursorParam = z.string().optional()
export const listSearchParams = z.object({ sort: sortParam, cursor: cursorParam })
