const { execFileSync, execSync, spawn } = require('child_process');
const { writeFileSync, mkdirSync, copyFileSync, existsSync, unlinkSync, readFileSync } = require('fs');
const path = require('path');
const os   = require('os');

const INSTALL_DIR       = 'C:\\AgentImpresion';
const EXE_NAME          = 'agente-impresion.exe';
const TASK_NAME         = 'AgenteImpresionTermica';
const TASK_NAME_VIGIA   = 'AgenteImpresionTermica_Vigia';
const TASK_NAME_NOTIF   = 'AgenteImpresionTermica_Notificador';

// ── Tareas programadas (XML) ──────────────────────────────────────────────────
// El CLI clásico "schtasks /create /sc ..." no permite tocar la condición de
// energía, y por defecto crea las tareas con "No iniciar en bateria" /
// "Detener si entra en bateria" activados. En una laptop (o una PC de caja que
// quede en UPS durante un corte de luz) eso hace que la tarea jamas se dispare
// aunque el trigger de inicio del sistema se cumpla. Por eso se genera la tarea
// como XML (formato Task Scheduler 1.2), que sí permite desactivar esa condición.

function xmlStartBoundaryLocal(d) {
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

// principalXml/comando por defecto = SYSTEM ejecutando el VBS del agente (sin ventana).
// La tarea notificadora pasa su propio principal (usuario interactivo, no SYSTEM) y
// comando (powershell), porque SYSTEM corre en la Sesión 0 y no puede mostrar UI
// en el escritorio del usuario — ver nota en registrarTareaNotificador().
function crearTareaXml(nombreTarea, descripcion, triggerXml, comandoArgs, opts = {}) {
  const principalXml = opts.principalXml || `    <Principal id="Author">
      <UserId>SYSTEM</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>`;
  const comando = opts.comando || 'wscript.exe';

  const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>${descripcion}</Description>
  </RegistrationInfo>
  <Triggers>
${triggerXml}
  </Triggers>
  <Principals>
${principalXml}
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${comando}</Command>
      <Arguments>${comandoArgs}</Arguments>
    </Exec>
  </Actions>
</Task>`;

  const tmpXml = path.join(os.tmpdir(), `tarea_${nombreTarea}_${Date.now()}.xml`);
  // El Programador de tareas exige el XML en UTF-16 con BOM.
  const BOM = String.fromCharCode(0xFEFF);
  writeFileSync(tmpXml, BOM + xml, 'utf16le');
  try {
    execSync(`schtasks /create /XML "${tmpXml}" /tn "${nombreTarea}" /f`, { stdio: 'pipe', timeout: 10000 });
  } finally {
    try { unlinkSync(tmpXml); } catch {}
  }
}

// ── Buscar sucursales en el servidor (endpoint público, sin login) ───────────

async function obtenerSucursales(servidor) {
  const url = servidor.replace(/\/+$/, '') + '/api/v1/sucursales/publico';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch {
    throw new Error('No se pudo conectar al servidor. Revisa la URL o tu conexión.');
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`El servidor respondió con estado ${res.status}.`);
  const body = await res.json();
  if (!body.ok || !Array.isArray(body.datos)) throw new Error('Respuesta inesperada del servidor.');
  return body.datos;
}

async function obtenerCajas(servidor, sucursal_id) {
  const url = servidor.replace(/\/+$/, '') + '/api/v1/cajas/publico?sucursal_id=' + encodeURIComponent(sucursal_id);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch {
    throw new Error('No se pudo conectar al servidor para buscar las cajas.');
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`El servidor respondió con estado ${res.status}.`);
  const body = await res.json();
  if (!body.ok || !Array.isArray(body.datos)) throw new Error('Respuesta inesperada del servidor.');
  return body.datos;
}

// ── Admin check ───────────────────────────────────────────────────────────────

function isAdmin() {
  try {
    execSync('net session', { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

function elevateAndRestart() {
  const exe = process.execPath;
  const ps  = `Start-Process -FilePath '${exe}' -Verb RunAs`;
  try {
    execFileSync('powershell.exe', ['-Command', ps]);
  } catch {}
  process.exit(0);
}

// ── PowerShell GUI form ───────────────────────────────────────────────────────

// Ancho fijo de la barra lateral de pasos (wizard) — el contenido de cada
// paso arranca en X = SIDEBAR_ANCHO + 20 en vez de X = 20.
const SIDEBAR_ANCHO = 170;
const PASOS_WIZARD = [
  { n: 1, label: 'Servidor' },
  { n: 2, label: 'Configuracion' },
  { n: 3, label: 'Cajas' },
];

// Genera el panel lateral azul con los 3 pasos del wizard, resaltando el
// paso actual. `alturaForm` es el alto total del form (el panel ocupa toda
// la altura). Se agrega directo a $form en el PS generado.
function _sidebarPS(pasoActual, alturaForm) {
  const itemsPS = PASOS_WIZARD.map((p) => {
    const activo = p.n === pasoActual;
    const completado = p.n < pasoActual;
    const marcador = completado ? 'OK' : String(p.n) + '.';
    const colorTexto = activo
      ? '[System.Drawing.Color]::White'
      : '[System.Drawing.Color]::FromArgb(147, 173, 227)';
    const fontStyle = activo ? '[System.Drawing.FontStyle]::Bold' : '[System.Drawing.FontStyle]::Regular';
    const y = 40 + (p.n - 1) * 42;
    return `
$lblPaso${p.n} = New-Object System.Windows.Forms.Label
$lblPaso${p.n}.Text      = "${marcador}  ${p.label}"
$lblPaso${p.n}.Font      = New-Object System.Drawing.Font("Segoe UI", 10, ${fontStyle})
$lblPaso${p.n}.ForeColor = ${colorTexto}
$lblPaso${p.n}.Location  = New-Object System.Drawing.Point(20, ${y})
$lblPaso${p.n}.Size      = New-Object System.Drawing.Size(140, 26)
$panelLateral.Controls.Add($lblPaso${p.n})`;
  }).join('');

  return `
$panelLateral = New-Object System.Windows.Forms.Panel
$panelLateral.BackColor = [System.Drawing.Color]::FromArgb(30, 64, 175)
$panelLateral.Location  = New-Object System.Drawing.Point(0, 0)
$panelLateral.Size      = New-Object System.Drawing.Size(${SIDEBAR_ANCHO}, ${alturaForm})
${itemsPS}
$form.Controls.Add($panelLateral)
`;
}

function pedirServidor(defaults) {
  const outFile     = path.join(os.tmpdir(), `agente_srv_${Date.now()}.txt`);
  const defServidor = defaults.servidor || 'https://';
  const defClave    = String(defaults.clave_agente || '').replace(/[^A-Za-z0-9_-]/g, '');
  const outFileSafe = outFile.replace(/\\/g, '\\\\');

  const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text            = "Agente de Impresion Termica - Paso 1 de 3"
$form.ClientSize      = New-Object System.Drawing.Size(670, 290)
$form.StartPosition   = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox     = $false
$form.MinimizeBox     = $false
$form.BackColor       = [System.Drawing.Color]::White
${_sidebarPS(1, 290)}
$lblTitulo = New-Object System.Windows.Forms.Label
$lblTitulo.Text      = "Configuracion del Agente de Impresion"
$lblTitulo.Font      = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$lblTitulo.Location  = New-Object System.Drawing.Point(190, 18)
$lblTitulo.Size      = New-Object System.Drawing.Size(450, 28)
$lblTitulo.ForeColor = [System.Drawing.Color]::FromArgb(30, 64, 175)

$lblSub = New-Object System.Windows.Forms.Label
$lblSub.Text      = "Ingresa la URL del servidor para buscar las sucursales disponibles."
$lblSub.Font      = New-Object System.Drawing.Font("Segoe UI", 8.5)
$lblSub.Location  = New-Object System.Drawing.Point(190, 48)
$lblSub.Size      = New-Object System.Drawing.Size(450, 34)
$lblSub.ForeColor = [System.Drawing.Color]::FromArgb(100, 100, 100)

$lblServidor = New-Object System.Windows.Forms.Label
$lblServidor.Text     = "URL del Servidor:"
$lblServidor.Font     = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblServidor.Location = New-Object System.Drawing.Point(190, 84)
$lblServidor.Size     = New-Object System.Drawing.Size(200, 20)

$tbServidor = New-Object System.Windows.Forms.TextBox
$tbServidor.Text     = "${defServidor}"
$tbServidor.Font     = New-Object System.Drawing.Font("Segoe UI", 9)
$tbServidor.Location = New-Object System.Drawing.Point(190, 106)
$tbServidor.Size     = New-Object System.Drawing.Size(450, 26)

$lblClave = New-Object System.Windows.Forms.Label
$lblClave.Text     = "Clave del agente (la da quien instalo el sistema; vacio si no tiene):"
$lblClave.Font     = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblClave.Location = New-Object System.Drawing.Point(190, 144)
$lblClave.Size     = New-Object System.Drawing.Size(450, 20)

$tbClave = New-Object System.Windows.Forms.TextBox
$tbClave.Text     = "${defClave}"
$tbClave.Font     = New-Object System.Drawing.Font("Consolas", 9)
$tbClave.Location = New-Object System.Drawing.Point(190, 166)
$tbClave.Size     = New-Object System.Drawing.Size(450, 26)

$btnCancelar = New-Object System.Windows.Forms.Button
$btnCancelar.Text         = "Cancelar"
$btnCancelar.Font         = New-Object System.Drawing.Font("Segoe UI", 9)
$btnCancelar.Location     = New-Object System.Drawing.Point(418, 226)
$btnCancelar.Size         = New-Object System.Drawing.Size(100, 34)
$btnCancelar.FlatStyle    = [System.Windows.Forms.FlatStyle]::Flat
$btnCancelar.DialogResult = [System.Windows.Forms.DialogResult]::Cancel

$btnSiguiente = New-Object System.Windows.Forms.Button
$btnSiguiente.Text         = "  Buscar >"
$btnSiguiente.Font         = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$btnSiguiente.BackColor    = [System.Drawing.Color]::FromArgb(37, 99, 235)
$btnSiguiente.ForeColor    = [System.Drawing.Color]::White
$btnSiguiente.FlatStyle    = [System.Windows.Forms.FlatStyle]::Flat
$btnSiguiente.Location     = New-Object System.Drawing.Point(528, 226)
$btnSiguiente.Size         = New-Object System.Drawing.Size(112, 34)
$btnSiguiente.DialogResult = [System.Windows.Forms.DialogResult]::OK

$form.Controls.AddRange(@($lblTitulo, $lblSub, $lblServidor, $tbServidor, $lblClave, $tbClave, $btnCancelar, $btnSiguiente))
$form.AcceptButton = $btnSiguiente
$form.CancelButton = $btnCancelar

$result = $form.ShowDialog()

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [System.IO.File]::WriteAllLines("${outFileSafe}", @("OK", $tbServidor.Text, $tbClave.Text))
} else {
  [System.IO.File]::WriteAllText("${outFileSafe}", "CANCEL")
}
`;

  const tmpPs = path.join(os.tmpdir(), `agente_srv_form_${Date.now()}.ps1`);
  writeFileSync(tmpPs, ps, { encoding: 'utf8' });

  try {
    execFileSync('powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', tmpPs],
      { stdio: 'ignore' });
  } finally {
    try { unlinkSync(tmpPs); } catch {}
  }

  try {
    const raw = readFileSync(outFile, 'utf8').trim().split('\n');
    unlinkSync(outFile);
    if (raw[0].trim() !== 'OK') return 'CANCEL';
    return { servidor: (raw[1] || '').trim(), clave_agente: (raw[2] || '').trim() };
  } catch { return 'CANCEL'; }
}

