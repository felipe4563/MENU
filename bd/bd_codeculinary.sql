-- Base inicial de un restaurante nuevo (docker-entrypoint-initdb.d).
-- Esquema completo con todas las migraciones aplicadas (ver tabla
-- `migraciones`) y solo los datos base: permisos, roles Administrador y
-- Cajero, configuración por defecto, categorías del flujo de caja, una
-- sucursal y una caja. Sin clientes, productos ni ventas.
--
-- El admin viene como admin@instalacion.local: al primer arranque el backend
-- (database/preparar.js) le pone ADMIN_EMAIL / ADMIN_PASSWORD del .env de la
-- instancia y el nombre NOMBRE_NEGOCIO a la sucursal y al negocio.
--
-- Cómo regenerarlo después de agregar migraciones: importar este archivo en
-- una base vacía, correr `node database/preparar.js` contra ella (sin
-- ADMIN_EMAIL) y volcarla con mysqldump --skip-comments --skip-dump-date.


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `areas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `areas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sucursal_id` int(10) unsigned NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `sucursal_id` (`sucursal_id`),
  CONSTRAINT `areas_ibfk_1` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `areas` WRITE;
/*!40000 ALTER TABLE `areas` DISABLE KEYS */;
/*!40000 ALTER TABLE `areas` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `ausencias_personal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ausencias_personal` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `fecha` date NOT NULL,
  `motivo` varchar(120) DEFAULT NULL,
  `registrado_por` int(10) unsigned DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ausencia_usuario_fecha` (`usuario_id`,`fecha`),
  CONSTRAINT `fk_ausencia_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `ausencias_personal` WRITE;
/*!40000 ALTER TABLE `ausencias_personal` DISABLE KEYS */;
/*!40000 ALTER TABLE `ausencias_personal` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `cajas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cajas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sucursal_id` int(10) unsigned NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `modo_impresion` enum('fisica','bluetooth') NOT NULL DEFAULT 'fisica',
  `ancho_papel_bluetooth` enum('58mm','80mm') NOT NULL DEFAULT '80mm',
  `conexion_bluetooth` enum('directo','rawbt') NOT NULL DEFAULT 'directo',
  `imprimir_logo` tinyint(1) NOT NULL DEFAULT 1,
  `imprimir_ticket_cliente` tinyint(1) NOT NULL DEFAULT 1,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `sucursal_id` (`sucursal_id`),
  CONSTRAINT `cajas_ibfk_1` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `cajas` WRITE;
/*!40000 ALTER TABLE `cajas` DISABLE KEYS */;
INSERT INTO `cajas` VALUES (1,1,'Caja 1','fisica','80mm','rawbt',1,1,1,'2026-07-24 12:23:54','2026-07-24 12:23:54');
/*!40000 ALTER TABLE `cajas` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `categorias`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `categorias` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) NOT NULL,
  `imagen` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `categorias` WRITE;
/*!40000 ALTER TABLE `categorias` DISABLE KEYS */;
/*!40000 ALTER TABLE `categorias` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `categorias_flujo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `categorias_flujo` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `clave` varchar(40) NOT NULL,
  `nombre` varchar(60) NOT NULL,
  `grupo` varchar(20) NOT NULL,
  `ayuda` varchar(120) DEFAULT NULL,
  `pide_persona` tinyint(1) NOT NULL DEFAULT 0,
  `auto` tinyint(1) NOT NULL DEFAULT 0,
  `sistema` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `orden` int(11) NOT NULL DEFAULT 0,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categorias_flujo_clave` (`clave`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `categorias_flujo` WRITE;
/*!40000 ALTER TABLE `categorias_flujo` DISABLE KEYS */;
INSERT INTO `categorias_flujo` VALUES (1,'ventas','Ventas','ingresos',NULL,0,1,1,1,10,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(2,'inyeccion','Inyección de efectivo','ingresos','Plata que pone el dueño o un préstamo',0,0,0,1,20,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(3,'otro_ingreso','Otros ingresos','ingresos',NULL,0,0,1,1,900,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(4,'compras','Compras de insumos y bebidas','costo_variable',NULL,0,1,1,1,10,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(5,'materia_prima','Compras al paso (sin registrar en Compras)','costo_variable','Mercado, sin pasar por Inventario › Compras',0,0,0,1,20,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(6,'sueldos','Sueldos y mano de obra','costo_fijo','En el detalle va el nombre de la persona',1,0,1,1,10,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(7,'bonos','Bonos y extras','costo_fijo',NULL,1,0,0,1,20,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(8,'luz','Electricidad','costo_fijo',NULL,0,0,0,1,30,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(9,'gas','Gas','costo_fijo',NULL,0,0,0,1,40,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(10,'agua','Agua','costo_fijo',NULL,0,0,0,1,50,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(11,'internet','Internet y teléfono','costo_fijo',NULL,0,0,0,1,60,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(12,'alquiler','Alquiler','costo_fijo',NULL,0,0,0,1,70,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(13,'emergencia','Emergencias','costo_fijo',NULL,0,0,0,1,80,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(14,'gastos_caja','Gastos de caja','otros_gastos',NULL,0,1,1,1,10,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(15,'limpieza','Limpieza y desechables','otros_gastos',NULL,0,0,0,1,20,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(16,'combustible','Combustible','otros_gastos',NULL,0,0,0,1,30,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(17,'mantenimiento','Mantenimiento','otros_gastos',NULL,0,0,0,1,40,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(18,'pasanaku','Pasanaku','otros_gastos',NULL,0,0,0,1,50,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(19,'banco','Banco y comisiones','otros_gastos',NULL,0,0,0,1,60,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(20,'viveres','Víveres de casa','otros_gastos',NULL,0,0,0,1,70,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(21,'devoluciones','Devoluciones a clientes','otros_gastos',NULL,0,1,1,1,80,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(22,'otro_gasto','Otros gastos','otros_gastos',NULL,0,0,1,1,900,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(23,'asociacion','Gastos de asociación','no_operativo',NULL,0,0,0,1,10,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(24,'retiro','Retiro y uso familiar','no_operativo',NULL,0,0,0,1,20,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(25,'traspaso','Traspaso','traspaso',NULL,0,0,1,1,10,'2026-11-16 12:50:49','2026-11-16 12:50:49'),(26,'ajuste','Saldo inicial o ajuste','ajuste','Para cargar con cuánto se empieza o corregir una diferencia',0,0,1,1,10,'2026-11-16 12:50:49','2026-11-16 12:50:49');
/*!40000 ALTER TABLE `categorias_flujo` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `cliente_pin_verificaciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cliente_pin_verificaciones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `cliente_id` int(10) unsigned NOT NULL,
  `pin_hash` varchar(255) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `codigo_hash` varchar(255) NOT NULL,
  `intentos` int(11) NOT NULL DEFAULT 0,
  `expira_en` datetime NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cliente_id` (`cliente_id`),
  CONSTRAINT `cliente_pin_verificaciones_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `cliente_pin_verificaciones` WRITE;
