/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '../../core/api/client';
import { useAuth } from '../../core/auth/useAuth';
import { useToast } from '../../core/ui/ToastContext';
import { GraduationCap, Calendar, X, FileSpreadsheet, SearchX, Eye } from 'lucide-react';

function useSafeToast() {
  try {
    return useToast();
  } catch {
    const noop = () => {};
    return {
      toast: { success: noop, error: noop, warning: noop, info: noop, dismiss: noop, clear: noop },
      success: noop,
      error: noop,
      warning: noop,
      info: noop,
      showSuccess: noop,
      showError: noop,
      showWarning: noop,
      showInfo: noop,
      dismiss: noop,
      clear: noop,
      toasts: [],
    };
  }
}

export function CoordinatorSupervision() {
  const { user } = useAuth();
  const { toast } = useSafeToast();
  const [loading, setLoading] = useState(false);
  const [programs, setPrograms] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [malla, setMalla] = useState([]);
  
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  
  const [selectedViewUD, setSelectedViewUD] = useState(null);
  const [udStudents, setUdStudents] = useState([]);
  const [loadingUD, setLoadingUD] = useState(false);

  // Bloquear scroll del body y cerrar con Escape mientras el acta está abierta.
  // El modal se renderiza en un Portal (document.body) para que `fixed inset-0`
  // no quede atrapado por el `transform` de `.animate-fade-in` del contenedor
  // ni por debajo del navbar sticky (z-50). Sin portal, el acta quedaba
  // recortada/oculta debajo del header.
  useEffect(() => {
    if (!selectedViewUD) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedViewUD(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [selectedViewUD]);

  // Initial data load
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const [progRes, perRes, personalRes] = await Promise.all([
          apiClient.request('/api/mod-programas-estudio/programas').catch(() => []),
          apiClient.request('/api/mod-programas-estudio/periodos').catch(() => []),
          apiClient.request('/api/mod-usuarios/personal').catch(() => [])
        ]);
        
        setPrograms(progRes || []);
        setPeriods(perRes || []);
        
        let hasProgram = false;
        if (personalRes && user) {
          const myProfile = personalRes.find(p => p?.usuario?.id === user.id);
          if (myProfile?.perfil?.programa_estudio_id) {
            setSelectedProgram(myProfile.perfil.programa_estudio_id.toString());
            hasProgram = true;
          }
        }
        
        if (!hasProgram && progRes && progRes.length > 0) {
          setSelectedProgram(progRes[0].id.toString());
        }
        
        if (perRes && perRes.length > 0) {
          const active = perRes.find(p => ['ACTIVO', 'activo', 'matricula_abierta', 'en_curso'].includes(p.estado)) || perRes[0];
          setSelectedPeriod(active ? active.id.toString() : perRes[0].id.toString());
        }
      } catch (e) {
        console.error('Error fetching initial data', e);
      }
    };
    if (user) fetchInitial();
  }, [user]);

  // Load Malla when program is selected
  useEffect(() => {
    if (!selectedProgram) {
      setMalla([]);
      setSelectedViewUD(null);
      return;
    }
    const fetchMalla = async () => {
      setLoading(true);
      try {
        const res = await apiClient.request(`/api/mod-programas-estudio/programas/${selectedProgram}/malla`);
        // Avance real de notas por unidad (matriculados vs. notas registradas)
        const resumen = selectedPeriod
          ? await apiClient.request(`/api/mod-evaluacion/resumen/periodo/${selectedPeriod}`).catch(() => [])
          : [];
        const avancePorUnidad = new Map((resumen || []).map(r => [r.unidad_didactica_id, r.porcentaje]));
        const enhancedMalla = (res || []).map(modulo => ({
          ...modulo,
          unidades: modulo.unidades.map(u => ({
            ...u,
            completion: avancePorUnidad.get(u.id) ?? 0,
            isEmpleabilidad: /comunicaci|ingl[eé]s|ofim[aá]tica|emprendimiento/i.test(u.nombre) || /empleabilidad|transversal/i.test(modulo.nombre)
          }))
        }));
        setMalla(enhancedMalla);
      } catch (e) {
        console.error('Error fetching malla', e);
      }
      setLoading(false);
    };
    fetchMalla();
  }, [selectedProgram, selectedPeriod]);

  const handleViewActa = async (unidad, moduloNombre) => {
    if (!selectedPeriod) {
      toast.warning("Por favor, seleccione un periodo académico primero.");
      return;
    }
    setSelectedViewUD({ ...unidad, moduloNombre });
    setLoadingUD(true);
    try {
      const enrolled = await apiClient.request(`/api/mod-gestion-academica/matriculas/unidad/${unidad.id}/periodo/${selectedPeriod}`).catch(() => []);
      const grades = await apiClient.request(`/api/mod-evaluacion/registros/unidad/${unidad.id}/periodo/${selectedPeriod}`).catch(() => []);
      
      const combined = enrolled.map(est => {
        const gradeRecord = grades.find(g => g.matricula_detalle_id === est.matricula_detalle_id);
        
        return {
          id: est.id,
          dni: est.dni || '',
          codigo: est.codigo_estudiante || '',
          name: `${est.apellidos}, ${est.nombres}`,
          nota_final: gradeRecord?.nota_final ?? '-',
          estado: gradeRecord?.estado || 'Sin Registrar'
        };
      });
      
      combined.sort((a, b) => a.name.localeCompare(b.name));
      setUdStudents(combined);
    } catch (e) {
      console.error('Error fetching actas', e);
    }
    setLoadingUD(false);
  };

  const NOTAS_LETRAS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
    'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'];

  const handleExportActaPDF = () => {
    if (!selectedViewUD) return;
    if (loadingUD) {
      toast.info('Espere a que terminen de cargar las notas.');
      return;
    }
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const prog = programs.find(p => String(p.id) === String(selectedProgram));
    const per = periods.find(p => String(p.id) === String(selectedPeriod));
    const fecha = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
    const aprobados = udStudents.filter(s => String(s.estado).toLowerCase() === 'aprobado').length;
    const desaprobados = udStudents.filter(s => String(s.estado).toLowerCase() === 'desaprobado').length;
    const filas = udStudents.map((s, i) => {
      const n = parseInt(s.nota_final, 10);
      const letras = Number.isFinite(n) && n >= 0 && n <= 20 ? NOTAS_LETRAS[n] : '—';
      return `<tr>
        <td class="c">${i + 1}</td>
        <td class="c">${esc(s.dni || s.codigo)}</td>
        <td>${esc(s.name)}</td>
        <td class="c b">${esc(s.nota_final)}</td>
        <td class="c">${esc(letras)}</td>
        <td class="c">${esc(s.estado)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="c">Sin estudiantes matriculados en esta unidad didáctica.</td></tr>';

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Acta_${esc(selectedViewUD.nombre)}_${esc(per?.codigo || '')}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; }
  .head { text-align: center; margin-bottom: 10px; }
  .head h1 { font-size: 14px; margin: 0; letter-spacing: .5px; }
  .head h2 { font-size: 12px; margin: 4px 0 0; font-weight: normal; }
  .head h3 { font-size: 13px; margin: 10px 0 0; text-decoration: underline; }
  table.meta { width: 100%; border-collapse: collapse; margin: 10px 0; }
  table.meta td { padding: 3px 4px; vertical-align: top; }
  table.meta td.k { font-weight: bold; width: 22%; }
  table.notas { width: 100%; border-collapse: collapse; }
  table.notas th, table.notas td { border: 1px solid #333; padding: 4px 5px; }
  table.notas th { background: #e5e7eb; font-size: 10px; text-transform: uppercase; }
  .c { text-align: center; } .b { font-weight: bold; }
  .resumen { margin-top: 10px; }
  .firmas { display: flex; justify-content: space-around; margin-top: 60px; }
  .firma { width: 40%; text-align: center; border-top: 1px solid #111; padding-top: 4px; font-size: 10px; }
  .pie { margin-top: 24px; font-size: 9px; color: #555; text-align: right; }
</style></head><body>
  <div class="head">
    <h1>INSTITUTO DE EDUCACIÓN SUPERIOR TECNOLÓGICO PÚBLICO «SUIZA»</h1>
    <h2>Sistema Integrado de Gestión Académica — SIGA</h2>
    <h3>ACTA DE EVALUACIÓN DE LA UNIDAD DIDÁCTICA</h3>
  </div>
  <table class="meta">
    <tr><td class="k">Programa de estudios:</td><td>${esc(prog?.nombre || '')}</td><td class="k">Periodo académico:</td><td>${esc(per?.codigo || '')}</td></tr>
    <tr><td class="k">Módulo formativo:</td><td colspan="3">${esc(selectedViewUD.moduloNombre || '')}</td></tr>
    <tr><td class="k">Unidad didáctica:</td><td colspan="3">${esc(selectedViewUD.nombre)}</td></tr>
    <tr><td class="k">Créditos:</td><td>${esc(selectedViewUD.creditos ?? '')}</td><td class="k">Fecha de emisión:</td><td>${esc(fecha)}</td></tr>
  </table>
  <table class="notas">
    <thead><tr><th style="width:5%">N°</th><th style="width:14%">DNI / Código</th><th>Apellidos y nombres</th><th style="width:9%">Nota</th><th style="width:14%">En letras</th><th style="width:14%">Condición</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="resumen"><b>Resumen:</b> Matriculados: ${udStudents.length} · Aprobados: ${aprobados} · Desaprobados: ${desaprobados} · Sin registrar: ${udStudents.length - aprobados - desaprobados}. Escala vigesimal (0–20), nota mínima aprobatoria: 13.</div>
  <div class="firmas">
    <div class="firma">Docente de la unidad didáctica</div>
    <div class="firma">Coordinador(a) del programa de estudios</div>
  </div>
  <div class="firmas" style="margin-top:50px">
    <div class="firma">Jefe(a) de Unidad Académica</div>
    <div class="firma">Secretaría Académica</div>
  </div>
  <div class="pie">Documento generado por SIGA el ${esc(new Date().toLocaleString('es-PE'))}</div>
</body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      toast.error('No se pudo preparar el acta para impresión.');
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        toast.success('Acta lista: elija «Guardar como PDF» en la ventana de impresión.');
      } catch (err) {
        console.error('Error al imprimir acta', err);
        toast.error('No se pudo abrir la impresión del acta.');
      }
      setTimeout(() => iframe.remove(), 60000);
    }, 300);
  };

  const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []);
  const isCoordinador = !user?.is_superuser && userRoles.includes('coordinador_programa');

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h3 className="text-3xl font-bold tracking-tight text-slate-text">
            Supervisión de <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary-dark">Actas y Evaluación</span>
          </h3>
          <p className="text-slate-500 text-sm mt-1">Vista gerencial para Coordinadores de Programa y Secretaría</p>
        </div>
      </div>

      {/* Contexto Operativo Informativo */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between border-l-4 border-l-primary mb-6 bg-gradient-to-r from-white to-slate-50">
        <div className="flex items-center space-x-3 w-full md:w-auto flex-1">
          <div className="w-10 h-10 rounded-full bg-primary-soft flex items-center justify-center text-primary flex-shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="w-full">
            <p className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Programa de Estudios</p>
            {isCoordinador ? (
              <div className="w-full bg-transparent font-bold text-slate-800 border-none p-0 text-sm mt-1">
                {programs.find(p => p.id.toString() === selectedProgram)?.nombre || "Cargando..."}
              </div>
            ) : (
              <select 
                className="w-full bg-transparent font-bold text-slate-800 border-none p-0 focus:ring-0 cursor-pointer text-sm"
                value={selectedProgram}
                onChange={(e) => setSelectedProgram(e.target.value)}
              >
                <option value="" disabled>Seleccione un programa...</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id.toString()}>{p.nombre}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="h-8 w-px bg-slate-200 hidden md:block"></div>
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="w-10 h-10 rounded-full bg-primary-soft flex items-center justify-center text-primary flex-shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="w-full">
            <p className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Periodo Activo</p>
            {isCoordinador ? (
              <div className="w-full bg-transparent font-bold text-slate-800 border-none p-0 text-sm mt-1">
                {periods.find(p => p.id.toString() === selectedPeriod)?.codigo || "Cargando..."}
              </div>
            ) : (
              <select 
                className="w-full bg-transparent font-bold text-slate-800 border-none p-0 focus:ring-0 cursor-pointer text-sm"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
              >
                <option value="" disabled>Seleccione un periodo...</option>
                {periods.map(p => (
                  <option key={p.id} value={p.id.toString()}>{p.codigo}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="py-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {selectedProgram && selectedPeriod && !loading && (
        <div className="space-y-6 mt-6">
          <h4 className="text-xl font-bold text-slate-text border-b pb-2">Estado de Actas por Módulo Formativo</h4>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {malla.map(modulo => (
              <div key={modulo.id} className="glass-card p-0 overflow-hidden shadow-md">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white p-4">
                  <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Ciclo {modulo.periodo}</div>
                  <h5 className="font-semibold">{modulo.nombre}</h5>
                </div>
                <div className="p-4 space-y-4">
                  {modulo.unidades.map(u => (
                    <div key={u.id} className="flex flex-col border border-slate-100 rounded-lg p-3 hover:shadow-sm transition-all bg-white/50">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-bold text-slate-text text-sm block">{u.nombre}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${u.isEmpleabilidad ? 'bg-amber-100 text-amber-700' : 'bg-primary-soft text-primary'}`}>
                            {u.isEmpleabilidad ? 'Transversal / Empleabilidad' : 'Específica'}
                          </span>
                        </div>
                        <button 
                          onClick={() => handleViewActa(u, modulo.nombre)}
                          className="text-xs bg-primary-soft hover:bg-primary/20 text-primary font-semibold py-1.5 px-3 rounded-lg transition-colors border border-primary/20 flex items-center"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" /> Ver Acta
                        </button>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 mt-2 overflow-hidden">
                        <div className={`h-2.5 rounded-full ${u.completion === 100 ? 'bg-green-500' : 'bg-primary'}`} style={{ width: `${u.completion}%` }}></div>
                      </div>
                      <div className="flex justify-between text-[10px] font-semibold text-slate-500 mt-1">
                        <span>Avance de Registro</span>
                        <span className={u.completion === 100 ? 'text-green-600' : ''}>{u.completion}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal / Vista Detallada de Acta (Portal a body: evita recorte bajo el header) */}
      {selectedViewUD && createPortal(
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSelectedViewUD(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-fade-in m-auto overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedViewUD.isEmpleabilidad ? 'bg-amber-100 text-amber-700' : 'bg-primary-soft text-primary'}`}>
                    {selectedViewUD.isEmpleabilidad ? 'Transversal / Empleabilidad' : 'Específica'}
                  </span>
                  <span className="text-xs font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">
                    Periodo: {periods.find(p => p.id === parseInt(selectedPeriod))?.codigo}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-text">{selectedViewUD.nombre}</h3>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{selectedViewUD.moduloNombre}</p>
              </div>
              <button 
                onClick={() => setSelectedViewUD(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-red-100 hover:text-red-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-0 overflow-y-auto flex-1 bg-slate-50/50">
              {loadingUD ? (
                <div className="py-20 text-center">
                  <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-slate-500 font-medium text-sm">Recuperando registros oficiales...</p>
                </div>
              ) : udStudents.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary-soft flex items-center justify-center text-primary"><SearchX className="w-10 h-10" /></div>
                  <p>No hay estudiantes matriculados en esta UD.</p>
                </div>
              ) : (
                <table className="data-table w-full text-left border-collapse text-sm">
                  <thead className="bg-slate-800 text-white sticky top-0">
                    <tr>
                      <th className="py-3 px-4 font-semibold w-12 text-center">N°</th>
                      <th className="py-3 px-4 font-semibold">Estudiante</th>
                      <th className="py-3 px-4 font-bold text-center w-24 bg-slate-700/50">Nota Final</th>
                      <th className="py-3 px-4 font-semibold text-center w-28">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {udStudents.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-primary-soft/40 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-400 font-medium">{idx + 1}</td>
                        <td className="py-3 px-4 font-semibold text-slate-text">{s.name}</td>
                        <td className={`py-3 px-4 text-center font-bold text-lg bg-slate-50 shadow-[inset_1px_0_0_rgba(0,0,0,0.05)] ${
                          s.nota_final === '-' ? 'text-slate-400' : 
                          parseInt(s.nota_final) >= 13 ? 'text-primary' : 'text-red-600'
                        }`}>
                          {s.nota_final}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`badge ${
                            s.estado === 'aprobado' ? 'badge-green' :
                            s.estado === 'desaprobado' ? 'badge-red' :
                            'badge-slate'
                          }`}>
                            {s.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-between items-center">
              <div className="text-xs text-slate-500 font-medium flex items-center">
                <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                Modo Auditoría: Solo Lectura
              </div>
              <button 
                className="btn-primary text-sm px-4 py-2 flex items-center"
                onClick={handleExportActaPDF}
                disabled={loadingUD}
              >
                <FileSpreadsheet className="w-4 h-4 mr-1" /> Exportar a PDF (MINEDU)
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