function showConfigForm(defaults, sucursales, instalado) {
  const outFile     = path.join(os.tmpdir(), `agente_cfg_${Date.now()}.txt`);
  const defCaja     = defaults.impresora_caja   || '';
  const defCocina   = defaults.impresora_cocina || '';
  const outFileSafe = outFile.replace(/\\/g, '\\\\');
  const subtitulo   = instalado
    ? 'El agente ya esta instalado. Puede actualizar la configuracion o desinstalarlo.'
    : 'Elige la sucursal y las impresoras, y presiona Instalar.';

  const indiceDefecto = defaults.sucursal_id
    ? sucursales.findIndex((s) => s.id === defaults.sucursal_id)
    : -1;

  const nombresSucursalesPS = sucursales
    .map((s) => `"${String(s.nombre).replace(/"/g, '\`"')}"`)
    .join(', ');

  var btnDesinstalarPS = '';
  if (instalado) {
    btnDesinstalarPS = '\n'
      + '$btnDesinstalar = New-Object System.Windows.Forms.Button\n'
      + '$btnDesinstalar.Text      = "Desinstalar"\n'
      + '$btnDesinstalar.Font      = New-Object System.Drawing.Font("Segoe UI", 9)\n'
      + '$btnDesinstalar.BackColor = [System.Drawing.Color]::FromArgb(220, 38, 38)\n'
      + '$btnDesinstalar.ForeColor = [System.Drawing.Color]::White\n'
      + '$btnDesinstalar.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat\n'
      + '$btnDesinstalar.Location  = New-Object System.Drawing.Point(190, 314)\n'
      + '$btnDesinstalar.Size      = New-Object System.Drawing.Size(115, 34)\n'
      + '$btnDesinstalar.Add_Click({\n'
      + '  $confirm = [System.Windows.Forms.MessageBox]::Show(\n'
      + '    "Desea desinstalar el agente de impresion?",\n'
      + '    "Confirmar desinstalacion",\n'
      + '    [System.Windows.Forms.MessageBoxButtons]::YesNo,\n'
      + '    [System.Windows.Forms.MessageBoxIcon]::Warning\n'
      + '  )\n'
      + '  if ($confirm -eq [System.Windows.Forms.DialogResult]::Yes) {\n'
      + '    [System.IO.File]::WriteAllText("' + outFileSafe + '", "UNINSTALL")\n'
      + '    $form.Close()\n'
      + '  }\n'
      + '})\n'
      + '$form.Controls.Add($btnDesinstalar)\n';
  }

  const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$printers = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters)