/*!40000 ALTER TABLE `cliente_pin_verificaciones` DISABLE KEYS */;
/*!40000 ALTER TABLE `cliente_pin_verificaciones` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `clientes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `clientes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
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
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `clientes_doc_unique` (`numero_documento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `clientes` WRITE;
/*!40000 ALTER TABLE `clientes` DISABLE KEYS */;
/*!40000 ALTER TABLE `clientes` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `cocina_tiempos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cocina_tiempos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `pedido_id` int(10) unsigned NOT NULL,
  `sucursal_id` int(10) unsigned NOT NULL,
  `desde` datetime NOT NULL,
  `listo_en` datetime NOT NULL,
  `segundos` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cocina_tiempos_sucursal_listo` (`sucursal_id`,`listo_en`),
  KEY `fk_cocina_tiempos_pedido` (`pedido_id`),
  CONSTRAINT `fk_cocina_tiempos_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `cocina_tiempos` WRITE;
/*!40000 ALTER TABLE `cocina_tiempos` DISABLE KEYS */;
/*!40000 ALTER TABLE `cocina_tiempos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `combo_productos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `combo_productos` (
  `combo_id` int(10) unsigned NOT NULL,
  `producto_id` int(10) unsigned NOT NULL,
  `cantidad` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`combo_id`,`producto_id`),
  KEY `producto_id` (`producto_id`),
  CONSTRAINT `combo_productos_ibfk_1` FOREIGN KEY (`combo_id`) REFERENCES `combos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `combo_productos_ibfk_2` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `combo_productos` WRITE;
/*!40000 ALTER TABLE `combo_productos` DISABLE KEYS */;
/*!40000 ALTER TABLE `combo_productos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `combos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `combos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(150) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `precio` decimal(10,2) NOT NULL,
  `imagen` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `dias_semana` varchar(20) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `combos` WRITE;
/*!40000 ALTER TABLE `combos` DISABLE KEYS */;
/*!40000 ALTER TABLE `combos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `compras`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `compras` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sucursal_id` int(10) unsigned NOT NULL,
  `proveedor_id` int(10) unsigned DEFAULT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `sesion_caja_id` int(10) unsigned DEFAULT NULL,
  `total` decimal(10,2) NOT NULL DEFAULT 0.00,
  `notas` text DEFAULT NULL,
  `estado` enum('pendiente','recibido') NOT NULL DEFAULT 'pendiente',
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `proveedor_id` (`proveedor_id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `sucursal_id` (`sucursal_id`),
  KEY `compras_sesion_caja_fk` (`sesion_caja_id`),
  CONSTRAINT `compras_ibfk_1` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`id`),
  CONSTRAINT `compras_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `compras_ibfk_3` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`),
  CONSTRAINT `compras_sesion_caja_fk` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `compras` WRITE;
/*!40000 ALTER TABLE `compras` DISABLE KEYS */;
/*!40000 ALTER TABLE `compras` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `configuraciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `configuraciones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `clave` varchar(100) NOT NULL,
  `valor` text DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `configuraciones_clave_unique` (`clave`)
) ENGINE=InnoDB AUTO_INCREMENT=59 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `configuraciones` WRITE;
/*!40000 ALTER TABLE `configuraciones` DISABLE KEYS */;
INSERT INTO `configuraciones` VALUES (1,'nombre_negocio','','2026-07-31 14:37:04','2026-07-31 14:37:30'),(2,'direccion','','2026-07-31 14:37:04','2026-07-31 14:37:30'),(3,'telefono','','2026-07-31 14:37:04','2026-07-31 14:37:30'),(4,'moneda','Bs','2026-07-31 14:37:04','2026-07-31 14:37:30'),(5,'simbolo_moneda','Bs.','2026-07-31 14:37:04','2026-07-31 14:37:30'),(6,'zona_horaria','America/La_Paz','2026-07-31 14:37:04','2026-07-31 14:37:30'),(7,'pie_ticket','¡Gracias por su preferencia!','2026-07-31 14:37:04','2026-07-31 14:37:30'),(8,'logo','','2026-07-31 14:37:04','2026-07-31 14:37:30'),(9,'color_primario','#8a0000','2026-07-31 14:37:04','2026-07-31 14:37:30'),(10,'color_secundario','#d73382','2026-07-31 14:37:04','2026-07-31 14:37:30'),(31,'flujo_cocina','fisico','2026-07-31 14:37:43','2026-07-31 14:37:43'),(32,'fidelidad_activa','false','2026-09-07 17:44:45','2026-09-07 17:44:45'),(33,'puntos_por_bs','1','2026-09-07 17:44:45','2026-09-07 17:44:45'),(34,'valor_punto_bs','0.10','2026-09-07 17:44:45','2026-09-07 17:44:45'),(35,'fidelidad_canje_efectivo','true','2026-09-07 17:44:45','2026-09-07 17:44:45'),(36,'fidelidad_canje_qr','false','2026-09-07 17:44:45','2026-09-07 17:44:45'),(37,'cumple_activo','false','2026-09-07 17:44:45','2026-09-07 17:44:45'),(38,'cumple_dias_anticipacion','5','2026-09-07 17:44:45','2026-09-07 17:44:45'),(39,'cumple_tipo','porcentaje','2026-09-07 17:44:45','2026-09-07 17:44:45'),(40,'cumple_valor','10','2026-09-07 17:44:45','2026-09-07 17:44:45'),(41,'cumple_vigencia_dias','10','2026-09-07 17:44:45','2026-09-07 17:44:45'),(42,'ruleta_activa','false','2026-09-07 17:44:45','2026-09-07 17:44:45'),(43,'ruleta_costo_puntos','10','2026-09-07 17:44:45','2026-09-07 17:44:45'),(44,'ruleta_max_giros_periodo','1','2026-09-07 17:44:45','2026-09-07 17:44:45'),(45,'ruleta_periodo','dia','2026-09-07 17:44:45','2026-09-07 17:44:45'),(46,'ruleta_vigencia_dias_premio','7','2026-09-07 17:44:45','2026-09-07 17:44:45'),(47,'cocina_destino','centralizada','2026-09-07 17:44:45','2026-09-07 17:44:45'),(48,'cocina_pantalla_dedicada','false','2026-09-07 17:44:45','2026-09-07 17:44:45'),(49,'portada',NULL,'2026-09-08 00:00:00','2026-09-08 00:00:00'),(50,'qr_proveedor','codepay','2026-11-16 16:50:49','2026-11-16 16:50:49'),(51,'qr_propio_imagen','','2026-11-16 16:50:49','2026-11-16 16:50:49'),(52,'baneco_url','https://apimktdesa.baneco.com.bo/ApiGateway','2026-11-16 16:50:49','2026-11-16 16:50:49'),(53,'baneco_usuario','','2026-11-16 16:50:49','2026-11-16 16:50:49'),(54,'baneco_password','','2026-11-16 16:50:49','2026-11-16 16:50:49'),(55,'baneco_aes_key','','2026-11-16 16:50:49','2026-11-16 16:50:49'),(56,'baneco_cuenta','','2026-11-16 16:50:49','2026-11-16 16:50:49'),(57,'baneco_sucursal','','2026-11-16 16:50:49','2026-11-16 16:50:49'),(58,'qr_ultimo_cambio','','2026-11-16 16:50:49','2026-11-16 16:50:49');
/*!40000 ALTER TABLE `configuraciones` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `cupon_productos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cupon_productos` (
  `cupon_id` int(10) unsigned NOT NULL,
  `producto_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`cupon_id`,`producto_id`),
  KEY `producto_id` (`producto_id`),
  CONSTRAINT `cupon_productos_cupon_fk` FOREIGN KEY (`cupon_id`) REFERENCES `cupones` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cupon_productos_producto_fk` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `cupon_productos` WRITE;
/*!40000 ALTER TABLE `cupon_productos` DISABLE KEYS */;
/*!40000 ALTER TABLE `cupon_productos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `cupones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cupones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `codigo` varchar(30) NOT NULL,
  `tipo` enum('fijo','porcentaje') NOT NULL DEFAULT 'fijo',
  `valor` decimal(10,2) NOT NULL,
  `usos_maximos` int(10) unsigned NOT NULL DEFAULT 1,
  `usos_actuales` int(10) unsigned NOT NULL DEFAULT 0,
  `limite_por_cliente` int(10) unsigned DEFAULT NULL,
  `cliente_id` int(10) unsigned DEFAULT NULL,
  `combo_id` int(10) unsigned DEFAULT NULL,
  `fecha_expiracion` date DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `usado_en` datetime DEFAULT NULL,
  `aviso_vencimiento_en` datetime DEFAULT NULL,
  `creado_por` int(10) unsigned DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`),
  KEY `creado_por` (`creado_por`),
  KEY `cliente_id` (`cliente_id`),
  KEY `cupones_combo_fk` (`combo_id`),
  CONSTRAINT `cupones_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`),
  CONSTRAINT `cupones_combo_fk` FOREIGN KEY (`combo_id`) REFERENCES `combos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `cupones_ibfk_1` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `cupones` WRITE;
/*!40000 ALTER TABLE `cupones` DISABLE KEYS */;
/*!40000 ALTER TABLE `cupones` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `detalle_arqueo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `detalle_arqueo` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sesion_caja_id` int(10) unsigned NOT NULL,
  `denominacion` decimal(10,2) NOT NULL,
  `cantidad` int(11) NOT NULL DEFAULT 0,
  `subtotal` decimal(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  KEY `sesion_caja_id` (`sesion_caja_id`),
  CONSTRAINT `detalle_arqueo_ibfk_1` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `detalle_arqueo` WRITE;
/*!40000 ALTER TABLE `detalle_arqueo` DISABLE KEYS */;
/*!40000 ALTER TABLE `detalle_arqueo` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `detalle_compras`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `detalle_compras` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `compra_id` int(10) unsigned NOT NULL,
  `producto_id` int(10) unsigned DEFAULT NULL,
  `insumo_id` int(10) unsigned DEFAULT NULL,
  `cantidad` decimal(10,3) NOT NULL,
  `costo_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `compra_id` (`compra_id`),
  KEY `producto_id` (`producto_id`),
  KEY `insumo_id` (`insumo_id`),
  CONSTRAINT `detalle_compras_ibfk_1` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `detalle_compras_ibfk_2` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`),
  CONSTRAINT `detalle_compras_ibfk_3` FOREIGN KEY (`insumo_id`) REFERENCES `insumos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `detalle_compras` WRITE;
/*!40000 ALTER TABLE `detalle_compras` DISABLE KEYS */;
/*!40000 ALTER TABLE `detalle_compras` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `detalle_pedido_combo_opciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `detalle_pedido_combo_opciones` (
  `detalle_pedido_id` int(10) unsigned NOT NULL,
  `producto_id` int(10) unsigned NOT NULL,
  `opcion_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`detalle_pedido_id`,`producto_id`,`opcion_id`),
  KEY `producto_id` (`producto_id`),
  KEY `opcion_id` (`opcion_id`),
  CONSTRAINT `detalle_pedido_combo_opciones_ibfk_1` FOREIGN KEY (`detalle_pedido_id`) REFERENCES `detalle_pedidos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `detalle_pedido_combo_opciones_ibfk_2` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`),
  CONSTRAINT `detalle_pedido_combo_opciones_ibfk_3` FOREIGN KEY (`opcion_id`) REFERENCES `opciones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `detalle_pedido_combo_opciones` WRITE;
/*!40000 ALTER TABLE `detalle_pedido_combo_opciones` DISABLE KEYS */;
/*!40000 ALTER TABLE `detalle_pedido_combo_opciones` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `detalle_pedido_opciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `detalle_pedido_opciones` (
  `detalle_pedido_id` int(10) unsigned NOT NULL,
  `opcion_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`detalle_pedido_id`,`opcion_id`),
  KEY `opcion_id` (`opcion_id`),
  CONSTRAINT `detalle_pedido_opciones_ibfk_1` FOREIGN KEY (`detalle_pedido_id`) REFERENCES `detalle_pedidos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `detalle_pedido_opciones_ibfk_2` FOREIGN KEY (`opcion_id`) REFERENCES `opciones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `detalle_pedido_opciones` WRITE;
/*!40000 ALTER TABLE `detalle_pedido_opciones` DISABLE KEYS */;
/*!40000 ALTER TABLE `detalle_pedido_opciones` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `detalle_pedidos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `detalle_pedidos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `pedido_id` int(10) unsigned NOT NULL,
  `producto_id` int(10) unsigned DEFAULT NULL,
  `combo_id` int(10) unsigned DEFAULT NULL,
  `cantidad` int(11) NOT NULL DEFAULT 1,
  `cantidad_anulada` int(11) NOT NULL DEFAULT 0,
  `peso` decimal(10,3) DEFAULT NULL,
  `precio` decimal(10,2) NOT NULL,
  `nota` varchar(255) DEFAULT NULL,
  `estado` enum('pendiente','preparando','servido') NOT NULL DEFAULT 'pendiente',
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pedido_id` (`pedido_id`),
  KEY `producto_id` (`producto_id`),
  KEY `combo_id` (`combo_id`),
  CONSTRAINT `detalle_pedidos_combo_fk` FOREIGN KEY (`combo_id`) REFERENCES `combos` (`id`),
  CONSTRAINT `detalle_pedidos_ibfk_1` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `detalle_pedidos_ibfk_2` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `detalle_pedidos` WRITE;
/*!40000 ALTER TABLE `detalle_pedidos` DISABLE KEYS */;
/*!40000 ALTER TABLE `detalle_pedidos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `devolucion_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `devolucion_items` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `devolucion_id` int(10) unsigned NOT NULL,
  `detalle_pedido_id` int(10) unsigned NOT NULL,
  `cantidad` int(11) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `vuelve_stock` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `devolucion_id` (`devolucion_id`),
  KEY `detalle_pedido_id` (`detalle_pedido_id`),
  CONSTRAINT `devolucion_items_ibfk_1` FOREIGN KEY (`devolucion_id`) REFERENCES `devoluciones` (`id`),
  CONSTRAINT `devolucion_items_ibfk_2` FOREIGN KEY (`detalle_pedido_id`) REFERENCES `detalle_pedidos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `devolucion_items` WRITE;
/*!40000 ALTER TABLE `devolucion_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `devolucion_items` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `devoluciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `devoluciones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `pedido_id` int(10) unsigned NOT NULL,
  `sesion_caja_id` int(10) unsigned DEFAULT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `motivo` enum('demora','error_pedido','cliente_arrepentido','producto_mal_estado','otro') NOT NULL,
  `nota` varchar(255) DEFAULT NULL,
  `monto` decimal(10,2) NOT NULL,
  `forma` enum('efectivo','transferencia','app','sin_dinero') NOT NULL,
  `estado_transferencia` enum('pendiente','hecha') DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pedido_id` (`pedido_id`),
  KEY `sesion_caja_id` (`sesion_caja_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `devoluciones_ibfk_1` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`),
  CONSTRAINT `devoluciones_ibfk_2` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`),
  CONSTRAINT `devoluciones_ibfk_3` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `devoluciones` WRITE;
/*!40000 ALTER TABLE `devoluciones` DISABLE KEYS */;
/*!40000 ALTER TABLE `devoluciones` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `gastos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `gastos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sesion_caja_id` int(10) unsigned DEFAULT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `descripcion` varchar(255) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `compra_id` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sesion_caja_id` (`sesion_caja_id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `gastos_compra_fk` (`compra_id`),
  CONSTRAINT `gastos_compra_fk` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE SET NULL,
  CONSTRAINT `gastos_ibfk_1` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`) ON DELETE SET NULL,
  CONSTRAINT `gastos_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `gastos` WRITE;
/*!40000 ALTER TABLE `gastos` DISABLE KEYS */;
/*!40000 ALTER TABLE `gastos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `grupos_opciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `grupos_opciones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `tipo_seleccion` enum('unica','multiple') NOT NULL DEFAULT 'unica',
  `creado_en` timestamp NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `grupos_opciones` WRITE;
/*!40000 ALTER TABLE `grupos_opciones` DISABLE KEYS */;
/*!40000 ALTER TABLE `grupos_opciones` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `horarios_personal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `horarios_personal` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `dia_semana` tinyint(3) unsigned NOT NULL,
  `trabaja` tinyint(1) NOT NULL DEFAULT 1,
  `hora_entrada` time DEFAULT NULL,
  `hora_salida` time DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `horario_usuario_dia` (`usuario_id`,`dia_semana`),
  CONSTRAINT `horarios_personal_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `horarios_personal` WRITE;
/*!40000 ALTER TABLE `horarios_personal` DISABLE KEYS */;
/*!40000 ALTER TABLE `horarios_personal` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `insumo_movimientos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `insumo_movimientos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `insumo_id` int(10) unsigned NOT NULL,
  `sucursal_id` int(10) unsigned NOT NULL,
  `usuario_id` int(10) unsigned DEFAULT NULL,
  `tipo` enum('compra','ajuste','consumo_venta') NOT NULL,
  `cantidad` decimal(10,3) NOT NULL,
  `stock_anterior` decimal(10,3) NOT NULL,
  `stock_nuevo` decimal(10,3) NOT NULL,
  `nota` varchar(255) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `insumo_id` (`insumo_id`),
  KEY `sucursal_id` (`sucursal_id`),
  CONSTRAINT `insumo_movimientos_ibfk_1` FOREIGN KEY (`insumo_id`) REFERENCES `insumos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `insumo_movimientos_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `insumo_movimientos` WRITE;
/*!40000 ALTER TABLE `insumo_movimientos` DISABLE KEYS */;
/*!40000 ALTER TABLE `insumo_movimientos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `insumo_stock_sucursal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `insumo_stock_sucursal` (
  `insumo_id` int(10) unsigned NOT NULL,
  `sucursal_id` int(10) unsigned NOT NULL,
  `stock` decimal(10,3) NOT NULL DEFAULT 0.000,
  PRIMARY KEY (`insumo_id`,`sucursal_id`),
  KEY `sucursal_id` (`sucursal_id`),
  CONSTRAINT `insumo_stock_sucursal_ibfk_1` FOREIGN KEY (`insumo_id`) REFERENCES `insumos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `insumo_stock_sucursal_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `insumo_stock_sucursal` WRITE;
/*!40000 ALTER TABLE `insumo_stock_sucursal` DISABLE KEYS */;
/*!40000 ALTER TABLE `insumo_stock_sucursal` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `insumos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `insumos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `unidad_medida` enum('kilogramo','gramo','litro','mililitro','arroba','libra','unidad') NOT NULL,
  `stock_minimo` decimal(10,3) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `insumos` WRITE;
/*!40000 ALTER TABLE `insumos` DISABLE KEYS */;
/*!40000 ALTER TABLE `insumos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `integraciones_api_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `integraciones_api_keys` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sucursal_id` int(10) unsigned NOT NULL,
  `nombre_app` varchar(100) NOT NULL,
  `api_key_hash` varchar(255) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_key_hash` (`api_key_hash`),
  KEY `sucursal_id` (`sucursal_id`),
  CONSTRAINT `integraciones_api_keys_ibfk_1` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `integraciones_api_keys` WRITE;
/*!40000 ALTER TABLE `integraciones_api_keys` DISABLE KEYS */;
/*!40000 ALTER TABLE `integraciones_api_keys` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `libro_caja`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `libro_caja` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sesion_caja_id` int(10) unsigned DEFAULT NULL,
  `sucursal_id` int(10) unsigned DEFAULT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `tipo` enum('ingreso','egreso') NOT NULL,
  `concepto` varchar(255) NOT NULL,
  `categoria` varchar(40) DEFAULT NULL,
  `detalle` varchar(120) DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `monto` decimal(10,2) NOT NULL,
  `metodo_pago` enum('efectivo','qr','app_externa') NOT NULL DEFAULT 'efectivo',
  `referencia_id` int(10) unsigned DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `compra_id` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sesion_caja_id` (`sesion_caja_id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `libro_caja_compra_fk` (`compra_id`),
  KEY `idx_libro_caja_fecha` (`fecha`),
  KEY `idx_libro_caja_creado` (`creado_en`),
  CONSTRAINT `libro_caja_compra_fk` FOREIGN KEY (`compra_id`) REFERENCES `compras` (`id`) ON DELETE SET NULL,
  CONSTRAINT `libro_caja_ibfk_1` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`) ON DELETE SET NULL,
  CONSTRAINT `libro_caja_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `libro_caja` WRITE;
/*!40000 ALTER TABLE `libro_caja` DISABLE KEYS */;
/*!40000 ALTER TABLE `libro_caja` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `marcaciones_personal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `marcaciones_personal` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `sucursal_id` int(10) unsigned NOT NULL,
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
  `aprobado_por` int(10) unsigned DEFAULT NULL,
  `aprobado_en` datetime DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `marcaciones_personal_ibfk_1` (`usuario_id`),
  KEY `marcaciones_personal_ibfk_2` (`sucursal_id`),
  KEY `marcaciones_personal_ibfk_3` (`aprobado_por`),
  CONSTRAINT `marcaciones_personal_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `marcaciones_personal_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`),
  CONSTRAINT `marcaciones_personal_ibfk_3` FOREIGN KEY (`aprobado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `marcaciones_personal` WRITE;
/*!40000 ALTER TABLE `marcaciones_personal` DISABLE KEYS */;
/*!40000 ALTER TABLE `marcaciones_personal` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `mesa_sesiones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mesa_sesiones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `mesa_id` int(10) unsigned NOT NULL,
  `sucursal_id` int(10) unsigned NOT NULL,
  `abierta_en` datetime NOT NULL DEFAULT current_timestamp(),
  `cerrada_en` datetime DEFAULT NULL,
  `abierta_por` enum('staff','autoservicio') NOT NULL DEFAULT 'staff',
  PRIMARY KEY (`id`),
  KEY `mesa_activa` (`mesa_id`,`cerrada_en`),
  KEY `sucursal_id` (`sucursal_id`),
  CONSTRAINT `mesa_sesiones_ibfk_1` FOREIGN KEY (`mesa_id`) REFERENCES `mesas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `mesa_sesiones_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `mesa_sesiones` WRITE;
/*!40000 ALTER TABLE `mesa_sesiones` DISABLE KEYS */;
/*!40000 ALTER TABLE `mesa_sesiones` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `mesas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mesas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `area_id` int(10) unsigned NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `codigo_qr` varchar(32) DEFAULT NULL,
  `asientos` int(11) NOT NULL DEFAULT 4,
  `estado` enum('disponible','ocupada','reservada') NOT NULL DEFAULT 'disponible',
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo_qr` (`codigo_qr`),
  KEY `area_id` (`area_id`),
  CONSTRAINT `mesas_ibfk_1` FOREIGN KEY (`area_id`) REFERENCES `areas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `mesas` WRITE;
/*!40000 ALTER TABLE `mesas` DISABLE KEYS */;
/*!40000 ALTER TABLE `mesas` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `migraciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `migraciones` (
  `nombre` varchar(150) NOT NULL,
  `aplicada_en` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `migraciones` WRITE;
/*!40000 ALTER TABLE `migraciones` DISABLE KEYS */;
INSERT INTO `migraciones` VALUES ('001_roles_permisos','2026-11-16 16:50:48'),('002_usuarios','2026-11-16 16:50:48'),('003_areas_mesas','2026-11-16 16:50:48'),('004_categorias_productos','2026-11-16 16:50:48'),('005_clientes','2026-11-16 16:50:48'),('006_sesiones_caja','2026-11-16 16:50:48'),('007_pedidos','2026-11-16 16:50:48'),('008_inventario','2026-11-16 16:50:48'),('009_compras','2026-11-16 16:50:48'),('010_caja_libro','2026-11-16 16:50:48'),('011_reservaciones_config','2026-11-16 16:50:48'),('012_sucursales','2026-11-16 16:50:48'),('013_sucursal_operativa','2026-11-16 16:50:48'),('014_cajas','2026-11-16 16:50:48'),('015_pagos_qr','2026-11-16 16:50:48'),('016_produccion_sucursal_shinahota','2026-11-16 16:50:48'),('017_opciones_producto','2026-11-16 16:50:48'),('018_productos_pesables','2026-11-16 16:50:48'),('019_opciones_multipaso','2026-11-16 16:50:48'),('020_debe_cambiar_contrasena','2026-11-16 16:50:48'),('021_avatar_usuario','2026-11-16 16:50:48'),('022_precio_opciones','2026-11-16 16:50:48'),('023_combos_promociones','2026-11-16 16:50:48'),('024_fidelidad','2026-11-16 16:50:48'),('025_cupones','2026-11-16 16:50:48'),('026_fidelidad_canje_metodos','2026-11-16 16:50:48'),('027_cupones_multiuso','2026-11-16 16:50:48'),('028_cumpleanos','2026-11-16 16:50:48'),('029_productos_quitar_campos_no_usados','2026-11-16 16:50:48'),('030_ruleta_premios','2026-11-16 16:50:48'),('031_ruleta_premios_producto_combo','2026-11-16 16:50:48'),('032_cupon_productos','2026-11-16 16:50:48'),('033_promocion_productos','2026-11-16 16:50:48'),('034_ruleta_premios_probabilidad','2026-11-16 16:50:48'),('035_impresion_movil','2026-11-16 16:50:48'),('036_ancho_papel_bluetooth','2026-11-16 16:50:48'),('037_insumos_recetas','2026-11-16 16:50:48'),('038_autoservicio_qr','2026-11-16 16:50:48'),('039_clientes_pin','2026-11-16 16:50:48'),('040_recuperar_pin','2026-11-16 16:50:48'),('041_impresion_dedicada','2026-11-16 16:50:48'),('042_ticket_cliente_por_caja','2026-11-16 16:50:48'),('043_opciones_combo','2026-11-16 16:50:48'),('044_integracion_pedidos_externos','2026-11-16 16:50:48'),('045_libro_caja_metodo_pago_app_externa','2026-11-16 16:50:48'),('046_sucursal_ubicacion_negocio_portada','2026-11-16 16:50:48'),('047_disponibilidad_diaria_productos','2026-11-16 16:50:48'),('048_estado_cocina_independiente','2026-11-16 16:50:48'),('049_estado_cocina_backfill_pedidos_abiertos','2026-11-16 16:50:48'),('050_permiso_dashboard','2026-11-16 16:50:48'),('051_control_personal','2026-11-16 16:50:48'),('052_cierre_caja_ciego','2026-11-16 12:50:49'),('053_sesion_unica','2026-11-16 12:50:49'),('054_permiso_pedidos_externos','2026-11-16 12:50:49'),('055_devoluciones','2026-11-16 12:50:49'),('056_proveedores_qr','2026-11-16 12:50:49'),('057_permiso_cobro_qr','2026-11-16 12:50:49'),('058_tiempos_cocina','2026-11-16 12:50:49'),('059_conexion_bluetooth','2026-11-16 12:50:49'),('060_caja_imprimir_logo','2026-11-16 12:50:49'),('061_cupon_combo','2026-11-16 12:50:49'),('062_cupon_aviso_vencimiento','2026-11-16 12:50:49'),('063_compra_pagada_desde_caja','2026-11-16 12:50:49'),('064_dividir_cuenta','2026-11-16 12:50:49'),('065_parte_k_de_n','2026-11-16 12:50:49'),('066_insumo_stock_minimo','2026-11-16 12:50:49'),('067_reservas','2026-11-16 12:50:49'),('068_ventas_sin_conexion','2026-11-16 12:50:49'),('069_libro_caja_flujo','2026-11-16 12:50:49'),('070_categorias_flujo','2026-11-16 12:50:49'),('071_sueldos_personal','2026-11-16 12:50:49');
/*!40000 ALTER TABLE `migraciones` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `opciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `opciones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `grupo_opciones_id` int(10) unsigned NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `precio_adicional` decimal(10,2) NOT NULL DEFAULT 0.00,
  `orden` int(11) NOT NULL DEFAULT 0,
  `creado_en` timestamp NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `grupo_opciones_id` (`grupo_opciones_id`),
  CONSTRAINT `opciones_ibfk_1` FOREIGN KEY (`grupo_opciones_id`) REFERENCES `grupos_opciones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `opciones` WRITE;
/*!40000 ALTER TABLE `opciones` DISABLE KEYS */;
/*!40000 ALTER TABLE `opciones` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `pagos_personal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pagos_personal` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `tipo` enum('pago','adelanto','bono','descuento') NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `fecha` date NOT NULL,
  `nota` varchar(160) DEFAULT NULL,
  `metodo_pago` enum('efectivo','qr') DEFAULT NULL,
  `sucursal_id` int(10) unsigned DEFAULT NULL,
  `sesion_caja_id` int(10) unsigned DEFAULT NULL,
  `gasto_id` int(10) unsigned DEFAULT NULL,
  `libro_caja_id` int(10) unsigned DEFAULT NULL,
  `registrado_por` int(10) unsigned NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pagos_personal_usuario` (`usuario_id`,`fecha`),
  KEY `idx_pagos_personal_libro` (`libro_caja_id`),
  CONSTRAINT `fk_pago_personal_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `pagos_personal` WRITE;
/*!40000 ALTER TABLE `pagos_personal` DISABLE KEYS */;
/*!40000 ALTER TABLE `pagos_personal` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `pagos_qr`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pagos_qr` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `pedido_id` int(10) unsigned NOT NULL,
  `sucursal_id` int(10) unsigned NOT NULL,
  `proveedor` enum('codepay','baneco','propio') NOT NULL DEFAULT 'codepay',
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
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `pedido_pago_id` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_id` (`order_id`),
  KEY `pedido_id` (`pedido_id`),
  KEY `sucursal_id` (`sucursal_id`),
  KEY `pagos_qr_pedido_pago_fk` (`pedido_pago_id`),
  CONSTRAINT `pagos_qr_ibfk_1` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`),
  CONSTRAINT `pagos_qr_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`),
  CONSTRAINT `pagos_qr_pedido_pago_fk` FOREIGN KEY (`pedido_pago_id`) REFERENCES `pedido_pagos` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `pagos_qr` WRITE;
/*!40000 ALTER TABLE `pagos_qr` DISABLE KEYS */;
/*!40000 ALTER TABLE `pagos_qr` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `pedido_pago_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pedido_pago_items` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `pedido_pago_id` int(10) unsigned NOT NULL,
  `detalle_pedido_id` int(10) unsigned NOT NULL,
  `cantidad` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `pedido_pago_items_pago_idx` (`pedido_pago_id`),
  KEY `pedido_pago_items_detalle_idx` (`detalle_pedido_id`),
  CONSTRAINT `pedido_pago_items_detalle_fk` FOREIGN KEY (`detalle_pedido_id`) REFERENCES `detalle_pedidos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pedido_pago_items_pago_fk` FOREIGN KEY (`pedido_pago_id`) REFERENCES `pedido_pagos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `pedido_pago_items` WRITE;
/*!40000 ALTER TABLE `pedido_pago_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `pedido_pago_items` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `pedido_pagos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pedido_pagos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `pedido_id` int(10) unsigned NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `sesion_caja_id` int(10) unsigned DEFAULT NULL,
  `metodo_pago` enum('efectivo','qr') NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `monto_recibido` decimal(10,2) DEFAULT NULL,
  `cambio` decimal(10,2) NOT NULL DEFAULT 0.00,
  `persona` varchar(80) DEFAULT NULL,
  `modo` enum('platos','iguales') NOT NULL,
  `parte_numero` tinyint(3) unsigned DEFAULT NULL,
  `partes_de` tinyint(3) unsigned DEFAULT NULL,
  `estado` enum('pendiente','completado','anulado') NOT NULL DEFAULT 'completado',
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pedido_pagos_pedido_idx` (`pedido_id`),
  KEY `pedido_pagos_usuario_fk` (`usuario_id`),
  KEY `pedido_pagos_sesion_fk` (`sesion_caja_id`),
  CONSTRAINT `pedido_pagos_pedido_fk` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pedido_pagos_sesion_fk` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`),
  CONSTRAINT `pedido_pagos_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `pedido_pagos` WRITE;
/*!40000 ALTER TABLE `pedido_pagos` DISABLE KEYS */;
/*!40000 ALTER TABLE `pedido_pagos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `pedidos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pedidos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sucursal_id` int(10) unsigned NOT NULL,
  `mesa_id` int(10) unsigned DEFAULT NULL,
  `mesa_sesion_id` int(10) unsigned DEFAULT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `cliente_id` int(10) unsigned DEFAULT NULL,
  `sesion_caja_id` int(10) unsigned DEFAULT NULL,
  `estado` enum('pendiente','listo','pendiente_pago','completado','cancelado') NOT NULL DEFAULT 'pendiente',
  `estado_cocina` enum('pendiente','listo') DEFAULT NULL,
  `cocina_desde` datetime DEFAULT NULL,
  `tipo` enum('mesa','llevar','delivery') NOT NULL DEFAULT 'mesa',
  `origen` enum('staff','autoservicio','app_externa') NOT NULL DEFAULT 'staff',
  `origen_app` varchar(100) DEFAULT NULL,
  `numero_llevar` int(10) unsigned DEFAULT NULL,
  `tipo_documento` varchar(50) NOT NULL DEFAULT 'Ticket',
  `nombre_cliente` varchar(255) NOT NULL DEFAULT 'Público General',
  `documento_cliente` varchar(50) DEFAULT NULL,
  `direccion_entrega` varchar(255) DEFAULT NULL,
  `telefono_cliente` varchar(50) DEFAULT NULL,
  `total` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_devuelto` decimal(10,2) NOT NULL DEFAULT 0.00,
  `descuento` decimal(10,2) NOT NULL DEFAULT 0.00,
  `propina` decimal(10,2) NOT NULL DEFAULT 0.00,
  `puntos_ganados` int(11) NOT NULL DEFAULT 0,
  `puntos_canjeados` int(11) NOT NULL DEFAULT 0,
  `cupon_id` int(10) unsigned DEFAULT NULL,
  `descuento_cupon` decimal(10,2) NOT NULL DEFAULT 0.00,
  `metodo_pago` enum('efectivo','qr','app_externa','mixto') NOT NULL DEFAULT 'efectivo',
  `monto_recibido` decimal(10,2) DEFAULT NULL,
  `cambio` decimal(10,2) NOT NULL DEFAULT 0.00,
  `notas` text DEFAULT NULL,
  `clave_offline` varchar(40) DEFAULT NULL,
  `sin_conexion` tinyint(1) NOT NULL DEFAULT 0,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `qr_tipo` enum('codepay','manual','baneco') DEFAULT NULL,
  `qr_confirmado_por` int(10) unsigned DEFAULT NULL,
  `pagado` decimal(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pedidos_clave_offline` (`clave_offline`),
  KEY `mesa_id` (`mesa_id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `cliente_id` (`cliente_id`),
  KEY `sesion_caja_id` (`sesion_caja_id`),
  KEY `sucursal_id` (`sucursal_id`),
  KEY `cupon_id` (`cupon_id`),
  KEY `pedidos_ibfk_6` (`mesa_sesion_id`),
  KEY `fk_pedidos_qr_confirmado_por` (`qr_confirmado_por`),
  CONSTRAINT `fk_pedidos_qr_confirmado_por` FOREIGN KEY (`qr_confirmado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `pedidos_cupon_fk` FOREIGN KEY (`cupon_id`) REFERENCES `cupones` (`id`),
  CONSTRAINT `pedidos_ibfk_1` FOREIGN KEY (`mesa_id`) REFERENCES `mesas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `pedidos_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `pedidos_ibfk_3` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `pedidos_ibfk_4` FOREIGN KEY (`sesion_caja_id`) REFERENCES `sesiones_caja` (`id`) ON DELETE SET NULL,
  CONSTRAINT `pedidos_ibfk_5` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`),
  CONSTRAINT `pedidos_ibfk_6` FOREIGN KEY (`mesa_sesion_id`) REFERENCES `mesa_sesiones` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `pedidos` WRITE;
/*!40000 ALTER TABLE `pedidos` DISABLE KEYS */;
/*!40000 ALTER TABLE `pedidos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `permisos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `permisos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `modulo` varchar(50) NOT NULL,
  `accion` varchar(50) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `permiso_unico` (`modulo`,`accion`)
) ENGINE=InnoDB AUTO_INCREMENT=76 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `permisos` WRITE;
/*!40000 ALTER TABLE `permisos` DISABLE KEYS */;
INSERT INTO `permisos` VALUES (1,'ventas','ver','Ver pedidos'),(2,'ventas','crear','Crear pedidos'),(3,'ventas','cancelar','Cancelar pedidos'),(4,'ventas','cobrar','Cobrar pedidos'),(5,'usuarios','ver','Ver usuarios'),(6,'usuarios','crear','Crear usuarios'),(7,'usuarios','editar','Editar usuarios'),(8,'inventario','ver','Ver inventario'),(9,'usuarios','eliminar','Eliminar usuarios'),(10,'inventario','ajustar','Ajustar stock'),(11,'inventario','entrada','Registrar entrada'),(12,'inventario','salida','Registrar salida'),(13,'caja','abrir','Abrir caja'),(14,'caja','cerrar','Cerrar caja'),(15,'caja','ver','Ver sesiones de caja'),(16,'libro_caja','ver','Ver libro caja'),(17,'libro_caja','crear','Registrar en libro caja'),(18,'compras','ver','Ver compras'),(19,'compras','crear','Crear compras'),(20,'compras','recibir','Marcar compra como recibida'),(21,'compras','editar','Editar compras'),(22,'proveedores','ver','Ver proveedores'),(23,'proveedores','crear','Crear proveedores'),(24,'proveedores','editar','Editar proveedores'),(25,'productos','ver','Ver productos'),(26,'productos','crear','Crear productos'),(27,'productos','editar','Editar productos'),(28,'productos','eliminar','Eliminar productos'),(29,'clientes','ver','Ver clientes'),(30,'clientes','crear','Crear clientes'),(31,'clientes','editar','Editar clientes'),(32,'configuracion','ver','Ver configuración'),(33,'configuracion','editar','Editar configuración'),(34,'roles','ver','Ver roles'),(35,'roles','crear','Crear roles'),(36,'roles','editar','Editar roles'),(37,'roles','eliminar','Eliminar roles'),(38,'reportes','ver','Ver reportes'),(39,'cocina','ver','Ver pantalla de cocina'),(40,'sucursales','ver','Ver sucursales'),(41,'sucursales','crear','Crear sucursales'),(42,'sucursales','editar','Editar sucursales'),(43,'sucursales','eliminar','Eliminar sucursales'),(44,'cajas','ver','Ver cajas'),(45,'cajas','crear','Crear cajas'),(46,'cajas','editar','Editar cajas'),(47,'cajas','eliminar','Eliminar cajas'),(48,'combos','ver','Ver combos'),(49,'combos','crear','Crear combos'),(50,'combos','editar','Editar combos'),(51,'combos','eliminar','Eliminar combos'),(52,'promociones','ver','Ver promociones'),(53,'promociones','crear','Crear promociones'),(54,'promociones','editar','Editar promociones'),(55,'promociones','eliminar','Eliminar promociones'),(56,'cupones','ver','Ver cupones'),(57,'cupones','crear','Crear cupones'),(58,'cupones','editar','Editar cupones'),(59,'cupones','eliminar','Eliminar cupones'),(60,'ruleta','ver','Ver ruleta de premios'),(61,'ruleta','girar','Girar la ruleta por un cliente'),(62,'ruleta','crear','Crear premios de la ruleta'),(63,'ruleta','editar','Editar premios de la ruleta'),(64,'ruleta','eliminar','Eliminar premios de la ruleta'),(65,'insumos','ver','Ver insumos'),(66,'insumos','crear','Crear insumos'),(67,'insumos','editar','Editar insumos (incluye receta y ajustes de stock)'),(68,'insumos','eliminar','Desactivar insumos'),(69,'productos','disponibilidad','Marcar productos como no disponibles hoy'),(70,'dashboard','ver','Ver el dashboard'),(71,'personal','administrar','Configurar horarios, ver y aprobar registros de asistencia de todos los empleados'),(72,'pedidos_externos','ver','Ver y cobrar pedidos llegados desde apps externas'),(73,'ventas','anular','Anular productos de pedidos cobrados y registrar devoluciones'),(74,'pagos_qr','configurar','Elegir el cobro con QR y cargar los datos del banco'),(75,'personal','pagar','Configurar sueldos y pagar sueldos, adelantos y bonos');
/*!40000 ALTER TABLE `permisos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `producto_grupos_opciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `producto_grupos_opciones` (
  `producto_id` int(10) unsigned NOT NULL,
  `grupo_opciones_id` int(10) unsigned NOT NULL,
  `orden` int(11) NOT NULL DEFAULT 0,
  `obligatorio` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`producto_id`,`grupo_opciones_id`),
  KEY `grupo_opciones_id` (`grupo_opciones_id`),
  CONSTRAINT `producto_grupos_opciones_ibfk_1` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `producto_grupos_opciones_ibfk_2` FOREIGN KEY (`grupo_opciones_id`) REFERENCES `grupos_opciones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `producto_grupos_opciones` WRITE;
/*!40000 ALTER TABLE `producto_grupos_opciones` DISABLE KEYS */;
/*!40000 ALTER TABLE `producto_grupos_opciones` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `producto_stock_sucursal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `producto_stock_sucursal` (
  `producto_id` int(10) unsigned NOT NULL,
  `sucursal_id` int(10) unsigned NOT NULL,
  `stock` int(11) NOT NULL DEFAULT 0,
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`producto_id`,`sucursal_id`),
  KEY `sucursal_id` (`sucursal_id`),
  CONSTRAINT `producto_stock_sucursal_ibfk_1` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `producto_stock_sucursal_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `producto_stock_sucursal` WRITE;
/*!40000 ALTER TABLE `producto_stock_sucursal` DISABLE KEYS */;
/*!40000 ALTER TABLE `producto_stock_sucursal` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `productos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `productos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `categoria_id` int(10) unsigned NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `precio` decimal(10,2) NOT NULL,
  `es_pesable` tinyint(1) NOT NULL DEFAULT 0,
  `stock` int(11) DEFAULT NULL,
  `es_vendible` tinyint(1) NOT NULL DEFAULT 1,
  `imagen` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `disponible_hoy` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `categoria_id` (`categoria_id`),
  CONSTRAINT `productos_ibfk_1` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `productos` WRITE;
/*!40000 ALTER TABLE `productos` DISABLE KEYS */;
/*!40000 ALTER TABLE `productos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `promocion_productos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `promocion_productos` (
  `promocion_id` int(10) unsigned NOT NULL,
  `producto_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`promocion_id`,`producto_id`),
  KEY `producto_id` (`producto_id`),
  CONSTRAINT `promocion_productos_producto_fk` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`),
  CONSTRAINT `promocion_productos_promocion_fk` FOREIGN KEY (`promocion_id`) REFERENCES `promociones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `promocion_productos` WRITE;
/*!40000 ALTER TABLE `promocion_productos` DISABLE KEYS */;
/*!40000 ALTER TABLE `promocion_productos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `promociones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `promociones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(150) DEFAULT NULL,
  `tipo` enum('porcentaje','monto') NOT NULL DEFAULT 'porcentaje',
  `valor` decimal(10,2) NOT NULL,
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `dias_semana` varchar(20) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `promociones` WRITE;
/*!40000 ALTER TABLE `promociones` DISABLE KEYS */;
/*!40000 ALTER TABLE `promociones` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `proveedores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `proveedores` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) NOT NULL,
  `contacto` varchar(255) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `proveedores` WRITE;
/*!40000 ALTER TABLE `proveedores` DISABLE KEYS */;
/*!40000 ALTER TABLE `proveedores` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `receta_insumos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `receta_insumos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `producto_id` int(10) unsigned NOT NULL,
  `opcion_id` int(10) unsigned DEFAULT NULL,
  `insumo_id` int(10) unsigned NOT NULL,
  `cantidad` decimal(10,3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `producto_id` (`producto_id`),
  KEY `opcion_id` (`opcion_id`),
  KEY `insumo_id` (`insumo_id`),
  CONSTRAINT `receta_insumos_ibfk_1` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `receta_insumos_ibfk_2` FOREIGN KEY (`opcion_id`) REFERENCES `opciones` (`id`) ON DELETE CASCADE,
  CONSTRAINT `receta_insumos_ibfk_3` FOREIGN KEY (`insumo_id`) REFERENCES `insumos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `receta_insumos` WRITE;
/*!40000 ALTER TABLE `receta_insumos` DISABLE KEYS */;
/*!40000 ALTER TABLE `receta_insumos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `registros_inventario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `registros_inventario` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `producto_id` int(10) unsigned NOT NULL,
  `sucursal_id` int(10) unsigned NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `tipo` enum('entrada','salida','venta','compra','ajuste') NOT NULL,
  `cantidad` int(11) NOT NULL,
  `stock_anterior` int(11) DEFAULT NULL,
  `stock_nuevo` int(11) DEFAULT NULL,
  `nota` varchar(255) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `producto_id` (`producto_id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `sucursal_id` (`sucursal_id`),
  CONSTRAINT `registros_inventario_ibfk_1` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `registros_inventario_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `registros_inventario_ibfk_3` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `registros_inventario` WRITE;
/*!40000 ALTER TABLE `registros_inventario` DISABLE KEYS */;
/*!40000 ALTER TABLE `registros_inventario` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `reservas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `reservas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sucursal_id` int(10) unsigned NOT NULL,
  `mesa_id` int(10) unsigned DEFAULT NULL,
  `usuario_id` int(10) unsigned DEFAULT NULL,
  `nombre_cliente` varchar(100) NOT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `personas` smallint(5) unsigned NOT NULL DEFAULT 2,
  `fecha_hora` datetime NOT NULL,
  `duracion_min` smallint(5) unsigned NOT NULL DEFAULT 120,
  `notas` varchar(255) DEFAULT NULL,
  `estado` enum('pendiente','llego','cancelada','no_vino') NOT NULL DEFAULT 'pendiente',
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `reservas_sucursal_fecha_idx` (`sucursal_id`,`fecha_hora`),
  KEY `reservas_mesa_idx` (`mesa_id`),
  KEY `reservas_usuario_fk` (`usuario_id`),
  CONSTRAINT `reservas_mesa_fk` FOREIGN KEY (`mesa_id`) REFERENCES `mesas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reservas_sucursal_fk` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`),
  CONSTRAINT `reservas_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `reservas` WRITE;
/*!40000 ALTER TABLE `reservas` DISABLE KEYS */;
/*!40000 ALTER TABLE `reservas` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `roles` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'Administrador','Acceso total al sistema','2026-07-01 00:23:31','2026-07-01 00:23:31'),(2,'Cajero','Ventas, caja, clientes y libro caja','2026-07-01 00:23:31','2026-07-01 00:23:31');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `roles_permisos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `roles_permisos` (
  `rol_id` int(10) unsigned NOT NULL,
  `permiso_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`rol_id`,`permiso_id`),
  KEY `permiso_id` (`permiso_id`),
  CONSTRAINT `roles_permisos_ibfk_1` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `roles_permisos_ibfk_2` FOREIGN KEY (`permiso_id`) REFERENCES `permisos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `roles_permisos` WRITE;
/*!40000 ALTER TABLE `roles_permisos` DISABLE KEYS */;
INSERT INTO `roles_permisos` VALUES (1,1),(1,2),(1,3),(1,4),(1,5),(1,6),(1,7),(1,8),(1,9),(1,10),(1,11),(1,12),(1,13),(1,14),(1,15),(1,16),(1,17),(1,18),(1,19),(1,20),(1,21),(1,22),(1,23),(1,24),(1,25),(1,26),(1,27),(1,28),(1,29),(1,30),(1,31),(1,32),(1,33),(1,34),(1,35),(1,36),(1,37),(1,38),(1,40),(1,41),(1,42),(1,43),(1,44),(1,45),(1,46),(1,47),(1,48),(1,49),(1,50),(1,51),(1,52),(1,53),(1,54),(1,55),(1,56),(1,57),(1,58),(1,59),(1,60),(1,61),(1,62),(1,63),(1,64),(1,65),(1,66),(1,67),(1,68),(1,69),(1,70),(1,71),(1,72),(1,73),(1,74),(1,75),(2,1),(2,2),(2,3),(2,4),(2,8),(2,13),(2,14),(2,15),(2,16),(2,17),(2,25),(2,26),(2,27),(2,28),(2,29),(2,30),(2,31),(2,69),(2,70),(2,72),(2,73);
/*!40000 ALTER TABLE `roles_permisos` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `ruleta_giros`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ruleta_giros` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `cliente_id` int(10) unsigned NOT NULL,
  `premio_id` int(10) unsigned NOT NULL,
  `cupon_id` int(10) unsigned DEFAULT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `puntos_gastados` int(11) NOT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `cliente_id` (`cliente_id`),
  KEY `premio_id` (`premio_id`),
  KEY `cupon_id` (`cupon_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `ruleta_giros_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`),
  CONSTRAINT `ruleta_giros_cupon_fk` FOREIGN KEY (`cupon_id`) REFERENCES `cupones` (`id`),
  CONSTRAINT `ruleta_giros_premio_fk` FOREIGN KEY (`premio_id`) REFERENCES `ruleta_premios` (`id`),
  CONSTRAINT `ruleta_giros_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `ruleta_giros` WRITE;
/*!40000 ALTER TABLE `ruleta_giros` DISABLE KEYS */;
/*!40000 ALTER TABLE `ruleta_giros` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `ruleta_premios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ruleta_premios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `tipo` enum('porcentaje','fijo','producto_gratis','combo_gratis','nada') NOT NULL DEFAULT 'nada',
  `valor` decimal(10,2) DEFAULT NULL,
  `producto_id` int(10) unsigned DEFAULT NULL,
  `combo_id` int(10) unsigned DEFAULT NULL,
  `probabilidad` int(10) unsigned NOT NULL DEFAULT 1,
  `color` varchar(20) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `orden` int(11) NOT NULL DEFAULT 0,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `producto_id` (`producto_id`),
  KEY `combo_id` (`combo_id`),
  CONSTRAINT `ruleta_premios_combo_fk` FOREIGN KEY (`combo_id`) REFERENCES `combos` (`id`),
  CONSTRAINT `ruleta_premios_producto_fk` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `ruleta_premios` WRITE;
/*!40000 ALTER TABLE `ruleta_premios` DISABLE KEYS */;
/*!40000 ALTER TABLE `ruleta_premios` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `sesiones_caja`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sesiones_caja` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `sucursal_id` int(10) unsigned NOT NULL,
  `caja_id` int(10) unsigned NOT NULL,
  `monto_apertura` decimal(10,2) NOT NULL DEFAULT 0.00,
  `monto_cierre` decimal(10,2) DEFAULT NULL,
  `total_ventas` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_gastos` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_devoluciones` decimal(10,2) NOT NULL DEFAULT 0.00,
  `diferencia` decimal(10,2) DEFAULT NULL,
  `nota_diferencia` varchar(255) DEFAULT NULL,
  `abierto_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `cerrado_en` timestamp NULL DEFAULT NULL,
  `estado` enum('abierta','cerrada') NOT NULL DEFAULT 'abierta',
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `sucursal_id` (`sucursal_id`),
  KEY `caja_id` (`caja_id`),
  CONSTRAINT `sesiones_caja_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `sesiones_caja_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`),
  CONSTRAINT `sesiones_caja_ibfk_3` FOREIGN KEY (`caja_id`) REFERENCES `cajas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `sesiones_caja` WRITE;
/*!40000 ALTER TABLE `sesiones_caja` DISABLE KEYS */;
/*!40000 ALTER TABLE `sesiones_caja` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `sucursales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sucursales` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) NOT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `latitud` decimal(10,7) DEFAULT NULL,
  `longitud` decimal(10,7) DEFAULT NULL,
  `radio_geocerca_metros` int(10) unsigned NOT NULL DEFAULT 150,
  `modo_cierre_caja` enum('directo','ciego') NOT NULL DEFAULT 'directo',
  `tolerancia_cierre_caja` decimal(10,2) NOT NULL DEFAULT 10.00,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `sucursales` WRITE;
/*!40000 ALTER TABLE `sucursales` DISABLE KEYS */;
INSERT INTO `sucursales` VALUES (1,'Ivigarzama','','',NULL,NULL,150,'directo',10.00,1,'2026-07-24 12:23:40','2026-07-24 12:23:40');
/*!40000 ALTER TABLE `sucursales` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `sueldos_personal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sueldos_personal` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `modalidad` enum('diario','semanal','quincenal','mensual','ninguno') NOT NULL,
  `monto` decimal(10,2) NOT NULL DEFAULT 0.00,
  `descontar_faltas` tinyint(1) NOT NULL DEFAULT 1,
  `vigente_desde` date NOT NULL,
  `creado_por` int(10) unsigned DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sueldo_usuario_desde` (`usuario_id`,`vigente_desde`),
  CONSTRAINT `fk_sueldo_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `sueldos_personal` WRITE;
/*!40000 ALTER TABLE `sueldos_personal` DISABLE KEYS */;
/*!40000 ALTER TABLE `sueldos_personal` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `usuarios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `rol_id` int(10) unsigned NOT NULL,
  `acceso_todas_sucursales` tinyint(1) NOT NULL DEFAULT 0,
  `nombre` varchar(255) NOT NULL,
  `avatar` varchar(255) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `contrasena` varchar(255) NOT NULL,
  `debe_cambiar_contrasena` tinyint(1) NOT NULL DEFAULT 0,
  `sesion_version` int(10) unsigned NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuarios_email_unique` (`email`),
  KEY `rol_id` (`rol_id`),
  CONSTRAINT `usuarios_ibfk_1` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `usuarios` WRITE;
/*!40000 ALTER TABLE `usuarios` DISABLE KEYS */;
INSERT INTO `usuarios` VALUES (1,1,1,'Administrador',NULL,'admin@instalacion.local','$2b$10$dn9nFMmWEPE./bYgQzGbKOVOgOQaxdpz/DhJSostRCV6pMzSCn4/m',0,0,1,'2026-07-01 00:23:31','2026-09-07 17:54:15');
/*!40000 ALTER TABLE `usuarios` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `usuarios_sucursales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `usuarios_sucursales` (
  `usuario_id` int(10) unsigned NOT NULL,
  `sucursal_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`usuario_id`,`sucursal_id`),
  KEY `sucursal_id` (`sucursal_id`),
  CONSTRAINT `usuarios_sucursales_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `usuarios_sucursales_ibfk_2` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `usuarios_sucursales` WRITE;
/*!40000 ALTER TABLE `usuarios_sucursales` DISABLE KEYS */;
/*!40000 ALTER TABLE `usuarios_sucursales` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

