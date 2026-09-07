import { Router } from 'express'
import {
  createItem,
  deleteItem,
  getItems,
  getPendingNotifications,
  markNotificationsDelivered,
  updateItem,
} from '../controllers/item.controller.js'
import { requireAuth } from '../middleware/auth.js'
import {
  validateCreateItem,
  validateItemIdParam,
  validateUpdateItem,
} from '../middleware/validate.js'

const router = Router()

router.get('/', requireAuth, getItems)
router.post('/', requireAuth, validateCreateItem, createItem)
router.patch('/:id', requireAuth, validateItemIdParam, validateUpdateItem, updateItem)
router.delete('/:id', requireAuth, validateItemIdParam, deleteItem)

router.get('/notifications/pending', requireAuth, getPendingNotifications)
router.post('/notifications/delivered', requireAuth, markNotificationsDelivered)

export { router as itemRouter }
