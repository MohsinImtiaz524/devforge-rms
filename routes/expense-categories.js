const express = require('express');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const expenseService = require('../src/modules/expenses/expenses.service');
const router = express.Router();

// Backward-compatible global expense-category API.
router.get('/', requireAuth, async (req, res) => {
  res.json(await expenseService.categories(req.session.user));
});

router.post('/', requireSuperAdmin, async (req, res) => {
  const category = await expenseService.createCategory(req.session.user, { name: req.body.name });
  res.status(201).json({ ok: true, id: category.id, category });
});

router.patch('/:id', requireSuperAdmin, async (req, res) => {
  const category = await expenseService.updateCategory(req.session.user, req.params.id, { name: req.body.name });
  res.json({ ok: true, category });
});

// Legacy DELETE now archives the master category; history remains intact.
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  const category = await expenseService.categoryStatus(req.session.user, req.params.id, false);
  res.json({ ok: true, category });
});

module.exports = router;