$form = New-Object System.Windows.Forms.Form
$form.Text            = "Agente de Impresion Termica - Paso 2 de 3"
$form.ClientSize      = New-Object System.Drawing.Size(670, 396)
$form.StartPosition   = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox     = $false
$form.MinimizeBox     = $false
$form.BackColor       = [System.Drawing.Color]::White
${_sidebarPS(2, 396)}
$lblTitulo = New-Object System.Windows.Forms.Label
$lblTitulo.Text      = "Configuracion del Agente de Impresion"
$lblTitulo.Font      = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$lblTitulo.Location  = New-Object System.Drawing.Point(190, 18)
$lblTitulo.Size      = New-Object System.Drawing.Size(450, 28)
$lblTitulo.ForeColor = [System.Drawing.Color]::FromArgb(30, 64, 175)

$lblSub = New-Object System.Windows.Forms.Label
$lblSub.Text      = "${subtitulo}"
$lblSub.Font      = New-Object System.Drawing.Font("Segoe UI", 8.5)
$lblSub.Location  = New-Object System.Drawing.Point(190, 48)
$lblSub.Size      = New-Object System.Drawing.Size(450, 18)
$lblSub.ForeColor = [System.Drawing.Color]::FromArgb(100, 100, 100)

$sep1 = New-Object System.Windows.Forms.Panel
$sep1.BackColor = [System.Drawing.Color]::FromArgb(220, 220, 220)
$sep1.Location  = New-Object System.Drawing.Point(190, 72)
$sep1.Size      = New-Object System.Drawing.Size(450, 1)

$lblSucursal = New-Object System.Windows.Forms.Label
$lblSucursal.Text     = "Sucursal:"
$lblSucursal.Font     = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblSucursal.Location = New-Object System.Drawing.Point(190, 84)
$lblSucursal.Size     = New-Object System.Drawing.Size(300, 20)

