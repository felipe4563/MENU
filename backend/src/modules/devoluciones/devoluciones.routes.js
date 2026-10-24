const { Router } = require('express');
const auth = require('../../middlewares/auth');

const router = Router();
router.use(auth);
// Task 7 agrega los endpoints (transferencias pendientes, etc.).

module.exports = router;
