-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 07-09-2026 a las 20:01:28
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `bd_codeculinary`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `areas`
--

CREATE TABLE `areas` (
  `id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cajas`
--

CREATE TABLE `cajas` (
  `id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `modo_impresion` enum('fisica','bluetooth') NOT NULL DEFAULT 'fisica',
  `ancho_papel_bluetooth` enum('58mm','80mm') NOT NULL DEFAULT '80mm',
  `imprimir_ticket_cliente` tinyint(1) NOT NULL DEFAULT 1,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `cajas`
--

INSERT INTO `cajas` (`id`, `sucursal_id`, `nombre`, `modo_impresion`, `ancho_papel_bluetooth`, `imprimir_ticket_cliente`, `activo`, `creado_en`, `actualizado_en`) VALUES
(1, 1, 'Caja 1', 'fisica', '80mm', 1, 1, '2026-07-24 12:23:54', '2026-07-24 12:23:54');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `categorias`
--

CREATE TABLE `categorias` (
  `id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `imagen` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `clientes`
--

CREATE TABLE `clientes` (
  `id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `tipo_documento` varchar(50) NOT NULL DEFAULT 'CI',
  `numero_documento` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `fecha_nacimiento` date DEFAULT NULL,
  `puntos` int(11) NOT NULL DEFAULT 0,
  `pin_hash` varchar(255) DEFAULT NULL,
  `pin_intentos_fallidos` int(11) NOT NULL DEFAULT 0,
  `pin_bloqueado_hasta` datetime DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cliente_pin_verificaciones`
--

CREATE TABLE `cliente_pin_verificaciones` (
  `id` int(10) UNSIGNED NOT NULL,
  `cliente_id` int(10) UNSIGNED NOT NULL,
  `pin_hash` varchar(255) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `codigo_hash` varchar(255) NOT NULL,
  `intentos` int(11) NOT NULL DEFAULT 0,
  `expira_en` datetime NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `combos`
--

CREATE TABLE `combos` (
  `id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `precio` decimal(10,2) NOT NULL,
  `imagen` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `dias_semana` varchar(20) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `combo_productos`
--

CREATE TABLE `combo_productos` (
  `combo_id` int(10) UNSIGNED NOT NULL,
  `producto_id` int(10) UNSIGNED NOT NULL,
  `cantidad` int(11) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `compras`
--

CREATE TABLE `compras` (
  `id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `proveedor_id` int(10) UNSIGNED NOT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `total` decimal(10,2) NOT NULL DEFAULT 0.00,
  `notas` text DEFAULT NULL,
  `estado` enum('pendiente','recibido') NOT NULL DEFAULT 'pendiente',
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `configuraciones`
--

CREATE TABLE `configuraciones` (
  `id` int(10) UNSIGNED NOT NULL,
  `clave` varchar(100) NOT NULL,
  `valor` text DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `configuraciones`
--

INSERT INTO `configuraciones` (`id`, `clave`, `valor`, `creado_en`, `actualizado_en`) VALUES
(1, 'nombre_negocio', '', '2026-07-31 14:37:04', '2026-07-31 14:37:30'),
(2, 'direccion', '', '2026-07-31 14:37:04', '2026-07-31 14:37:30'),
(3, 'telefono', '', '2026-07-31 14:37:04', '2026-07-31 14:37:30'),
(4, 'moneda', 'Bs', '2026-07-31 14:37:04', '2026-07-31 14:37:30'),
(5, 'simbolo_moneda', 'Bs.', '2026-07-31 14:37:04', '2026-07-31 14:37:30'),
(6, 'zona_horaria', 'America/La_Paz', '2026-07-31 14:37:04', '2026-07-31 14:37:30'),
(7, 'pie_ticket', '¡Gracias por su preferencia!', '2026-07-31 14:37:04', '2026-07-31 14:37:30'),
(8, 'logo', '', '2026-07-31 14:37:04', '2026-07-31 14:37:30'),
(9, 'color_primario', '#8a0000', '2026-07-31 14:37:04', '2026-07-31 14:37:30'),
(10, 'color_secundario', '#d73382', '2026-07-31 14:37:04', '2026-07-31 14:37:30'),
(31, 'flujo_cocina', 'fisico', '2026-07-31 14:37:43', '2026-07-31 14:37:43'),
(32, 'fidelidad_activa', 'false', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(33, 'puntos_por_bs', '1', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(34, 'valor_punto_bs', '0.10', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(35, 'fidelidad_canje_efectivo', 'true', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(36, 'fidelidad_canje_qr', 'false', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(37, 'cumple_activo', 'false', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(38, 'cumple_dias_anticipacion', '5', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(39, 'cumple_tipo', 'porcentaje', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(40, 'cumple_valor', '10', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(41, 'cumple_vigencia_dias', '10', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(42, 'ruleta_activa', 'false', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(43, 'ruleta_costo_puntos', '10', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(44, 'ruleta_max_giros_periodo', '1', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(45, 'ruleta_periodo', 'dia', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(46, 'ruleta_vigencia_dias_premio', '7', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(47, 'cocina_destino', 'centralizada', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(48, 'cocina_pantalla_dedicada', 'false', '2026-09-07 17:44:45', '2026-09-07 17:44:45'),
(49, 'portada', NULL, '2026-09-08 00:00:00', '2026-09-08 00:00:00');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cupones`
--

CREATE TABLE `cupones` (
  `id` int(10) UNSIGNED NOT NULL,
  `codigo` varchar(30) NOT NULL,
  `tipo` enum('fijo','porcentaje') NOT NULL DEFAULT 'fijo',
  `valor` decimal(10,2) NOT NULL,
  `usos_maximos` int(10) UNSIGNED NOT NULL DEFAULT 1,
  `usos_actuales` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `limite_por_cliente` int(10) UNSIGNED DEFAULT NULL,
  `cliente_id` int(10) UNSIGNED DEFAULT NULL,
  `fecha_expiracion` date DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `usado_en` datetime DEFAULT NULL,
  `creado_por` int(10) UNSIGNED DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cupon_productos`
--

CREATE TABLE `cupon_productos` (
  `cupon_id` int(10) UNSIGNED NOT NULL,
  `producto_id` int(10) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `detalle_arqueo`
--

CREATE TABLE `detalle_arqueo` (
  `id` int(10) UNSIGNED NOT NULL,
  `sesion_caja_id` int(10) UNSIGNED NOT NULL,
  `denominacion` decimal(10,2) NOT NULL,
  `cantidad` int(11) NOT NULL DEFAULT 0,
  `subtotal` decimal(10,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `detalle_compras`
--

CREATE TABLE `detalle_compras` (
  `id` int(10) UNSIGNED NOT NULL,
  `compra_id` int(10) UNSIGNED NOT NULL,
  `producto_id` int(10) UNSIGNED DEFAULT NULL,
  `insumo_id` int(10) UNSIGNED DEFAULT NULL,
  `cantidad` decimal(10,3) NOT NULL,
  `costo_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `detalle_pedidos`
--

CREATE TABLE `detalle_pedidos` (
  `id` int(10) UNSIGNED NOT NULL,
  `pedido_id` int(10) UNSIGNED NOT NULL,
  `producto_id` int(10) UNSIGNED DEFAULT NULL,
  `combo_id` int(10) UNSIGNED DEFAULT NULL,
  `cantidad` int(11) NOT NULL DEFAULT 1,
  `peso` decimal(10,3) DEFAULT NULL,
  `precio` decimal(10,2) NOT NULL,
  `nota` varchar(255) DEFAULT NULL,
  `estado` enum('pendiente','preparando','servido') NOT NULL DEFAULT 'pendiente',
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `detalle_pedido_combo_opciones`
--

CREATE TABLE `detalle_pedido_combo_opciones` (
  `detalle_pedido_id` int(10) UNSIGNED NOT NULL,
  `producto_id` int(10) UNSIGNED NOT NULL,
  `opcion_id` int(10) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `detalle_pedido_opciones`
--

CREATE TABLE `detalle_pedido_opciones` (
  `detalle_pedido_id` int(10) UNSIGNED NOT NULL,
  `opcion_id` int(10) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `gastos`
--

CREATE TABLE `gastos` (
  `id` int(10) UNSIGNED NOT NULL,
  `sesion_caja_id` int(10) UNSIGNED DEFAULT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `descripcion` varchar(255) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `grupos_opciones`
--

CREATE TABLE `grupos_opciones` (
  `id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `tipo_seleccion` enum('unica','multiple') NOT NULL DEFAULT 'unica',
  `creado_en` timestamp NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `insumos`
--

CREATE TABLE `insumos` (
  `id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `unidad_medida` enum('kilogramo','gramo','litro','mililitro','arroba','libra','unidad') NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `insumo_movimientos`
--

CREATE TABLE `insumo_movimientos` (
  `id` int(10) UNSIGNED NOT NULL,
  `insumo_id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `usuario_id` int(10) UNSIGNED DEFAULT NULL,
  `tipo` enum('compra','ajuste','consumo_venta') NOT NULL,
  `cantidad` decimal(10,3) NOT NULL,
  `stock_anterior` decimal(10,3) NOT NULL,
  `stock_nuevo` decimal(10,3) NOT NULL,
  `nota` varchar(255) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `insumo_stock_sucursal`
--

CREATE TABLE `insumo_stock_sucursal` (
  `insumo_id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `stock` decimal(10,3) NOT NULL DEFAULT 0.000
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `integraciones_api_keys`
--

CREATE TABLE `integraciones_api_keys` (
  `id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `nombre_app` varchar(100) NOT NULL,
  `api_key_hash` varchar(255) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `libro_caja`
--

CREATE TABLE `libro_caja` (
  `id` int(10) UNSIGNED NOT NULL,
  `sesion_caja_id` int(10) UNSIGNED DEFAULT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `tipo` enum('ingreso','egreso') NOT NULL,
  `concepto` varchar(255) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `metodo_pago` enum('efectivo','qr','app_externa') NOT NULL DEFAULT 'efectivo',
  `referencia_id` int(10) UNSIGNED DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mesas`
--

CREATE TABLE `mesas` (
  `id` int(10) UNSIGNED NOT NULL,
  `area_id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `codigo_qr` varchar(32) DEFAULT NULL,
  `asientos` int(11) NOT NULL DEFAULT 4,
  `estado` enum('disponible','ocupada','reservada') NOT NULL DEFAULT 'disponible',
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mesa_sesiones`
--

CREATE TABLE `mesa_sesiones` (
  `id` int(10) UNSIGNED NOT NULL,
  `mesa_id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `abierta_en` datetime NOT NULL DEFAULT current_timestamp(),
  `cerrada_en` datetime DEFAULT NULL,
  `abierta_por` enum('staff','autoservicio') NOT NULL DEFAULT 'staff'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `opciones`
--

CREATE TABLE `opciones` (
  `id` int(10) UNSIGNED NOT NULL,
  `grupo_opciones_id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `precio_adicional` decimal(10,2) NOT NULL DEFAULT 0.00,
  `orden` int(11) NOT NULL DEFAULT 0,
  `creado_en` timestamp NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `pagos_qr`
--

CREATE TABLE `pagos_qr` (
  `id` int(10) UNSIGNED NOT NULL,
  `pedido_id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `order_id` varchar(25) NOT NULL,
  `tx_id` varchar(100) DEFAULT NULL,
  `estado` enum('pendiente','completado','fallido','expirado','cancelado') NOT NULL DEFAULT 'pendiente',
  `estado_previo` varchar(20) NOT NULL,
  `moneda` varchar(3) NOT NULL DEFAULT 'BOB',
  `monto_neto` decimal(10,2) NOT NULL,
  `comision` decimal(10,2) DEFAULT NULL,
  `monto_total` decimal(10,2) DEFAULT NULL,
  `qr_code` mediumtext DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `datos_webhook` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`datos_webhook`)),
  `creado_en` timestamp NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `pedidos`
--

CREATE TABLE `pedidos` (
  `id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `mesa_id` int(10) UNSIGNED DEFAULT NULL,
  `mesa_sesion_id` int(10) UNSIGNED DEFAULT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `cliente_id` int(10) UNSIGNED DEFAULT NULL,
  `sesion_caja_id` int(10) UNSIGNED DEFAULT NULL,
  `estado` enum('pendiente','listo','pendiente_pago','completado','cancelado') NOT NULL DEFAULT 'pendiente',
  `estado_cocina` enum('pendiente','listo') DEFAULT NULL,
  `tipo` enum('mesa','llevar','delivery') NOT NULL DEFAULT 'mesa',
  `origen` enum('staff','autoservicio','app_externa') NOT NULL DEFAULT 'staff',
  `origen_app` varchar(100) DEFAULT NULL,
  `numero_llevar` int(10) UNSIGNED DEFAULT NULL,
  `tipo_documento` varchar(50) NOT NULL DEFAULT 'Ticket',
  `nombre_cliente` varchar(255) NOT NULL DEFAULT 'Público General',
  `documento_cliente` varchar(50) DEFAULT NULL,
  `direccion_entrega` varchar(255) DEFAULT NULL,
  `telefono_cliente` varchar(50) DEFAULT NULL,
  `total` decimal(10,2) NOT NULL DEFAULT 0.00,
  `descuento` decimal(10,2) NOT NULL DEFAULT 0.00,
  `propina` decimal(10,2) NOT NULL DEFAULT 0.00,
  `puntos_ganados` int(11) NOT NULL DEFAULT 0,
  `puntos_canjeados` int(11) NOT NULL DEFAULT 0,
  `cupon_id` int(10) UNSIGNED DEFAULT NULL,
  `descuento_cupon` decimal(10,2) NOT NULL DEFAULT 0.00,
  `metodo_pago` enum('efectivo','qr','app_externa') NOT NULL DEFAULT 'efectivo',
  `monto_recibido` decimal(10,2) DEFAULT NULL,
  `cambio` decimal(10,2) NOT NULL DEFAULT 0.00,
  `notas` text DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `permisos`
--

CREATE TABLE `permisos` (
  `id` int(10) UNSIGNED NOT NULL,
  `modulo` varchar(50) NOT NULL,
  `accion` varchar(50) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `permisos`
--

INSERT INTO `permisos` (`id`, `modulo`, `accion`, `descripcion`) VALUES
(1, 'ventas', 'ver', 'Ver pedidos'),
(2, 'ventas', 'crear', 'Crear pedidos'),
(3, 'ventas', 'cancelar', 'Cancelar pedidos'),
(4, 'ventas', 'cobrar', 'Cobrar pedidos'),
(5, 'usuarios', 'ver', 'Ver usuarios'),
(6, 'usuarios', 'crear', 'Crear usuarios'),
(7, 'usuarios', 'editar', 'Editar usuarios'),
(8, 'inventario', 'ver', 'Ver inventario'),
(9, 'usuarios', 'eliminar', 'Eliminar usuarios'),
(10, 'inventario', 'ajustar', 'Ajustar stock'),
(11, 'inventario', 'entrada', 'Registrar entrada'),
(12, 'inventario', 'salida', 'Registrar salida'),
(13, 'caja', 'abrir', 'Abrir caja'),
(14, 'caja', 'cerrar', 'Cerrar caja'),
(15, 'caja', 'ver', 'Ver sesiones de caja'),
(16, 'libro_caja', 'ver', 'Ver libro caja'),
(17, 'libro_caja', 'crear', 'Registrar en libro caja'),
(18, 'compras', 'ver', 'Ver compras'),
(19, 'compras', 'crear', 'Crear compras'),
(20, 'compras', 'recibir', 'Marcar compra como recibida'),
(21, 'compras', 'editar', 'Editar compras'),
(22, 'proveedores', 'ver', 'Ver proveedores'),
(23, 'proveedores', 'crear', 'Crear proveedores'),
(24, 'proveedores', 'editar', 'Editar proveedores'),
(25, 'productos', 'ver', 'Ver productos'),
(26, 'productos', 'crear', 'Crear productos'),
(27, 'productos', 'editar', 'Editar productos'),
(28, 'productos', 'eliminar', 'Eliminar productos'),
(29, 'clientes', 'ver', 'Ver clientes'),
(30, 'clientes', 'crear', 'Crear clientes'),
(31, 'clientes', 'editar', 'Editar clientes'),
(32, 'configuracion', 'ver', 'Ver configuración'),
(33, 'configuracion', 'editar', 'Editar configuración'),
(34, 'roles', 'ver', 'Ver roles'),
(35, 'roles', 'crear', 'Crear roles'),
(36, 'roles', 'editar', 'Editar roles'),
(37, 'roles', 'eliminar', 'Eliminar roles'),
(38, 'reportes', 'ver', 'Ver reportes'),
(39, 'cocina', 'ver', 'Ver pantalla de cocina'),
(40, 'sucursales', 'ver', 'Ver sucursales'),
(41, 'sucursales', 'crear', 'Crear sucursales'),
(42, 'sucursales', 'editar', 'Editar sucursales'),
(43, 'sucursales', 'eliminar', 'Eliminar sucursales'),
(44, 'cajas', 'ver', 'Ver cajas'),
(45, 'cajas', 'crear', 'Crear cajas'),
(46, 'cajas', 'editar', 'Editar cajas'),
(47, 'cajas', 'eliminar', 'Eliminar cajas'),
(48, 'combos', 'ver', 'Ver combos'),
(49, 'combos', 'crear', 'Crear combos'),
(50, 'combos', 'editar', 'Editar combos'),
(51, 'combos', 'eliminar', 'Eliminar combos'),
(52, 'promociones', 'ver', 'Ver promociones'),
(53, 'promociones', 'crear', 'Crear promociones'),
(54, 'promociones', 'editar', 'Editar promociones'),
(55, 'promociones', 'eliminar', 'Eliminar promociones'),
(56, 'cupones', 'ver', 'Ver cupones'),
(57, 'cupones', 'crear', 'Crear cupones'),
(58, 'cupones', 'editar', 'Editar cupones'),
(59, 'cupones', 'eliminar', 'Eliminar cupones'),
(60, 'ruleta', 'ver', 'Ver ruleta de premios'),
(61, 'ruleta', 'girar', 'Girar la ruleta por un cliente'),
(62, 'ruleta', 'crear', 'Crear premios de la ruleta'),
(63, 'ruleta', 'editar', 'Editar premios de la ruleta'),
(64, 'ruleta', 'eliminar', 'Eliminar premios de la ruleta'),
(65, 'insumos', 'ver', 'Ver insumos'),
(66, 'insumos', 'crear', 'Crear insumos'),
(67, 'insumos', 'editar', 'Editar insumos (incluye receta y ajustes de stock)'),
(68, 'insumos', 'eliminar', 'Desactivar insumos'),
(69, 'productos', 'disponibilidad', 'Marcar productos como no disponibles hoy'),
(70, 'dashboard', 'ver', 'Ver el dashboard'),
(71, 'personal', 'administrar', 'Configurar horarios, ver y aprobar registros de asistencia de todos los empleados');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `productos`
--

CREATE TABLE `productos` (
  `id` int(10) UNSIGNED NOT NULL,
  `categoria_id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `precio` decimal(10,2) NOT NULL,
  `es_pesable` tinyint(1) NOT NULL DEFAULT 0,
  `stock` int(11) DEFAULT NULL,
  `es_vendible` tinyint(1) NOT NULL DEFAULT 1,
  `imagen` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `disponible_hoy` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `producto_grupos_opciones`
--

CREATE TABLE `producto_grupos_opciones` (
  `producto_id` int(10) UNSIGNED NOT NULL,
  `grupo_opciones_id` int(10) UNSIGNED NOT NULL,
  `orden` int(11) NOT NULL DEFAULT 0,
  `obligatorio` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `producto_stock_sucursal`
--

CREATE TABLE `producto_stock_sucursal` (
  `producto_id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `stock` int(11) NOT NULL DEFAULT 0,
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `promociones`
--

CREATE TABLE `promociones` (
  `id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(150) DEFAULT NULL,
  `tipo` enum('porcentaje','monto') NOT NULL DEFAULT 'porcentaje',
  `valor` decimal(10,2) NOT NULL,
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `dias_semana` varchar(20) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `promocion_productos`
--

CREATE TABLE `promocion_productos` (
  `promocion_id` int(10) UNSIGNED NOT NULL,
  `producto_id` int(10) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `proveedores`
--

CREATE TABLE `proveedores` (
  `id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `contacto` varchar(255) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `receta_insumos`
--

CREATE TABLE `receta_insumos` (
  `id` int(10) UNSIGNED NOT NULL,
  `producto_id` int(10) UNSIGNED NOT NULL,
  `opcion_id` int(10) UNSIGNED DEFAULT NULL,
  `insumo_id` int(10) UNSIGNED NOT NULL,
  `cantidad` decimal(10,3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `registros_inventario`
--

CREATE TABLE `registros_inventario` (
  `id` int(10) UNSIGNED NOT NULL,
  `producto_id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `tipo` enum('entrada','salida','venta','compra','ajuste') NOT NULL,
  `cantidad` int(11) NOT NULL,
  `stock_anterior` int(11) DEFAULT NULL,
  `stock_nuevo` int(11) DEFAULT NULL,
  `nota` varchar(255) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `roles`
--

CREATE TABLE `roles` (
  `id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `roles`
--

INSERT INTO `roles` (`id`, `nombre`, `descripcion`, `creado_en`, `actualizado_en`) VALUES
(1, 'Administrador', 'Acceso total al sistema', '2026-07-01 00:23:31', '2026-07-01 00:23:31'),
(2, 'Cajero', 'Ventas, caja, clientes y libro caja', '2026-07-01 00:23:31', '2026-07-01 00:23:31');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `roles_permisos`
--

CREATE TABLE `roles_permisos` (
  `rol_id` int(10) UNSIGNED NOT NULL,
  `permiso_id` int(10) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `roles_permisos`
--

INSERT INTO `roles_permisos` (`rol_id`, `permiso_id`) VALUES
(1, 1),
(1, 2),
(1, 3),
(1, 4),
(1, 5),
(1, 6),
(1, 7),
(1, 8),
(1, 9),
(1, 10),
(1, 11),
(1, 12),
(1, 13),
(1, 14),
(1, 15),
(1, 16),
(1, 17),
(1, 18),
(1, 19),
(1, 20),
(1, 21),
(1, 22),
(1, 23),
(1, 24),
(1, 25),
(1, 26),
(1, 27),
(1, 28),
(1, 29),
(1, 30),
(1, 31),
(1, 32),
(1, 33),
(1, 34),
(1, 35),
(1, 36),
(1, 37),
(1, 38),
(1, 40),
(1, 41),
(1, 42),
(1, 43),
(1, 44),
(1, 45),
(1, 46),
(1, 47),
(1, 48),
(1, 49),
(1, 50),
(1, 51),
(1, 52),
(1, 53),
(1, 54),
(1, 55),
(1, 56),
(1, 57),
(1, 58),
(1, 59),
(1, 60),
(1, 61),
(1, 62),
(1, 63),
(1, 64),
(1, 65),
(1, 66),
(1, 67),
(1, 68),
(2, 1),
(2, 2),
(2, 3),
(2, 4),
(2, 8),
(2, 13),
(2, 14),
(2, 15),
(2, 16),
(2, 17),
(2, 25),
(2, 26),
(2, 27),
(2, 28),
(2, 29),
(2, 30),
(2, 31),
(1, 69),
(2, 69),
(1, 70),
(2, 70),
(1, 71);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ruleta_giros`
--

CREATE TABLE `ruleta_giros` (
  `id` int(10) UNSIGNED NOT NULL,
  `cliente_id` int(10) UNSIGNED NOT NULL,
  `premio_id` int(10) UNSIGNED NOT NULL,
  `cupon_id` int(10) UNSIGNED DEFAULT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `puntos_gastados` int(11) NOT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ruleta_premios`
--

CREATE TABLE `ruleta_premios` (
  `id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `tipo` enum('porcentaje','fijo','producto_gratis','combo_gratis','nada') NOT NULL DEFAULT 'nada',
  `valor` decimal(10,2) DEFAULT NULL,
  `producto_id` int(10) UNSIGNED DEFAULT NULL,
  `combo_id` int(10) UNSIGNED DEFAULT NULL,
  `probabilidad` int(10) UNSIGNED NOT NULL DEFAULT 1,
  `color` varchar(20) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `orden` int(11) NOT NULL DEFAULT 0,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `sesiones_caja`
--

CREATE TABLE `sesiones_caja` (
  `id` int(10) UNSIGNED NOT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `caja_id` int(10) UNSIGNED NOT NULL,
  `monto_apertura` decimal(10,2) NOT NULL DEFAULT 0.00,
  `monto_cierre` decimal(10,2) DEFAULT NULL,
  `total_ventas` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_gastos` decimal(10,2) NOT NULL DEFAULT 0.00,
  `diferencia` decimal(10,2) DEFAULT NULL,
  `abierto_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `cerrado_en` timestamp NULL DEFAULT NULL,
  `estado` enum('abierta','cerrada') NOT NULL DEFAULT 'abierta'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `sucursales`
--

CREATE TABLE `sucursales` (
  `id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `latitud` decimal(10,7) DEFAULT NULL,
  `longitud` decimal(10,7) DEFAULT NULL,
  `radio_geocerca_metros` int(10) UNSIGNED NOT NULL DEFAULT 150,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `sucursales`
--

INSERT INTO `sucursales` (`id`, `nombre`, `direccion`, `telefono`, `latitud`, `longitud`, `radio_geocerca_metros`, `activo`, `creado_en`, `actualizado_en`) VALUES
(1, 'Ivigarzama', '', '', NULL, NULL, 150, 1, '2026-07-24 12:23:40', '2026-07-24 12:23:40');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int(10) UNSIGNED NOT NULL,
  `rol_id` int(10) UNSIGNED NOT NULL,
  `acceso_todas_sucursales` tinyint(1) NOT NULL DEFAULT 0,
  `nombre` varchar(255) NOT NULL,
  `avatar` varchar(255) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `contrasena` varchar(255) NOT NULL,
  `debe_cambiar_contrasena` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `usuarios`
--

INSERT INTO `usuarios` (`id`, `rol_id`, `acceso_todas_sucursales`, `nombre`, `avatar`, `email`, `contrasena`, `debe_cambiar_contrasena`, `activo`, `creado_en`, `actualizado_en`) VALUES
(1, 1, 1, 'Administrador', NULL, 'admin@instalacion.local', '$2b$10$dn9nFMmWEPE./bYgQzGbKOVOgOQaxdpz/DhJSostRCV6pMzSCn4/m', 0, 1, '2026-07-01 00:23:31', '2026-09-07 17:54:15');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios_sucursales`
--

CREATE TABLE `usuarios_sucursales` (
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `areas`
--
ALTER TABLE `areas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `sucursal_id` (`sucursal_id`);

--
-- Indices de la tabla `cajas`
--
ALTER TABLE `cajas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `sucursal_id` (`sucursal_id`);

--
-- Indices de la tabla `categorias`
--
ALTER TABLE `categorias`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `clientes`
--
ALTER TABLE `clientes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `clientes_doc_unique` (`numero_documento`);

--
-- Indices de la tabla `cliente_pin_verificaciones`
--
ALTER TABLE `cliente_pin_verificaciones`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `cliente_id` (`cliente_id`);

--
-- Indices de la tabla `combos`
--
ALTER TABLE `combos`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `combo_productos`
--
ALTER TABLE `combo_productos`
  ADD PRIMARY KEY (`combo_id`,`producto_id`),
  ADD KEY `producto_id` (`producto_id`);

--
-- Indices de la tabla `compras`
--
ALTER TABLE `compras`
  ADD PRIMARY KEY (`id`),
  ADD KEY `proveedor_id` (`proveedor_id`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `sucursal_id` (`sucursal_id`);

--
-- Indices de la tabla `configuraciones`
--
ALTER TABLE `configuraciones`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `configuraciones_clave_unique` (`clave`);

--
-- Indices de la tabla `cupones`
--
ALTER TABLE `cupones`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `codigo` (`codigo`),
  ADD KEY `creado_por` (`creado_por`),
  ADD KEY `cliente_id` (`cliente_id`);

--
-- Indices de la tabla `cupon_productos`
--
ALTER TABLE `cupon_productos`
  ADD PRIMARY KEY (`cupon_id`,`producto_id`),
  ADD KEY `producto_id` (`producto_id`);

--
-- Indices de la tabla `detalle_arqueo`
--
ALTER TABLE `detalle_arqueo`
  ADD PRIMARY KEY (`id`),
  ADD KEY `sesion_caja_id` (`sesion_caja_id`);

--
-- Indices de la tabla `detalle_compras`
--
ALTER TABLE `detalle_compras`
  ADD PRIMARY KEY (`id`),
  ADD KEY `compra_id` (`compra_id`),
  ADD KEY `producto_id` (`producto_id`),
  ADD KEY `insumo_id` (`insumo_id`);

--
-- Indices de la tabla `detalle_pedidos`
--
ALTER TABLE `detalle_pedidos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `pedido_id` (`pedido_id`),
  ADD KEY `producto_id` (`producto_id`),
  ADD KEY `combo_id` (`combo_id`);

--
-- Indices de la tabla `detalle_pedido_combo_opciones`
--
ALTER TABLE `detalle_pedido_combo_opciones`
  ADD PRIMARY KEY (`detalle_pedido_id`,`producto_id`,`opcion_id`),
  ADD KEY `producto_id` (`producto_id`),
  ADD KEY `opcion_id` (`opcion_id`);

--
-- Indices de la tabla `detalle_pedido_opciones`
--
ALTER TABLE `detalle_pedido_opciones`
  ADD PRIMARY KEY (`detalle_pedido_id`,`opcion_id`),
  ADD KEY `opcion_id` (`opcion_id`);

--
-- Indices de la tabla `gastos`
--
ALTER TABLE `gastos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `sesion_caja_id` (`sesion_caja_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `grupos_opciones`
--
ALTER TABLE `grupos_opciones`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `insumos`
--
ALTER TABLE `insumos`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `insumo_movimientos`
--
ALTER TABLE `insumo_movimientos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `insumo_id` (`insumo_id`),
  ADD KEY `sucursal_id` (`sucursal_id`);

--
-- Indices de la tabla `insumo_stock_sucursal`
--
ALTER TABLE `insumo_stock_sucursal`
  ADD PRIMARY KEY (`insumo_id`,`sucursal_id`),
  ADD KEY `sucursal_id` (`sucursal_id`);

--
-- Indices de la tabla `integraciones_api_keys`
--
ALTER TABLE `integraciones_api_keys`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `api_key_hash` (`api_key_hash`),
  ADD KEY `sucursal_id` (`sucursal_id`);

--
-- Indices de la tabla `libro_caja`
--
ALTER TABLE `libro_caja`
  ADD PRIMARY KEY (`id`),
  ADD KEY `sesion_caja_id` (`sesion_caja_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `mesas`
--
ALTER TABLE `mesas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `codigo_qr` (`codigo_qr`),
  ADD KEY `area_id` (`area_id`);

--
-- Indices de la tabla `mesa_sesiones`
--
ALTER TABLE `mesa_sesiones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `mesa_activa` (`mesa_id`,`cerrada_en`),
  ADD KEY `sucursal_id` (`sucursal_id`);

--
-- Indices de la tabla `opciones`
--
ALTER TABLE `opciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `grupo_opciones_id` (`grupo_opciones_id`);

--
-- Indices de la tabla `pagos_qr`
--
ALTER TABLE `pagos_qr`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `order_id` (`order_id`),
  ADD KEY `pedido_id` (`pedido_id`),
  ADD KEY `sucursal_id` (`sucursal_id`);

--
-- Indices de la tabla `pedidos`
--
ALTER TABLE `pedidos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `mesa_id` (`mesa_id`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `cliente_id` (`cliente_id`),
  ADD KEY `sesion_caja_id` (`sesion_caja_id`),
  ADD KEY `sucursal_id` (`sucursal_id`),
  ADD KEY `cupon_id` (`cupon_id`),
  ADD KEY `pedidos_ibfk_6` (`mesa_sesion_id`);

--
-- Indices de la tabla `permisos`
--
ALTER TABLE `permisos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `permiso_unico` (`modulo`,`accion`);

--
-- Indices de la tabla `productos`
--
ALTER TABLE `productos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `categoria_id` (`categoria_id`);

--
-- Indices de la tabla `producto_grupos_opciones`
--
ALTER TABLE `producto_grupos_opciones`
  ADD PRIMARY KEY (`producto_id`,`grupo_opciones_id`),
  ADD KEY `grupo_opciones_id` (`grupo_opciones_id`);

--
-- Indices de la tabla `producto_stock_sucursal`
--
ALTER TABLE `producto_stock_sucursal`
  ADD PRIMARY KEY (`producto_id`,`sucursal_id`),
  ADD KEY `sucursal_id` (`sucursal_id`);

--
-- Indices de la tabla `promociones`
--
ALTER TABLE `promociones`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `promocion_productos`
--
ALTER TABLE `promocion_productos`
  ADD PRIMARY KEY (`promocion_id`,`producto_id`),
  ADD KEY `producto_id` (`producto_id`);

--
-- Indices de la tabla `proveedores`
--
ALTER TABLE `proveedores`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `receta_insumos`
--
ALTER TABLE `receta_insumos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `producto_id` (`producto_id`),
  ADD KEY `opcion_id` (`opcion_id`),
  ADD KEY `insumo_id` (`insumo_id`);

--
-- Indices de la tabla `registros_inventario`
--
ALTER TABLE `registros_inventario`
  ADD PRIMARY KEY (`id`),
  ADD KEY `producto_id` (`producto_id`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `sucursal_id` (`sucursal_id`);

--
-- Indices de la tabla `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `roles_permisos`
--
ALTER TABLE `roles_permisos`
  ADD PRIMARY KEY (`rol_id`,`permiso_id`),
  ADD KEY `permiso_id` (`permiso_id`);

--
-- Indices de la tabla `ruleta_giros`
--
ALTER TABLE `ruleta_giros`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cliente_id` (`cliente_id`),
  ADD KEY `premio_id` (`premio_id`),
  ADD KEY `cupon_id` (`cupon_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `ruleta_premios`
--
ALTER TABLE `ruleta_premios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `producto_id` (`producto_id`),
  ADD KEY `combo_id` (`combo_id`);

--
-- Indices de la tabla `sesiones_caja`
--
ALTER TABLE `sesiones_caja`
  ADD PRIMARY KEY (`id`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `sucursal_id` (`sucursal_id`),
  ADD KEY `caja_id` (`caja_id`);

--
-- Indices de la tabla `sucursales`
--
ALTER TABLE `sucursales`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `usuarios_email_unique` (`email`),
  ADD KEY `rol_id` (`rol_id`);

--
-- Indices de la tabla `usuarios_sucursales`
--
ALTER TABLE `usuarios_sucursales`
  ADD PRIMARY KEY (`usuario_id`,`sucursal_id`),
  ADD KEY `sucursal_id` (`sucursal_id`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `areas`
--
ALTER TABLE `areas`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cajas`
--
ALTER TABLE `cajas`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT de la tabla `categorias`
--
ALTER TABLE `categorias`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `clientes`
--
ALTER TABLE `clientes`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cliente_pin_verificaciones`
--
ALTER TABLE `cliente_pin_verificaciones`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `combos`
--
ALTER TABLE `combos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `compras`
--
ALTER TABLE `compras`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `configuraciones`
--
ALTER TABLE `configuraciones`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=49;

--
-- AUTO_INCREMENT de la tabla `cupones`
--
ALTER TABLE `cupones`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `detalle_arqueo`
--
ALTER TABLE `detalle_arqueo`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `detalle_compras`
--
ALTER TABLE `detalle_compras`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `detalle_pedidos`
--
ALTER TABLE `detalle_pedidos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `gastos`
--
ALTER TABLE `gastos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `grupos_opciones`
--
ALTER TABLE `grupos_opciones`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `insumos`
--
ALTER TABLE `insumos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `insumo_movimientos`
--
ALTER TABLE `insumo_movimientos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `integraciones_api_keys`
--
ALTER TABLE `integraciones_api_keys`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `libro_caja`
--
ALTER TABLE `libro_caja`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `mesas`
--
ALTER TABLE `mesas`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `mesa_sesiones`
--
ALTER TABLE `mesa_sesiones`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `opciones`
--
ALTER TABLE `opciones`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `pagos_qr`
--
ALTER TABLE `pagos_qr`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `pedidos`
--
ALTER TABLE `pedidos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `permisos`
--
ALTER TABLE `permisos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=72;

--
-- AUTO_INCREMENT de la tabla `productos`
--
ALTER TABLE `productos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `promociones`
--
ALTER TABLE `promociones`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `proveedores`
--
ALTER TABLE `proveedores`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `receta_insumos`
--
ALTER TABLE `receta_insumos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `registros_inventario`
--
ALTER TABLE `registros_inventario`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `roles`
--
ALTER TABLE `roles`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de la tabla `ruleta_giros`
--
ALTER TABLE `ruleta_giros`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `ruleta_premios`
--
ALTER TABLE `ruleta_premios`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `sesiones_caja`
--
ALTER TABLE `sesiones_caja`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `sucursales`
--
ALTER TABLE `sucursales`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `areas`
--
ALTER TABLE `areas`
  ADD CONSTRAINT `areas_ibfk_1` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`);

--
-- Filtros para la tabla `cajas`
--
ALTER TABLE `cajas`
  ADD CONSTRAINT `cajas_ibfk_1` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`);

--
-- Filtros para la tabla `cliente_pin_verificaciones`
--
ALTER TABLE `cliente_pin_verificaciones`
  ADD CONSTRAINT `cliente_pin_verificaciones_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `combo_productos`
--
ALTER TABLE `combo_productos`
  ADD CONSTRAINT `combo_productos_ibfk_1` FOREIGN KEY (`combo_id`) REFERENCES `combos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `combo_productos_ibfk_2` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`);

--
-- Filtros para la tabla `compras`
--
ALTER TABLE `compras`
  ADD CONSTRAINT `compras_ibfk_1` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`id`),
  ADD CONSTRAINT `compras_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  ADD CONSTRAINT `compras_ibfk_3` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`);

--
-- Filtros para la tabla `cupones`
--
ALTER TABLE `cupones`
  ADD CONSTRAINT `cupones_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`),
  ADD CONSTRAINT `cupones_ibfk_1` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`);

--
-- Filtros para la tabla `cupon_productos`
--
ALTER TABLE `cupon_productos`
  ADD CONSTRAINT `cupon_productos_cupon_fk` FOREIGN KEY (`cupon_id`) REFERENCES `cupones` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `cupon_productos_producto_fk` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`);

--
-- Filtros para la tabla `detalle_arqueo`
--
ALTER TABLE `detalle_arqueo`
  ADD CONSTRAINT `detalle_arqueo_ibfk_1` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `detalle_compras`
--
ALTER TABLE `detalle_compras`
  ADD CONSTRAINT `detalle_compras_ibfk_1` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `detalle_compras_ibfk_2` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`),
  ADD CONSTRAINT `detalle_compras_ibfk_3` FOREIGN KEY (`insumo_id`) REFERENCES `insumos` (`id`);

--
-- Filtros para la tabla `detalle_pedidos`
--
ALTER TABLE `detalle_pedidos`
  ADD CONSTRAINT `detalle_pedidos_combo_fk` FOREIGN KEY (`combo_id`) REFERENCES `combos` (`id`),
  ADD CONSTRAINT `detalle_pedidos_ibfk_1` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `detalle_pedidos_ibfk_2` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`);

--
-- Filtros para la tabla `detalle_pedido_combo_opciones`
--
ALTER TABLE `detalle_pedido_combo_opciones`
  ADD CONSTRAINT `detalle_pedido_combo_opciones_ibfk_1` FOREIGN KEY (`detalle_pedido_id`) REFERENCES `detalle_pedidos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `detalle_pedido_combo_opciones_ibfk_2` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`),
  ADD CONSTRAINT `detalle_pedido_combo_opciones_ibfk_3` FOREIGN KEY (`opcion_id`) REFERENCES `opciones` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `detalle_pedido_opciones`
--
ALTER TABLE `detalle_pedido_opciones`
  ADD CONSTRAINT `detalle_pedido_opciones_ibfk_1` FOREIGN KEY (`detalle_pedido_id`) REFERENCES `detalle_pedidos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `detalle_pedido_opciones_ibfk_2` FOREIGN KEY (`opcion_id`) REFERENCES `opciones` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `gastos`
--
ALTER TABLE `gastos`
  ADD CONSTRAINT `gastos_ibfk_1` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `gastos_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Filtros para la tabla `insumo_movimientos`
--
ALTER TABLE `insumo_movimientos`
  ADD CONSTRAINT `insumo_movimientos_ibfk_1` FOREIGN KEY (`insumo_id`) REFERENCES `insumos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `insumo_movimientos_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `insumo_stock_sucursal`
--
ALTER TABLE `insumo_stock_sucursal`
  ADD CONSTRAINT `insumo_stock_sucursal_ibfk_1` FOREIGN KEY (`insumo_id`) REFERENCES `insumos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `insumo_stock_sucursal_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `integraciones_api_keys`
--
ALTER TABLE `integraciones_api_keys`
  ADD CONSTRAINT `integraciones_api_keys_ibfk_1` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `libro_caja`
--
ALTER TABLE `libro_caja`
  ADD CONSTRAINT `libro_caja_ibfk_1` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `libro_caja_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Filtros para la tabla `mesas`
--
ALTER TABLE `mesas`
  ADD CONSTRAINT `mesas_ibfk_1` FOREIGN KEY (`area_id`) REFERENCES `areas` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `mesa_sesiones`
--
ALTER TABLE `mesa_sesiones`
  ADD CONSTRAINT `mesa_sesiones_ibfk_1` FOREIGN KEY (`mesa_id`) REFERENCES `mesas` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `mesa_sesiones_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `opciones`
--
ALTER TABLE `opciones`
  ADD CONSTRAINT `opciones_ibfk_1` FOREIGN KEY (`grupo_opciones_id`) REFERENCES `grupos_opciones` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `pagos_qr`
--
ALTER TABLE `pagos_qr`
  ADD CONSTRAINT `pagos_qr_ibfk_1` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`),
  ADD CONSTRAINT `pagos_qr_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`);

--
-- Filtros para la tabla `pedidos`
--
ALTER TABLE `pedidos`
  ADD CONSTRAINT `pedidos_cupon_fk` FOREIGN KEY (`cupon_id`) REFERENCES `cupones` (`id`),
  ADD CONSTRAINT `pedidos_ibfk_1` FOREIGN KEY (`mesa_id`) REFERENCES `mesas` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `pedidos_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  ADD CONSTRAINT `pedidos_ibfk_3` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `pedidos_ibfk_4` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `pedidos_ibfk_5` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`),
  ADD CONSTRAINT `pedidos_ibfk_6` FOREIGN KEY (`mesa_sesion_id`) REFERENCES `mesa_sesiones` (`id`);

--
-- Filtros para la tabla `productos`
--
ALTER TABLE `productos`
  ADD CONSTRAINT `productos_ibfk_1` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `producto_grupos_opciones`
--
ALTER TABLE `producto_grupos_opciones`
  ADD CONSTRAINT `producto_grupos_opciones_ibfk_1` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `producto_grupos_opciones_ibfk_2` FOREIGN KEY (`grupo_opciones_id`) REFERENCES `grupos_opciones` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `producto_stock_sucursal`
--
ALTER TABLE `producto_stock_sucursal`
  ADD CONSTRAINT `producto_stock_sucursal_ibfk_1` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `producto_stock_sucursal_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `promocion_productos`
--
ALTER TABLE `promocion_productos`
  ADD CONSTRAINT `promocion_productos_producto_fk` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`),
  ADD CONSTRAINT `promocion_productos_promocion_fk` FOREIGN KEY (`promocion_id`) REFERENCES `promociones` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `receta_insumos`
--
ALTER TABLE `receta_insumos`
  ADD CONSTRAINT `receta_insumos_ibfk_1` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `receta_insumos_ibfk_2` FOREIGN KEY (`opcion_id`) REFERENCES `opciones` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `receta_insumos_ibfk_3` FOREIGN KEY (`insumo_id`) REFERENCES `insumos` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `registros_inventario`
--
ALTER TABLE `registros_inventario`
  ADD CONSTRAINT `registros_inventario_ibfk_1` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `registros_inventario_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  ADD CONSTRAINT `registros_inventario_ibfk_3` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`);

--
-- Filtros para la tabla `roles_permisos`
--
ALTER TABLE `roles_permisos`
  ADD CONSTRAINT `roles_permisos_ibfk_1` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `roles_permisos_ibfk_2` FOREIGN KEY (`permiso_id`) REFERENCES `permisos` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `ruleta_giros`
--
ALTER TABLE `ruleta_giros`
  ADD CONSTRAINT `ruleta_giros_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`),
  ADD CONSTRAINT `ruleta_giros_cupon_fk` FOREIGN KEY (`cupon_id`) REFERENCES `cupones` (`id`),
  ADD CONSTRAINT `ruleta_giros_premio_fk` FOREIGN KEY (`premio_id`) REFERENCES `ruleta_premios` (`id`),
  ADD CONSTRAINT `ruleta_giros_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Filtros para la tabla `ruleta_premios`
--
ALTER TABLE `ruleta_premios`
  ADD CONSTRAINT `ruleta_premios_combo_fk` FOREIGN KEY (`combo_id`) REFERENCES `combos` (`id`),
  ADD CONSTRAINT `ruleta_premios_producto_fk` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`);

--
-- Filtros para la tabla `sesiones_caja`
--
ALTER TABLE `sesiones_caja`
  ADD CONSTRAINT `sesiones_caja_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  ADD CONSTRAINT `sesiones_caja_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`),
  ADD CONSTRAINT `sesiones_caja_ibfk_3` FOREIGN KEY (`caja_id`) REFERENCES `cajas` (`id`);

--
-- Filtros para la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD CONSTRAINT `usuarios_ibfk_1` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`);

--
-- Filtros para la tabla `usuarios_sucursales`
--
ALTER TABLE `usuarios_sucursales`
  ADD CONSTRAINT `usuarios_sucursales_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `usuarios_sucursales_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`) ON DELETE CASCADE;

--
-- Estructura para las tablas de Control de Personal (agregadas a mano,
-- con restricciones en línea en vez de seguir el estilo de secciones
-- separadas del resto de este volcado — ver migración 051)
--

CREATE TABLE `horarios_personal` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `dia_semana` tinyint(3) UNSIGNED NOT NULL,
  `trabaja` tinyint(1) NOT NULL DEFAULT 1,
  `hora_entrada` time DEFAULT NULL,
  `hora_salida` time DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  UNIQUE KEY `horario_usuario_dia` (`usuario_id`,`dia_semana`),
  CONSTRAINT `horarios_personal_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `marcaciones_personal` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `sucursal_id` int(10) UNSIGNED NOT NULL,
  `fecha` date NOT NULL,
  `hora_entrada` datetime NOT NULL,
  `lat_entrada` decimal(10,7) DEFAULT NULL,
  `lng_entrada` decimal(10,7) DEFAULT NULL,
  `verificacion_entrada` enum('ok','fuera_de_rango','sin_verificar') NOT NULL DEFAULT 'sin_verificar',
  `hora_salida` datetime DEFAULT NULL,
  `lat_salida` decimal(10,7) DEFAULT NULL,
  `lng_salida` decimal(10,7) DEFAULT NULL,
  `verificacion_salida` enum('ok','fuera_de_rango','sin_verificar') DEFAULT NULL,
  `estado` enum('abierto','cerrado','cierre_automatico') NOT NULL DEFAULT 'abierto',
  `hora_salida_propuesta` datetime DEFAULT NULL,
  `nota_propuesta` varchar(255) DEFAULT NULL,
  `aprobado_por` int(10) UNSIGNED DEFAULT NULL,
  `aprobado_en` datetime DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  CONSTRAINT `marcaciones_personal_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `marcaciones_personal_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`),
  CONSTRAINT `marcaciones_personal_ibfk_3` FOREIGN KEY (`aprobado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Control de migraciones (ver backend/database/migrar.js). Este volcado ya
-- incluye el esquema hasta la 051; las siguientes las aplica el backend al
-- arrancar. Al regenerar el volcado, actualizar esta lista.
--

CREATE TABLE `migraciones` (
  `nombre` varchar(150) NOT NULL PRIMARY KEY,
  `aplicada_en` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `migraciones` (`nombre`) VALUES
('001_roles_permisos'),
('002_usuarios'),
('003_areas_mesas'),
('004_categorias_productos'),
('005_clientes'),
('006_sesiones_caja'),
('007_pedidos'),
('008_inventario'),
('009_compras'),
('010_caja_libro'),
('011_reservaciones_config'),
('012_sucursales'),
('013_sucursal_operativa'),
('014_cajas'),
('015_pagos_qr'),
('016_produccion_sucursal_shinahota'),
('017_opciones_producto'),
('018_productos_pesables'),
('019_opciones_multipaso'),
('020_debe_cambiar_contrasena'),
('021_avatar_usuario'),
('022_precio_opciones'),
('023_combos_promociones'),
('024_fidelidad'),
('025_cupones'),
('026_fidelidad_canje_metodos'),
('027_cupones_multiuso'),
('028_cumpleanos'),
('029_productos_quitar_campos_no_usados'),
('030_ruleta_premios'),
('031_ruleta_premios_producto_combo'),
('032_cupon_productos'),
('033_promocion_productos'),
('034_ruleta_premios_probabilidad'),
('035_impresion_movil'),
('036_ancho_papel_bluetooth'),
('037_insumos_recetas'),
('038_autoservicio_qr'),
('039_clientes_pin'),
('040_recuperar_pin'),
('041_impresion_dedicada'),
('042_ticket_cliente_por_caja'),
('043_opciones_combo'),
('044_integracion_pedidos_externos'),
('045_libro_caja_metodo_pago_app_externa'),
('046_sucursal_ubicacion_negocio_portada'),
('047_disponibilidad_diaria_productos'),
('048_estado_cocina_independiente'),
('049_estado_cocina_backfill_pedidos_abiertos'),
('050_permiso_dashboard'),
('051_control_personal');

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
