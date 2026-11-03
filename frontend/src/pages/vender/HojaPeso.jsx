import { useState } from 'react';
import { Delete } from 'lucide-react';
import Hoja from '../../components/ui/Hoja';
import { calcularPrecioPesable } from '../../utils/precio';
import { dinero } from '../../lib/util';
import { useMoneda } from '../../hooks/useConfig';

// Teclado numérico grande para tipear el peso en la balanza.
export default function HojaPeso({ producto, precioKg, onElegir, onCerrar }) {
  const moneda = useMoneda();
  const [txt, setTxt] = useState('');
  const peso = parseFloat(txt.replace(',', '.')) || 0;
  const precio = peso > 0 ? calcularPrecioPesable(peso, precioKg) : 0;

  const tecla = (k) => {
    if (k === '⌫') return setTxt((t) => t.slice(0, -1));
    if (k === '.' && txt.includes('.')) return;
    if (txt.includes('.') && txt.split('.')[1].length >= 3) return;
    setTxt((t) => (t === '0' && k !== '.' ? k : t + k));
  };

  return (
    <Hoja onCerrar={onCerrar} titulo={producto.nombre} subtitulo={`${dinero(precioKg, moneda)} por kilo`} ancho="max-w-sm">
      <div className="rounded-2xl bg-hundido p-4 text-right mb-3">
        <p className="num text-5xl font-bold">{txt || '0'}<span className="text-2xl text-tenue ml-1">kg</span></p>
        <p className="text-tenue num mt-1">{dinero(precio, moneda)}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => (
          <button key={k} onClick={() => tecla(k)} className="h-14 rounded-xl bg-papel border border-linea num text-2xl font-semibold active:bg-hundido">
            {k === '⌫' ? <Delete className="w-6 h-6 mx-auto" /> : k}
          </button>
        ))}
      </div>
      <button className="btn-aji btn-lg w-full mt-4" disabled={!(peso > 0)} onClick={() => onElegir(Math.round(peso * 1000) / 1000)}>
        Agregar {peso > 0 ? `${peso} kg` : ''}
      </button>
    </Hoja>
  );
}