$cbSucursal = New-Object System.Windows.Forms.ComboBox
$cbSucursal.Font          = New-Object System.Drawing.Font("Segoe UI", 9)
$cbSucursal.Location      = New-Object System.Drawing.Point(190, 106)
$cbSucursal.Size          = New-Object System.Drawing.Size(450, 26)
$cbSucursal.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
foreach ($n in @(${nombresSucursalesPS})) { $cbSucursal.Items.Add($n) | Out-Null }
if (${indiceDefecto} -ge 0) { $cbSucursal.SelectedIndex = ${indiceDefecto} }
elseif ($cbSucursal.Items.Count -gt 0) { $cbSucursal.SelectedIndex = 0 }

$lblCaja = New-Object System.Windows.Forms.Label
$lblCaja.Text     = "Impresora de Caja (recibos):"
$lblCaja.Font     = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblCaja.Location = New-Object System.Drawing.Point(190, 146)
$lblCaja.Size     = New-Object System.Drawing.Size(300, 20)

$cbCaja = New-Object System.Windows.Forms.ComboBox
$cbCaja.Font          = New-Object System.Drawing.Font("Segoe UI", 9)
$cbCaja.Location      = New-Object System.Drawing.Point(190, 168)
$cbCaja.Size          = New-Object System.Drawing.Size(450, 26)
$cbCaja.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDown
foreach ($p in $printers) { $cbCaja.Items.Add($p) | Out-Null }
$cbCaja.Text = "${defCaja}"
if ($cbCaja.Text -eq "" -and $cbCaja.Items.Count -gt 0) { $cbCaja.SelectedIndex = 0 }

$lblCocina = New-Object System.Windows.Forms.Label
$lblCocina.Text     = "Impresora de Cocina (comandas):"
$lblCocina.Font     = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblCocina.Location = New-Object System.Drawing.Point(190, 210)
$lblCocina.Size     = New-Object System.Drawing.Size(300, 20)

$cbCocina = New-Object System.Windows.Forms.ComboBox
$cbCocina.Font          = New-Object System.Drawing.Font("Segoe UI", 9)
$cbCocina.Location      = New-Object System.Drawing.Point(190, 232)
$cbCocina.Size          = New-Object System.Drawing.Size(450, 26)
$cbCocina.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDown
foreach ($p in $printers) { $cbCocina.Items.Add($p) | Out-Null }
$cbCocina.Text = "${defCocina}"
if ($cbCocina.Text -eq "" -and $cbCocina.Items.Count -gt 0) { $cbCocina.SelectedIndex = 0 }

$sep2 = New-Object System.Windows.Forms.Panel
$sep2.BackColor = [System.Drawing.Color]::FromArgb(220, 220, 220)
$sep2.Location  = New-Object System.Drawing.Point(190, 272)
$sep2.Size      = New-Object System.Drawing.Size(450, 1)

$btnCancelar = New-Object System.Windows.Forms.Button
$btnCancelar.Text         = "Cancelar"
$btnCancelar.Font         = New-Object System.Drawing.Font("Segoe UI", 9)
$btnCancelar.Location     = New-Object System.Drawing.Point(418, 314)
$btnCancelar.Size         = New-Object System.Drawing.Size(100, 34)
$btnCancelar.FlatStyle    = [System.Windows.Forms.FlatStyle]::Flat
$btnCancelar.DialogResult = [System.Windows.Forms.DialogResult]::Cancel

$btnInstalar = New-Object System.Windows.Forms.Button
$btnInstalar.Text         = "  Instalar"
$btnInstalar.Font         = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$btnInstalar.BackColor    = [System.Drawing.Color]::FromArgb(37, 99, 235)
$btnInstalar.ForeColor    = [System.Drawing.Color]::White
$btnInstalar.FlatStyle    = [System.Windows.Forms.FlatStyle]::Flat
$btnInstalar.Location     = New-Object System.Drawing.Point(528, 314)
$btnInstalar.Size         = New-Object System.Drawing.Size(112, 34)
$btnInstalar.DialogResult = [System.Windows.Forms.DialogResult]::OK

$form.Controls.AddRange(@(
  $lblTitulo, $lblSub, $sep1,
  $lblSucursal, $cbSucursal,
  $lblCaja, $cbCaja,
  $lblCocina, $cbCocina,
  $sep2, $btnCancelar, $btnInstalar
))
$form.AcceptButton = $btnInstalar
$form.CancelButton = $btnCancelar

${btnDesinstalarPS}

