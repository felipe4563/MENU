import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Grid3x3, Users, RefreshCw, QrCode, Download, Smartphone, RotateCw, AlertTriangle } from 'lucide-react';
import QRCode from 'qrcode';
import { getAreas } from '../../../api/areas';
import { getMesas, crearMesa, actualizarMesa, eliminarMesa, abrirSesionMesa, cerrarSesionMesa, regenerarCodigoQrMesa } from '../../../api/mesas';
import { getConfiguracion, logoSrc } from '../../../api/configuracion';
import Modal from '../../../components/ui/Modal';
import { SettingsCard } from '../shared';

const ESTADOS_MESA = ['disponible', 'reservada'];

export default function TabMesas({ puedeEditar }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [confirmEliminar, setConfirmEliminar] = useState(null);
  const [confirmRegenerar, setConfirmRegenerar] = useState(null);
  const [filtroArea, setFiltroArea] = useState('');
  const [modalQr, setModalQr] = useState(null);

  const { data: areas = [] } = useQuery({ queryKey: ['areas'], queryFn: getAreas });
  const { data: mesas = [], isLoading } = useQuery({ queryKey: ['mesas'], queryFn: () => getMesas() });

  const mesasFiltradas = filtroArea
    ? mesas.filter(m => String(m.area_id) === filtroArea)
    : mesas;

  const guardar = useMutation({
    mutationFn: ({ mesa, datos }) =>
      mesa ? actualizarMesa(mesa.id, datos) : crearMesa(datos),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mesas'] }); setModal(null); },
  });

  const eliminar = useMutation({
    mutationFn: (id) => eliminarMesa(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mesas'] }); setConfirmEliminar(null); },
  });

  const toggleSesion = useMutation({
    mutationFn: (mesa) => (mesa.sesiones?.length > 0 ? cerrarSesionMesa(mesa.id) : abrirSesionMesa(mesa.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mesas'] }),
  });

  const regenerarQr = useMutation({
    mutationFn: (id) => regenerarCodigoQrMesa(id),
    onSuccess: (mesaActualizada) => {
      qc.invalidateQueries({ queryKey: ['mesas'] });
      setConfirmRegenerar(null);
      setModalQr((actual) => (actual && actual.id === mesaActualizada.id ? mesaActualizada : actual));
    },
  });

  // Agrupar por área si no hay filtro
  const porArea = mesasFiltradas.reduce((acc, m) => {
    const key = m.area?.nombre ?? 'Sin área';
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  return (
    <SettingsCard
      toolbar={
        <>
          <p className="text-sm text-muted-foreground">{mesasFiltradas.length} mesa(s)</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filtroArea}
              onChange={e => setFiltroArea(e.target.value)}
              className="bg-background border border-input rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todas las áreas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            {puedeEditar && (
              <button
                onClick={() => setModal({ modo: 'crear' })}
                disabled={areas.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-medium transition-colors"
                title={areas.length === 0 ? 'Primero crea un área' : ''}
              >
                <Plus className="w-4 h-4" /> Nueva Mesa
              </button>
            )}
          </div>
        </>
      }
    >
      <div className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" /><span className="text-sm">Cargando...</span>
          </div>
        )}

        {!isLoading && mesasFiltradas.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <Grid3x3 className="w-8 h-8" />
            <p className="text-sm">
              {areas.length === 0 ? 'Primero crea un área en la pestaña Áreas.' : 'No hay mesas. Crea la primera.'}
            </p>
          </div>
        )}

        {Object.entries(porArea).map(([areaNombre, mesasGrupo]) => (
          <section key={areaNombre}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{areaNombre}</h3>

            {/* Móvil y tablet: tarjetas */}
            <div className="lg:hidden space-y-2">
              {mesasGrupo.map(mesa => (
                <div key={mesa.id} className="bg-background border border-border rounded-xl p-3.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{mesa.nombre}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="w-3.5 h-3.5" />{mesa.asientos}</span>
                      <EstadoBadge estado={mesa.estado} />
                      {mesa.sesiones?.length > 0 && <AutoservicioBadge />}
                    </div>
                  </div>
                  {puedeEditar && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => toggleSesion.mutate(mesa)}
                        disabled={toggleSesion.isPending}
                        title={mesa.sesiones?.length > 0 ? 'Cerrar autoservicio' : 'Habilitar autoservicio'}
                        className={`p-1.5 rounded-lg transition-colors ${mesa.sesiones?.length > 0 ? 'text-violet-600 hover:bg-violet-100 dark:hover:bg-violet-900/30' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setModalQr(mesa)}
                        title={mesa.codigo_qr ? 'Ver código QR' : 'Sin código QR'}
                        className={`p-1.5 rounded-lg transition-colors ${mesa.codigo_qr ? 'text-muted-foreground hover:text-primary hover:bg-primary/10' : 'text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30'}`}
                      >
                        {mesa.codigo_qr ? <QrCode className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setConfirmRegenerar(mesa)}
                        title="Regenerar código QR"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setModal({ modo: 'editar', mesa })}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmEliminar(mesa)}
                        disabled={mesa.estado === 'ocupada'}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Escritorio: tabla */}
            <div className="hidden lg:block bg-background border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nombre</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Asientos</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estado</th>
                      {puedeEditar && <th className="px-4 py-3 w-20" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {mesasGrupo.map(mesa => (
                      <tr key={mesa.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{mesa.nombre}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{mesa.asientos}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <EstadoBadge estado={mesa.estado} />
                            {mesa.sesiones?.length > 0 && <AutoservicioBadge />}
                          </div>
                        </td>
                        {puedeEditar && (
                          <td className="px-4 py-3">
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => toggleSesion.mutate(mesa)}
                                disabled={toggleSesion.isPending}
                                title={mesa.sesiones?.length > 0 ? 'Cerrar autoservicio' : 'Habilitar autoservicio'}
                                className={`p-1.5 rounded-lg transition-colors ${mesa.sesiones?.length > 0 ? 'text-violet-600 hover:bg-violet-100 dark:hover:bg-violet-900/30' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}
                              >
                                <Smartphone className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setModalQr(mesa)}
                                title={mesa.codigo_qr ? 'Ver código QR' : 'Sin código QR'}
                                className={`p-1.5 rounded-lg transition-colors ${mesa.codigo_qr ? 'text-muted-foreground hover:text-primary hover:bg-primary/10' : 'text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30'}`}
                              >
                                {mesa.codigo_qr ? <QrCode className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => setConfirmRegenerar(mesa)}
                                title="Regenerar código QR"
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setModal({ modo: 'editar', mesa })}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setConfirmEliminar(mesa)}
                                disabled={mesa.estado === 'ocupada'}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Modal crear/editar mesa */}
      {modal && (
        <FormMesaModal
          mesa={modal.mesa}
          areas={areas}
          onClose={() => setModal(null)}
          onGuardar={(datos) => guardar.mutate({ mesa: modal.mesa, datos })}
          guardando={guardar.isPending}
          error={guardar.error?.response?.data?.mensaje}
        />
      )}

      {/* Confirmar eliminar */}
      {confirmEliminar && (
        <Modal titulo="Eliminar Mesa" onClose={() => setConfirmEliminar(null)}>
          <p className="text-sm text-muted-foreground mb-4">
            ¿Eliminar la mesa <strong>{confirmEliminar.nombre}</strong>?
          </p>
          {eliminar.error && (
            <p className="text-sm text-destructive mb-3">{eliminar.error?.response?.data?.mensaje ?? 'Error al eliminar'}</p>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmEliminar(null)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => eliminar.mutate(confirmEliminar.id)}
              disabled={eliminar.isPending}
              className="px-4 py-2 rounded-xl text-sm bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-colors disabled:opacity-60"
            >
              {eliminar.isPending ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Confirmar regenerar código QR */}
      {confirmRegenerar && (
        <Modal titulo="Regenerar código QR" onClose={() => setConfirmRegenerar(null)}>
          <p className="text-sm text-muted-foreground mb-4">
            ¿Regenerar el código QR de <strong>{confirmRegenerar.nombre}</strong>? El código {confirmRegenerar.codigo_qr ? 'actual dejará de funcionar' : 'se generará por primera vez'} y se cerrará cualquier sesión de autoservicio activa en esta mesa.
          </p>
          {regenerarQr.error && (
            <p className="text-sm text-destructive mb-3">{regenerarQr.error?.response?.data?.mensaje ?? 'Error al regenerar el código'}</p>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmRegenerar(null)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => regenerarQr.mutate(confirmRegenerar.id)}
              disabled={regenerarQr.isPending}
              className="px-4 py-2 rounded-xl text-sm bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-60"
            >
              {regenerarQr.isPending ? 'Regenerando...' : 'Regenerar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal QR */}
      {modalQr && (
        <ModalCodigoQr
          mesa={modalQr}
          onClose={() => setModalQr(null)}
          onRegenerar={() => setConfirmRegenerar(modalQr)}
        />
      )}
    </SettingsCard>
  );
}

function FormMesaModal({ mesa, areas, onClose, onGuardar, guardando, error }) {
  const [form, setForm] = useState({
    area_id: mesa?.area_id ?? (areas[0]?.id ?? ''),
    nombre: mesa?.nombre ?? '',
    asientos: mesa?.asientos ?? 4,
    estado: mesa?.estado ?? 'disponible',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Modal titulo={mesa ? 'Editar Mesa' : 'Nueva Mesa'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Área</label>
          <select
            value={form.area_id}
            onChange={e => set('area_id', e.target.value)}
            className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Nombre</label>
          <input
            autoFocus
            value={form.nombre}
            onChange={e => set('nombre', e.target.value)}
            placeholder="Ej: Mesa 1, Barra 2, VIP"
            className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Asientos</label>
          <input
            type="number"
            min={1}
            max={20}
            value={form.asientos}
            onChange={e => set('asientos', parseInt(e.target.value) || 1)}
            className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>
        {mesa && (
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Estado</label>
            <select
              value={form.estado}
              onChange={e => set('estado', e.target.value)}
              className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ESTADOS_MESA.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => onGuardar(form)}
            disabled={guardando || !form.nombre.trim() || !form.area_id}
            className="px-4 py-2 rounded-xl text-sm bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-60"
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EstadoBadge({ estado }) {
  const cfg = {
    disponible: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    ocupada:    'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    reservada:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  }[estado] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg}`}>
      {estado}
    </span>
  );
}

function AutoservicioBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
      <Smartphone className="w-3 h-3" /> Autoservicio
    </span>
  );
}

// Trae el logo como blob por fetch (no vía <img crossOrigin> + canvas): esa
// combinación tiñe el canvas si el Service Worker de la PWA responde la
// imagen desde caché de forma opaca — mismo problema ya resuelto en
// pages/reportes/utils/exportarPDF.js. Leyendo el blob con FileReader se
// evita el canvas por completo.
function cargarLogo(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const urlSinCache = url + (url.includes('?') ? '&' : '?') + '_qr=' + Date.now();
    fetch(urlSinCache, { mode: 'cors', cache: 'no-store' })
      .then((resp) => (resp.ok ? resp.blob() : null))
      .then((blob) => {
        if (!blob) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = reader.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      })
      .catch(() => resolve(null));
  });
}

// Rectángulo con esquinas redondeadas — más portable que ctx.roundRect
// (no soportado en todos los navegadores/versiones que puede tener el staff).
function dibujarRectRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ModalCodigoQr({ mesa, onClose, onRegenerar }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imagenBlob, setImagenBlob] = useState(null);
  const url = mesa.codigo_qr ? `${window.location.origin}/m/${mesa.codigo_qr}` : null;

  useEffect(() => {
    if (!url) { setPreviewUrl(null); setImagenBlob(null); return; }
    let cancelado = false;

    async function componer() {
      const qrTam = 480;
      const [config, qrImg] = await Promise.all([
        getConfiguracion().catch(() => null),
        // errorCorrectionLevel 'H' tolera hasta ~30% de daño — necesario
        // para poder tapar el centro con el logo sin romper el escaneo.
        QRCode.toDataURL(url, { width: qrTam, margin: 1, errorCorrectionLevel: 'H' })
          .then((dataUrl) => new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = dataUrl;
          })),
      ]);
      const logoImg = await cargarLogo(logoSrc(config?.logo));
      if (cancelado) return;

      const colorPrimario = config?.color_primario || '#245b62';
      const colorSecundario = config?.color_secundario || '#d97706';
      const nombreNegocio = config?.nombre_negocio || 'Escaneá y pedí';

      const padding = 40;
      const headerAlto = 150;
      const ctaAlto = 56;
      const gapCtaQr = 24;
      const gapQrBadge = 28;
      const badgeAlto = 84;
      const radioCard = 28;
      const marco = 10; // grosor del marco de color_secundario, actúa de guía de corte al imprimir

      const ancho = qrTam + padding * 2;
      const qrY = headerAlto + ctaAlto + gapCtaQr;
      const badgeY = qrY + qrTam + gapQrBadge;
      const alto = badgeY + badgeAlto + padding;

      const canvas = document.createElement('canvas');
      canvas.width = ancho + marco * 2;
      canvas.height = alto + marco * 2;
      const ctx = canvas.getContext('2d');
      // Todo el contenido se dibuja con las mismas coordenadas de antes;
      // el traslado deja lugar para el marco alrededor.
      ctx.translate(marco, marco);

      // Contenido de la tarjeta, recortado a esquinas redondeadas
      ctx.save();
      dibujarRectRedondeado(ctx, 0, 0, ancho, alto, radioCard);
      ctx.clip();

      // Fondo
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, ancho, alto);

      // Franja de marca (logo + nombre del negocio)
      ctx.fillStyle = colorPrimario;
      ctx.fillRect(0, 0, ancho, headerAlto);

      const centroHeaderY = headerAlto / 2;
      ctx.font = 'bold 34px sans-serif';
      const anchoTexto = ctx.measureText(nombreNegocio).width;
      const logoDiam = logoImg ? 84 : 0;
      const gapLogoTexto = logoImg ? 16 : 0;
      let cursorX = (ancho - (logoDiam + gapLogoTexto + anchoTexto)) / 2;

      if (logoImg) {
        const cx = cursorX + logoDiam / 2;
        ctx.beginPath();
        ctx.arc(cx, centroHeaderY, logoDiam / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, centroHeaderY, logoDiam / 2 - 6, 0, Math.PI * 2);
        ctx.clip();
        const logoInterior = logoDiam - 20;
        ctx.drawImage(logoImg, cx - logoInterior / 2, centroHeaderY - logoInterior / 2, logoInterior, logoInterior);
        ctx.restore();
        cursorX += logoDiam + gapLogoTexto;
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(nombreNegocio, cursorX, centroHeaderY);

      // Llamado a la acción
      ctx.fillStyle = '#374151';
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Escanee y pida desde su celular', ancho / 2, headerAlto + ctaAlto / 2);

      // QR
      ctx.drawImage(qrImg, padding, qrY, qrTam, qrTam);

      // Badge con el nombre de mesa
      ctx.font = 'bold 40px sans-serif';
      const anchoTextoMesa = ctx.measureText(mesa.nombre).width;
      const badgeAncho = anchoTextoMesa + 80;
      const badgeX = (ancho - badgeAncho) / 2;
      ctx.fillStyle = colorSecundario;
      dibujarRectRedondeado(ctx, badgeX, badgeY, badgeAncho, badgeAlto, badgeAlto / 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mesa.nombre, ancho / 2, badgeY + badgeAlto / 2);

      ctx.restore(); // fin del recorte a esquinas redondeadas

      // Marco de color_secundario alrededor de toda la tarjeta
      dibujarRectRedondeado(ctx, 0, 0, ancho, alto, radioCard);
      ctx.lineWidth = marco;
      ctx.strokeStyle = colorSecundario;
      ctx.stroke();

      canvas.toBlob((blob) => {
        if (cancelado || !blob) return;
        setImagenBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
      }, 'image/png');
    }

    componer();
    return () => { cancelado = true; };
  }, [url, mesa.nombre]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function descargar() {
    if (!imagenBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(imagenBlob);
    a.download = `qr-mesa-${mesa.nombre.replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Modal titulo={`QR — ${mesa.nombre}`} onClose={onClose}>
      <div className="flex flex-col items-center gap-4">
        {!url ? (
          <div className="w-full max-w-[280px] aspect-[580/862] flex flex-col items-center justify-center gap-2 text-center text-muted-foreground border border-dashed border-border rounded-xl p-4">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
            <p className="text-sm">Esta mesa no tiene código QR todavía.</p>
          </div>
        ) : previewUrl ? (
          <img src={previewUrl} alt={`QR de ${mesa.nombre}`} className="w-full max-w-[280px] rounded-lg shadow-sm" />
        ) : (
          <div className="w-full max-w-[280px] aspect-[580/862] flex items-center justify-center text-muted-foreground">Generando...</div>
        )}
        <div className="flex gap-2">
          {url && (
            <button
              onClick={descargar}
              disabled={!imagenBlob}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" /> Descargar imagen
            </button>
          )}
          <button
            onClick={onRegenerar}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:bg-accent hover:text-accent-foreground text-sm font-medium transition-colors"
          >
            <RotateCw className="w-4 h-4" /> {url ? 'Regenerar código' : 'Generar código'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
