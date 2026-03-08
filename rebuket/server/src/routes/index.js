'use strict';

const router = require('express').Router();
const auth   = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const A = require('../controllers/auth');
const P = require('../controllers/products');
const I = require('../controllers/inquiries');

router.post('/admin/login',           A.login);
router.post('/admin/change-password', auth, A.changePassword);

router.get('/products',       P.getProducts);
router.get('/products/:id',   P.getProduct);
router.get('/cities',         P.getCities);
router.post('/products',      upload.array('photos', 15), P.createProduct);

router.post('/inquiries', I.createInquiry);

router.get('/admin/products',         auth, P.adminList);
router.get('/admin/products/:id',     auth, P.adminGet);
router.put('/admin/products/:id',     auth, upload.array('photos', 15), P.adminUpdate);
router.delete('/admin/products/:id',  auth, P.adminDelete);

router.get('/admin/inquiries',              auth, I.getInquiries);
router.patch('/admin/inquiries/:id/status', auth, I.updateInquiry);
router.get('/admin/stats',                  auth, I.getStats);

module.exports = router;