import { Router } from 'express'
import {
  createItem,
  deleteItem,
  getDeletedItems,
  getItems,
  getPendingNotifications,
  markNotificationsDelivered,
  permanentDeleteItem,
  restoreItem,
  updateItem,
} from '../controllers/item.controller.js'
import { requireAuth } from '../middleware/auth.js'
import { apiRateLimiter } from '../middleware/rate-limit.js'
import {
  validateCreateItem,
  validateItemIdParam,
  validateUpdateItem,
} from '../middleware/validate.js'

const router = Router()

router.get('/', requireAuth, apiRateLimiter, getItems)
router.get('/deleted', requireAuth, apiRateLimiter, getDeletedItems)
router.post('/', requireAuth, apiRateLimiter, validateCreateItem, createItem)
router.patch('/:id', requireAuth, apiRateLimiter, validateItemIdParam, validateUpdateItem, updateItem)
router.patch('/:id/restore', requireAuth, apiRateLimiter, validateItemIdParam, restoreItem)
router.delete('/:id', requireAuth, apiRateLimiter, validateItemIdParam, deleteItem)
router.delete('/:id/permanent', requireAuth, apiRateLimiter, validateItemIdParam, permanentDeleteItem)

router.get('/notifications/pending', requireAuth, apiRateLimiter, getPendingNotifications)
router.post('/notifications/delivered', requireAuth, apiRateLimiter, markNotificationsDelivered)

export { router as itemRouter }
