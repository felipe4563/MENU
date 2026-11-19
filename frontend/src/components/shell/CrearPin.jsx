import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LockKeyhole } from 'lucide-react';
import { guardarPin } from '../../api/perfil';
import { useAuthStore } from '../../store/authStore';
import { guardarVerificador } from '../../lib/bloqueo';
import { errorDe } from '../../lib/util';
import Hoja from '../ui/Hoja';
import { Campo } from '../ui/piezas';
import { avisar } from '../ui/Aviso';

// "Ahora no" vale para esta pestaña y este usuario.
const AHORA_NO = 'rusoft-pin-ahora-no';
const leerAhoraNo = () => { try { return sessionStorage.getItem(AHORA_NO); } catch { return null; } };

const soloDigitos = (v) => v.replace(/\D/g, '').slice(0, 4);

function CampoPin({ etiqueta, valor, onCambio, autoFocus }) {
  return (
    <Campo etiqueta={etiqueta}>
      <input className="campo num tracking-[0.5em] text-lg" type="password" inputMode="numeric" autoComplete="off"
        maxLength={4} placeholder="••••" value={valor} autoFocus={autoFocus} onChange={(e) => onCambio(soloDigitos(e.target.value))} />
    </Campo>
  );
}

/** Formulario para crear o cambiar el PIN. Deja listo el desbloqueo sin internet. */
export function FormularioPin({ tienePin, onListo, autoFocus, pie }) {
  const usuario = useAuthStore((s) => s.usuario);
  const updateUsuario = useAuthStore((s) => s.updateUsuario);
  const qc = useQueryClient();
  const [f, setF] = useState({ pin: '', repetir: '', contrasena: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const noCoinciden = f.repetir.length === 4 && f.repetir !== f.pin;
  const listo = f.pin.length === 4 && f.repetir === f.pin && f.contrasena;

  async function enviar(e) {
    e.preventDefault();
    if (!listo || enviando) return;
    setError('');
    setEnviando(true);
    try {
      await guardarPin({ contrasena: f.contrasena, pin: f.pin });
      await guardarVerificador(usuario.id, f.pin);
      updateUsuario({ tiene_pin: true });
      qc.setQueryData(['perfil'], (p) => (p ? { ...p, tiene_pin: true } : p));
      setF({ pin: '', repetir: '', contrasena: '' });
      avisar.ok(tienePin ? 'PIN cambiado' : 'PIN creado');
      onListo?.();
    } catch (err) {
      setError(errorDe(err, 'No se pudo guardar el PIN.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <CampoPin etiqueta={tienePin ? 'PIN nuevo' : 'PIN (4 números)'} valor={f.pin} onCambio={(v) => setF({ ...f, pin: v })} autoFocus={autoFocus} />
        <CampoPin etiqueta="Repítelo" valor={f.repetir} onCambio={(v) => setF({ ...f, repetir: v })} />
      </div>
      {noCoinciden && <p className="text-sm text-locoto">Los PIN no coinciden.</p>}
      <Campo etiqueta="Tu contraseña" ayuda="Para confirmar que eres tú.">
        <input className="campo" type="password" autoComplete="current-password" value={f.contrasena} onChange={(e) => setF({ ...f, contrasena: e.target.value })} />
      </Campo>
      {error && <p role="alert" className="text-sm text-locoto">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-aji" disabled={!listo || enviando}>{enviando ? 'Guardando…' : tienePin ? 'Cambiar PIN' : 'Crear PIN'}</button>
        {pie}
      </div>
    </form>
  );
}

/** Aviso tras entrar: crea tu PIN para desbloquear rápido. */
export default function CrearPin() {
  const usuario = useAuthStore((s) => s.usuario);
  const [cerrado, setCerrado] = useState(() => leerAhoraNo() === String(usuario?.id));

  if (cerrado || !usuario || usuario.tiene_pin) return null;

  const ahoraNo = () => {
    try { sessionStorage.setItem(AHORA_NO, String(usuario.id)); } catch { /* sin sessionStorage */ }
    setCerrado(true);
  };

  return (
    <Hoja onCerrar={ahoraNo} titulo="Crea tu PIN" subtitulo="4 números para desbloquear la pantalla sin escribir tu correo." ancho="max-w-sm">
      <LockKeyhole className="w-10 h-10 text-hierba mb-3" />
      <FormularioPin autoFocus onListo={() => setCerrado(true)} pie={<button type="button" className="btn-fantasma" onClick={ahoraNo}>Ahora no</button>} />
    </Hoja>
  );
}