$result = $form.ShowDialog()

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  $lines = @("OK", $cbSucursal.SelectedIndex, $cbCaja.Text, $cbCocina.Text)
  [System.IO.File]::WriteAllLines("${outFileSafe}", $lines)
} elseif (-not [System.IO.File]::Exists("${outFileSafe}")) {
  [System.IO.File]::WriteAllText("${outFileSafe}", "CANCEL")
}
`;

  const tmpPs = path.join(os.tmpdir(), `agente_form_${Date.now()}.ps1`);
  writeFileSync(tmpPs, ps, { encoding: 'utf8' });

  try {
    execFileSync('powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', tmpPs],
      { stdio: 'ignore' });
  } finally {
    try { unlinkSync(tmpPs); } catch {}
  }

  try {
    const raw = readFileSync(outFile, 'utf8').trim().split('\n');
    unlinkSync(outFile);
    const first = raw[0].trim();
    if (first === 'UNINSTALL') return 'UNINSTALL';
    if (first !== 'OK') return 'CANCEL';

    const indiceElegido = parseInt((raw[1] || '').trim(), 10);
    const sucursalElegida = sucursales[indiceElegido];
    if (!sucursalElegida) return 'CANCEL';

    return {
      sucursal_id:      sucursalElegida.id,
      impresora_caja:   (raw[2] || '').trim(),
      impresora_cocina: (raw[3] || '').trim(),
    };
  } catch { return 'CANCEL'; }
}

// Solo se muestra cuando la sucursal elegida tiene más de una caja registrada
// (si tiene 0 o 1, no hace falta preguntar — ver main()). Selección múltiple:
// una misma PC puede imprimir los tickets de venta de más de una caja (ej.
// una sola impresora atendiendo dos puntos de cobro).
function pedirCajas(cajas, defaults) {
  const outFile      = path.join(os.tmpdir(), `agente_caja_${Date.now()}.txt`);
  const outFileSafe  = outFile.replace(/\\/g, '\\\\');
  const idsDefecto   = new Set(defaults.caja_ids || []);
  const indicesDefectoPS = cajas
    .map((c, i) => i)
    .filter((i) => idsDefecto.has(cajas[i].id))
    .join(', ');
  const nombresCajasPS = cajas
    .map((c) => `"${String(c.nombre).replace(/"/g, '\`"')}"`)
    .join(', ');

  const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text            = "Agente de Impresion Termica - Paso 3 de 3"
$form.ClientSize      = New-Object System.Drawing.Size(670, 280)
$form.StartPosition   = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox     = $false
$form.MinimizeBox     = $false
$form.BackColor       = [System.Drawing.Color]::White
${_sidebarPS(3, 280)}
$lblTitulo = New-Object System.Windows.Forms.Label
$lblTitulo.Text      = "Esta sucursal tiene mas de una caja"
$lblTitulo.Font      = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$lblTitulo.Location  = New-Object System.Drawing.Point(190, 18)
$lblTitulo.Size      = New-Object System.Drawing.Size(450, 28)
$lblTitulo.ForeColor = [System.Drawing.Color]::FromArgb(30, 64, 175)

$lblSub = New-Object System.Windows.Forms.Label
$lblSub.Text      = "Marca a que caja(s) pertenece esta PC - puede ser mas de una si esta impresora atiende varios puntos de cobro."
$lblSub.Font      = New-Object System.Drawing.Font("Segoe UI", 8.5)
$lblSub.Location  = New-Object System.Drawing.Point(190, 48)
$lblSub.Size      = New-Object System.Drawing.Size(450, 34)
$lblSub.ForeColor = [System.Drawing.Color]::FromArgb(100, 100, 100)

$lblCaja = New-Object System.Windows.Forms.Label
$lblCaja.Text     = "Cajas:"
$lblCaja.Font     = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblCaja.Location = New-Object System.Drawing.Point(190, 84)
$lblCaja.Size     = New-Object System.Drawing.Size(200, 20)

$clbCajas = New-Object System.Windows.Forms.CheckedListBox
$clbCajas.Font          = New-Object System.Drawing.Font("Segoe UI", 9)
$clbCajas.Location      = New-Object System.Drawing.Point(190, 106)
$clbCajas.Size          = New-Object System.Drawing.Size(450, 110)
$clbCajas.CheckOnClick  = $true
foreach ($n in @(${nombresCajasPS})) { $clbCajas.Items.Add($n) | Out-Null }
$indicesDefecto = @(${indicesDefectoPS})
if ($indicesDefecto.Count -gt 0) {
  foreach ($i in $indicesDefecto) { $clbCajas.SetItemChecked($i, $true) }
} elseif ($clbCajas.Items.Count -gt 0) {
  $clbCajas.SetItemChecked(0, $true)
}

$btnCancelar = New-Object System.Windows.Forms.Button
$btnCancelar.Text         = "Cancelar"
$btnCancelar.Font         = New-Object System.Drawing.Font("Segoe UI", 9)
$btnCancelar.Location     = New-Object System.Drawing.Point(418, 226)
$btnCancelar.Size         = New-Object System.Drawing.Size(100, 34)
$btnCancelar.FlatStyle    = [System.Windows.Forms.FlatStyle]::Flat
$btnCancelar.DialogResult = [System.Windows.Forms.DialogResult]::Cancel

