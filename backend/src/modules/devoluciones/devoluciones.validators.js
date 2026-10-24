const { body } = require('express-validator');

const MOTIVOS = ['demora', 'error_pedido', 'cliente_arrepentido', 'producto_mal_estado', 'otro'];
const FORMAS = ['efectivo', 'transferencia', 'app'];

const validarAnular = [
  body('items').isArray({ min: 1 }).withMessage('items es requerido y no puede estar vacío'),
  body('items.*.detalle_pedido_id').isInt({ min: 1 }).withMessage('detalle_pedido_id inválido'),
  body('items.*.cantidad').isInt({ min: 1 }).withMessage('La cantidad debe ser un entero mayor a 0'),
  body('items.*.vuelve_stock').optional().isBoolean().withMessage('vuelve_stock debe ser booleano'),
  body('motivo').isIn(MOTIVOS).withMessage('Motivo inválido o ausente'),
  body('nota').optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage('La nota admite hasta 255 caracteres'),
  body('nota').if(body('motivo').equals('otro')).trim().notEmpty().withMessage('La nota es obligatoria cuando el motivo es "otro"'),
  body('forma').optional({ nullable: true }).isIn(FORMAS).withMessage('Forma de devolución inválida'),
];

module.exports = { validarAnular };
