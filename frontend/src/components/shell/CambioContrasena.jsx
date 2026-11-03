import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cambiarContrasena } from '../../api/perfil';
import { useAuthStore } from '../../store/authStore';
import { errorDe } from '../../lib/util';
import Hoja from '../ui/Hoja';
import { Campo } from '../ui/piezas';

export default function CambioContrasena() {
  const updateUsuario = useAuthStore((s) => s.updateUsuario);
  const [f, setF] = useState({ actual: '', nueva: '', repetir: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    if (f.nueva.length < 6) return setError('La nueva contraseña necesita al menos 6 caracteres.');
    if (f.nueva !== f.repetir) return setError('Las dos contraseñas nuevas no coinciden.');
    setEnviando(true);
    try {
      await cambiarContrasena({ contrasena_actual: f.actual, nueva_contrasena: f.nueva });
      updateUsuario({ debe_cambiar_contrasena: false });
    } catch (err) {
      setError(errorDe(err, 'No se pudo cambiar la contraseña.'));
    } finally {
      setEnviando(false);
    }
  }

  const campo = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }), className: 'campo', type: 'password', required: true });

  return (
    <Hoja bloquear titulo="Crea tu contraseña" subtitulo="Es tu primer ingreso o un administrador reinició tu clave." ancho="max-w-sm">
      <form onSubmit={enviar} className="space-y-3">
        <ShieldCheck className="w-10 h-10 text-hierba" />
        <Campo etiqueta="Contraseña que te dieron"><input {...campo('actual')} autoComplete="current-password" autoFocus /></Campo>
        <Campo etiqueta="Nueva contraseña"><input {...campo('nueva')} autoComplete="new-password" /></Campo>
        <Campo etiqueta="Repite la nueva"><input {...campo('repetir')} autoComplete="new-password" /></Campo>
        {error && <p className="text-sm text-locoto">{error}</p>}
        <button className="btn-aji w-full btn-lg" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar y entrar'}</button>
      </form>
    </Hoja>
  );
}