$btnInstalar = New-Object System.Windows.Forms.Button
$btnInstalar.Text         = "  Instalar"
$btnInstalar.Font         = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$btnInstalar.BackColor    = [System.Drawing.Color]::FromArgb(37, 99, 235)
$btnInstalar.ForeColor    = [System.Drawing.Color]::White
$btnInstalar.FlatStyle    = [System.Windows.Forms.FlatStyle]::Flat
$btnInstalar.Location     = New-Object System.Drawing.Point(528, 226)
$btnInstalar.Size         = New-Object System.Drawing.Size(112, 34)
$btnInstalar.Add_Click({
  if ($clbCajas.CheckedIndices.Count -eq 0) {
    [System.Windows.Forms.MessageBox]::Show("Marca al menos una caja.", "Dato requerido", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
    return
  }
  $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
  $form.Close()
})

$form.Controls.AddRange(@($lblTitulo, $lblSub, $lblCaja, $clbCajas, $btnCancelar, $btnInstalar))
$form.CancelButton = $btnCancelar

$result = $form.ShowDialog()

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  $indices = @($clbCajas.CheckedIndices | ForEach-Object { $_ })
  [System.IO.File]::WriteAllLines("${outFileSafe}", @("OK", ($indices -join ',')))
} else {
  [System.IO.File]::WriteAllText("${outFileSafe}", "CANCEL")
}
`;

  const tmpPs = path.join(os.tmpdir(), `agente_caja_form_${Date.now()}.ps1`);
  writeFileSync(tmpPs, ps, { encoding: 'utf8' });

  try {
    execFileSync('powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', tmpPs],
      { stdio: 'ignore' });
  } finally {
    try { unlinkSync(tmpPs); } catch {}
  }

  try {
    const raw = readFileSync(outFile, 'utf8').trim().split('\n');
    unlinkSync(outFile);
    if (raw[0].trim() !== 'OK') return 'CANCEL';
    const indices = (raw[1] || '').trim().split(',').filter(Boolean).map((s) => parseInt(s, 10));
    const idsElegidos = indices.map((i) => cajas[i]?.id).filter((id) => id != null);
    return idsElegidos;
  } catch { return 'CANCEL'; }
}

// ── Mensaje de resultado ──────────────────────────────────────────────────────

function showMessage(titulo, mensaje, error = false) {
  const icon  = error ? 'Stop' : 'Information';
  const ps    = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show(
  "${mensaje.replace(/"/g, "'").replace(/\n/g, '`n')}",
  "${titulo}",
  [System.Windows.Forms.MessageBoxButtons]::OK,
  [System.Windows.Forms.MessageBoxIcon]::${icon}
)`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { stdio: 'ignore' });
  } catch {}
}

// ── Notificador de estado (globo al iniciar sesión) ──────────────────────────
// Espera un poco, consulta el /salud local del agente con reintentos (por si
// arrancó recién y todavía se está conectando) y muestra un globo confirmando
// si quedó activo o no. Se registra como tarea aparte porque corre en la
// sesión del usuario, no como SYSTEM (ver comentario en registrarTareaNotificador).
function registrarTareaNotificador() {
  const ps1Path = path.join(INSTALL_DIR, 'notificador.ps1');
  const ps1 = `Start-Sleep -Seconds 15
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Reintenta durante ~3.25 minutos: recién arrancada la PC hay mucha competencia
# por CPU/disco (otros programas de inicio), así que el primer intento del
# agente puede tardar o fallar. La tarea vigía ya lo relanza sola cada 2 min
# si hace falta — este aviso espera a que ese ciclo tenga chance de resolverlo
# solo, en vez de alarmar de más por algo que se autocorrige.
$ok = $false
for ($i = 0; $i -lt 12; $i++) {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:4321/salud" -TimeoutSec 3
    if ($r.ok) { $ok = $true; break }
  } catch {}
  Start-Sleep -Seconds 15
}

$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Visible = $true
if ($ok) {
  $icon.Icon = [System.Drawing.SystemIcons]::Information
  $icon.BalloonTipTitle = "Agente de impresion"
  $icon.BalloonTipText  = "Activo y listo para imprimir."
  $icon.BalloonTipIcon  = [System.Windows.Forms.ToolTipIcon]::Info
} else {
  $icon.Icon = [System.Drawing.SystemIcons]::Warning
  $icon.BalloonTipTitle = "Agente de impresion"
  $icon.BalloonTipText  = "No responde. Reinicia la PC o avisa a soporte."
  $icon.BalloonTipIcon  = [System.Windows.Forms.ToolTipIcon]::Warning
}
$icon.ShowBalloonTip(8000)
Start-Sleep -Seconds 9
$icon.Visible = $false
$icon.Dispose()
`;
  writeFileSync(ps1Path, ps1, 'utf8');

  // GroupId = SID del grupo integrado "Users": hace que la tarea corra en la
  // sesión del usuario que inicia sesión (quien sea), no como SYSTEM — por eso
  // sí puede mostrar el globo. El LogonTrigger sin <UserId> se dispara para
  // cualquier usuario que inicie sesión.
  crearTareaXml(
    TASK_NAME_NOTIF,
    'Agente de impresion termica - aviso de estado al iniciar sesion',
    `    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>`,
    `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${ps1Path}"`,
    {
      comando: 'powershell.exe',
      principalXml: `    <Principal id="Author">
      <GroupId>S-1-5-32-545</GroupId>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>`,
    }
  );
}

// ── Detener el agente en ejecución (para poder actualizar su .exe) ──────────
// Windows bloquea el .exe mientras el proceso del agente está corriendo, así
// que reinstalar/actualizar sobre una instalación existente fallaba con
// EBUSY al intentar copiar el archivo. Reutiliza la misma técnica que
// uninstall() ya usaba: matar por PID leído del lock file, nunca por nombre
// (matar por nombre mataría también a este propio instalador).
function detenerAgenteEnEjecucion() {
  const lockFile = path.join(INSTALL_DIR, 'agente.lock');
  let pid = null;
  try {
    if (existsSync(lockFile)) {
      const raw = readFileSync(lockFile, 'utf8').trim();
      if (raw && !isNaN(parseInt(raw, 10))) pid = parseInt(raw, 10);
    }
  } catch {}
  if (!pid) return;

  try { execSync('taskkill /F /PID ' + pid, { stdio: 'pipe' }); } catch {}

  // taskkill devuelve el control antes de que Windows libere el archivo del
  // proceso muerto — se sondea hasta 5s (taskkill /FI + ping como sleep, sin
  // depender de setTimeout/async) antes de intentar copiar encima.
  const limite = Date.now() + 5000;
  while (Date.now() < limite) {
    try {
      const out = execSync('tasklist /FI "PID eq ' + pid + '" /NH', { encoding: 'utf8' });
      if (!out.includes(String(pid))) break;
    } catch { break; }
    try { execSync('ping 127.0.0.1 -n 1 -w 300 > nul', { stdio: 'ignore' }); } catch {}
  }

  try { unlinkSync(lockFile); } catch {}
}

