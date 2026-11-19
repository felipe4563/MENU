// El caracol de carga (de SNAIL/snail-loader.js, en versión mínima): camina en
// el lugar y el espiral de su concha es el spinner. Toma los colores del tema
// (claro u oscuro) y el color de marca del negocio.
//
// Los estilos (.caracol …) están en index.html y no en index.css: la pantalla
// de arranque usa el mismo dibujo antes de que cargue el CSS de la app. Si
// cambias el dibujo, cámbialo también allá.
import { cx } from '../../lib/util';

const ESPIRAL = 'M 470 271 A 160 160 0 1 1 240 415 C 240 300 330 200 418 172 L 418 353 A 67 67 0 1 1 371.6 365.1 C 364 350 368 320 370 298';

/** @param escondido  se mete en la concha (pantallas de error) */
export default function Caracol({ escondido = false, className }) {
  return (
    <svg viewBox="222 150 500 465" aria-hidden="true" className={cx('caracol', escondido && 'caracol-escondido', className)}>
      <line className="c-suelo" x1="222" y1="604" x2="722" y2="604" />
      <g className="c-asoma">
        <g className="c-cuerpo">
          <path className="c-piel" d="M 340 596 L 600 596 C 662 596 684 560 674 520 C 664 474 596 462 572 500 C 552 538 502 556 422 556 L 362 560 Q 330 574 340 596 Z" />
        </g>
        <g className="c-cabeza">
          <path className="c-boca" d="M 646 532 Q 659 545 673 531" />
          <path className="c-antena" d="M 615 490 Q 600 450 600 412" />
          <path className="c-antena-in" d="M 615 490 Q 600 450 600 412" />
          <g className="c-ojo"><circle cx="600" cy="404" r="16" /><circle className="c-pupila" cx="605" cy="406" r="7" /></g>
          <path className="c-antena" d="M 640 488 Q 662 452 670 414" />
          <path className="c-antena-in" d="M 640 488 Q 662 452 670 414" />
          <g className="c-ojo"><circle cx="670" cy="406" r="16" /><circle className="c-pupila" cx="675" cy="408" r="7" /></g>
        </g>
      </g>
      <g className="c-concha">
        <path className="c-relleno" d="M 470 271 A 160 160 0 1 1 240 415 C 240 300 330 200 418 172 L 418 271 Z" />
        <path className="c-espiral" d={ESPIRAL} />
        <path className="c-cometa" pathLength="1" d={ESPIRAL} />
      </g>
    </svg>
  );
}