// ── Instalación ───────────────────────────────────────────────────────────────

function install(cfg) {
  try {
    // 1. Crear directorio de instalación
    mkdirSync(INSTALL_DIR, { recursive: true });

    // 1.5. Si ya había un agente corriendo (actualización sobre instalación
    //      existente), detenerlo primero — si no, el paso siguiente falla con
    //      EBUSY porque Windows tiene el .exe bloqueado.
    detenerAgenteEnEjecucion();

    // 2. Copiar el exe al directorio de instalación
    const srcExe = process.execPath;
    const dstExe = path.join(INSTALL_DIR, EXE_NAME);
    if (srcExe !== dstExe) {
      copyFileSync(srcExe, dstExe);
    }

    // 3. Escribir config.json
    writeFileSync(
      path.join(INSTALL_DIR, 'config.json'),
      JSON.stringify(cfg, null, 2),
      'utf8'
    );

    // 4. Crear VBScript launcher para iniciar el agente sin ventana visible
    const vbsPath = path.join(INSTALL_DIR, 'start-agent.vbs');
    writeFileSync(vbsPath,
      'Set WshShell = CreateObject("WScript.Shell")\n' +
      'WshShell.Run Chr(34) & "' + dstExe.replace(/\\/g, '\\\\') + '" & Chr(34) & " --service", 0, False\n',
      'utf8'
    );

    // 5. Registrar tareas en el Programador de tareas de Windows (via VBScript = sin ventana).
    //    Corren como SYSTEM para no depender de que alguien inicie sesión en Windows,
    //    y con la condición de bateria desactivada explicitamente (por defecto
    //    schtasks NO inicia la tarea si la PC esta en bateria — en una laptop, o
    //    una PC de caja en UPS durante un corte, eso hace que nunca arranque):
    //      - TASK_NAME: al encender/reiniciar la PC (antes del login).
    //      - TASK_NAME_VIGIA: cada 2 min, relanza el agente si se cayó. El propio
    //        agent.js ya se auto-descarta (agente.lock) si detecta que ya hay una
    //        instancia corriendo, así que esto no genera duplicados.
    const comandoArgs = `"${vbsPath}"`;

    crearTareaXml(
      TASK_NAME,
      'Agente de impresion termica automatica (caja + cocina) - inicio del sistema',
      `    <BootTrigger>
      <Enabled>true</Enabled>
      <Delay>PT10S</Delay>
    </BootTrigger>`,
      comandoArgs
    );

    crearTareaXml(
      TASK_NAME_VIGIA,
      'Agente de impresion termica automatica (caja + cocina) - vigia cada 2 min',
      `    <TimeTrigger>
      <Enabled>true</Enabled>
      <StartBoundary>${xmlStartBoundaryLocal(new Date())}</StartBoundary>
      <Repetition>
        <Interval>PT2M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </TimeTrigger>`,
      comandoArgs
    );

    // 6. Notificador visual: el agente corre como SYSTEM en la Sesión 0, así que
    //    NO puede mostrar ninguna ventana/aviso en el escritorio (aislamiento de
    //    sesiones de Windows) — por eso hasta ahora no había forma de saber, con
    //    solo mirar la pantalla, si arrancó solo tras apagar/prender la PC. Esta
    //    tarea corre en la sesión del usuario que inicia sesión (no SYSTEM), así
    //    que sí puede mostrar un globo de notificación confirmando el estado.
    registrarTareaNotificador();

    // 7. Iniciar el agente inmediatamente (detached, sin ventana)
    spawn(dstExe, ['--service'], {
      detached: true,
      stdio:    'ignore',
      windowsHide: true,
    }).unref();

    showMessage(
      'Instalación completada',
      `El agente de impresión fue instalado correctamente en:\n${INSTALL_DIR}\n\nEl servicio se iniciará automáticamente al encender o reiniciar la PC (sin necesidad de iniciar sesión), y se reactivará solo si llegara a cerrarse.\n\nCada vez que alguien inicie sesión en Windows, aparecerá un aviso confirmando si el agente está activo.`
    );

  } catch (err) {
    showMessage('Error de instalación', `Ocurrió un error:\n${err.message}`, true);
  }
}

// ── Verificar si ya está instalado ───────────────────────────────────────────

function yaInstalado() {
  return existsSync(path.join(INSTALL_DIR, EXE_NAME));
}

function leerConfigInstalada() {
  try {
    return JSON.parse(require('fs').readFileSync(path.join(INSTALL_DIR, 'config.json'), 'utf8'));
  } catch { return {}; }
}

// ── Desinstalación ────────────────────────────────────────────────────────────

function uninstall() {
  try {
    // 1. Eliminar las tareas del Programador de tareas PRIMERO — si se mata el
    //    proceso antes, la tarea vigía (corre cada 2 min) podría relanzarlo
    //    justo en ese hueco.
    for (const tn of [TASK_NAME, TASK_NAME_VIGIA, TASK_NAME_NOTIF]) {
      try { execSync(`schtasks /delete /tn "${tn}" /f`, { stdio: 'pipe' }); } catch {}
    }

    // 2. Matar solo el proceso del agente (por PID del lock file, no por nombre)
    //    Matar por nombre mataría también al propio instalador
    const lockFile = path.join(INSTALL_DIR, 'agente.lock');
    try {
      if (existsSync(lockFile)) {
        const pid = require('fs').readFileSync(lockFile, 'utf8').trim();
        if (pid && !isNaN(parseInt(pid, 10))) {
          execSync('taskkill /F /PID ' + pid, { stdio: 'pipe' });
        }
      }
    } catch {}

    // 3. Mostrar mensaje ANTES de borrar el directorio (el instalador puede correr desde ahí)
    showMessage(
      'Desinstalacion completada',
      'El agente de impresion fue eliminado correctamente.\n\nYa no se iniciara automaticamente con Windows.'
    );

    // 4. Crear batch que borra el directorio después de que este proceso salga
    const bat = path.join(os.tmpdir(), 'desinstalar_agente_' + Date.now() + '.bat');
    writeFileSync(bat,
      '@echo off\n' +
      'ping 127.0.0.1 -n 4 > nul\n' +
      'rmdir /S /Q "' + INSTALL_DIR + '"\n' +
      'del "%~f0"\n',
      'utf8'
    );
    spawn('cmd.exe', ['/C', bat], { detached: true, stdio: 'ignore', windowsHide: true }).unref();

    process.exit(0);
  } catch (err) {
    showMessage('Error al desinstalar', 'Ocurrio un error:\n' + err.message, true);
  }
}

// ── Entrada principal ─────────────────────────────────────────────────────────

async function main() {
  if (!process.pkg) {
    console.log('[DEV] Modo desarrollo — usa "node index.js --service" para correr el agente.');
    process.exit(0);
  }

  if (!isAdmin()) {
    elevateAndRestart();
    return;
  }

  try {
    const instalado = yaInstalado();
    const defaults  = instalado ? leerConfigInstalada() : {};

    // Paso 1: pedir la URL del servidor y buscar sus sucursales (reintenta si falla)
    let servidor = defaults.servidor || '';
    let clave_agente = defaults.clave_agente || '';
    let sucursales = null;

    while (!sucursales) {
      const paso1 = pedirServidor({ servidor, clave_agente });
      if (!paso1 || paso1 === 'CANCEL') {
        process.exit(0);
        return;
      }

      servidor = paso1.servidor.trim().replace(/\/+$/, '');
      clave_agente = paso1.clave_agente;
      if (!servidor) {
        showMessage('Dato requerido', 'Ingresa la URL del servidor.', true);
        continue;
      }

      try {
        const encontradas = await obtenerSucursales(servidor);
        if (!encontradas.length) {
          showMessage('Sin sucursales', 'El servidor respondió, pero no hay sucursales activas registradas todavía.', true);
          continue;
        }
        sucursales = encontradas;
      } catch (err) {
        showMessage('No se pudo conectar', `No se pudo obtener la lista de sucursales de:\n${servidor}\n\n${err.message}\n\nVerifica la URL e intenta de nuevo.`, true);
      }
    }

    // Paso 2: elegir sucursal e impresoras
    const resultado = showConfigForm({ ...defaults, servidor }, sucursales, instalado);

    if (!resultado || resultado === 'CANCEL') {
      process.exit(0);
      return;
    }

    if (resultado === 'UNINSTALL') {
      uninstall();
      return;
    }

    if (!resultado.impresora_caja || !resultado.impresora_cocina) {
      showMessage('Datos incompletos', 'Por favor completa las impresoras antes de instalar.', true);
      return main();
    }

    // Paso 3 (solo si aplica): si la sucursal elegida tiene más de una caja
    // registrada, hay que saber a cuál(es) pertenece esta PC — si no, el
    // ticket de venta (por el respaldo de socket) podría imprimirse también
    // en la impresora de otra caja de la misma sucursal. Una PC puede
    // pertenecer a más de una caja (una sola impresora para varios puntos
    // de cobro).
    let caja_ids = [];
    // Compatibilidad con instalaciones previas a la selección múltiple, que
    // guardaban un único `caja_id` en vez de `caja_ids`.
    const defaultsCajaIds = defaults.caja_ids || (defaults.caja_id ? [defaults.caja_id] : []);
    try {
      const cajas = await obtenerCajas(servidor, resultado.sucursal_id);
      if (cajas.length === 1) {
        caja_ids = [cajas[0].id];
      } else if (cajas.length > 1) {
        const elegidas = pedirCajas(cajas, { caja_ids: defaultsCajaIds });
        if (elegidas === 'CANCEL') { process.exit(0); return; }
        caja_ids = elegidas;
      }
    } catch (err) {
      showMessage('Aviso', `No se pudo verificar las cajas de la sucursal:\n${err.message}\n\nSe instalará sin asignar a una caja específica.`);
    }

    install({
      servidor, sucursal_id: resultado.sucursal_id,
      impresora_caja: resultado.impresora_caja, impresora_cocina: resultado.impresora_cocina,
      caja_ids,
      // La clave solo se guarda si se escribió; el codepage elegido a mano en
      // config.json se conserva al reinstalar.
      ...(clave_agente ? { clave_agente } : {}),
      ...(defaults.codepage ? { codepage: defaults.codepage } : {}),
    });
  } catch (err) {
    showMessage('Error inesperado', `El instalador encontró un error:\n${err.message}`, true);
    process.exit(1);
  }
}

main();
