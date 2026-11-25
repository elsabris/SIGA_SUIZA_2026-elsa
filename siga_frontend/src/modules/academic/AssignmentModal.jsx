import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

export function AssignmentModal({ 
  isOpen, 
  onClose, 
  docenteId, 
  docenteName, 
  periodoObj, 
  unidadesFlat, 
  cargaForm, 
  setCargaForm, 
  handleCreateCarga, 
  saving,
  teacherLoad,
  isOverloaded
}) {
  const [showOtros, setShowOtros] = useState(false);
  if (!isOpen) return null;

  // Paridad del periodo: "2026-I", "2026-1", "2026_I" → impar; "-II", "-2" → par.
  const codigo = String(periodoObj?.codigo || periodoObj?.nombre || '').trim().toUpperCase();
  const isEven = /[-_\s](II|2)$/.test(codigo);
  const isOdd = !isEven && /[-_\s](I|1)$/.test(codigo);

  const cicloDe = (u) => {
    const n = parseInt(u?.periodo_sugerido ?? u?.ciclo ?? u?.periodo, 10);
    return Number.isFinite(n) ? n : null;
  };

  const lista = Array.isArray(unidadesFlat) ? unidadesFlat : [];
  const enPeriodo = (u) => {
    const c = cicloDe(u);
    if (c === null) return false;
    if (isOdd) return c % 2 === 1;
    if (isEven) return c % 2 === 0;
    return true;
  };
  const filteredUnidades = lista.filter(enPeriodo);
  const otrosUnidades = lista.filter(u => !enPeriodo(u));

  const groupBy = (arr) => arr.reduce((acc, u) => {
    const key = cicloDe(u) ?? 'Sin ciclo';
    acc[key] = acc[key] || [];
    acc[key].push(u);
    return acc;
  }, {});
  const sortKeys = (obj) => Object.keys(obj).sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return Number.isFinite(na) ? -1 : 1;
  });
  const grouped = groupBy(filteredUnidades);
  const groupedOtros = groupBy(otrosUnidades);
  const otrosVisibles = showOtros || filteredUnidades.length === 0;

  const renderGrupos = (groups) => sortKeys(groups).map(ciclo => (
            <div key={ciclo} className="mb-6">
              <h4 className="font-bold text-slate-700 border-b pb-2 mb-3 text-sm uppercase tracking-wider flex items-center">
                <span className="w-6 h-6 rounded-full bg-primary-soft text-primary-dark flex items-center justify-center mr-2 text-xs font-bold">{ciclo}</span>
                Ciclo {ciclo}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {groups[ciclo].map(u => (
                  <label key={u.id} className={`flex items-start p-3 rounded-xl border cursor-pointer transition-all ${cargaForm.unidades_didacticas_ids.includes(String(u.id)) ? 'border-primary bg-primary-soft/50 shadow-sm' : 'border-slate-200 bg-white hover:border-primary-light'}`}>
                    <div className="flex-shrink-0 mt-0.5">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary"
                        checked={cargaForm.unidades_didacticas_ids.includes(String(u.id))}
                        onChange={() => toggleCurso(u.id)}
                      />
                    </div>
                    <div className="ml-3">
                      <span className="block text-sm font-semibold text-slate-text leading-tight">{u.nombre}</span>
                      <span className="block text-xs text-slate-500 mt-1">{u.creditos} Créditos</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ));

  const toggleCurso = (id) => {
    const idStr = String(id);
    let newIds = [...cargaForm.unidades_didacticas_ids];
    if (newIds.includes(idStr)) {
      newIds = newIds.filter(i => i !== idStr);
    } else {
      newIds.push(idStr);
    }
    setCargaForm({ ...cargaForm, unidades_didacticas_ids: newIds });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Asignar Cursos - {docenteName}</h3>
            <div className="flex items-center gap-4 mt-1">
              <p className="text-sm text-slate-500">Periodo: {periodoObj?.codigo}</p>
              {docenteId && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${isOverloaded ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                  {isOverloaded && <AlertTriangle size={12} />}
                  Carga actual: {teacherLoad} cursos
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="btn-icon text-slate-400 hover:text-slate-600" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
          {renderGrupos(grouped)}

          {filteredUnidades.length === 0 && (
            <div className="text-center py-4 text-slate-500 text-sm">
              {lista.length === 0
                ? 'Este programa aún no tiene unidades didácticas registradas en su plan de estudios.'
                : `No hay cursos de ciclos ${isEven ? 'pares' : 'impares'} para ${periodoObj?.codigo || 'este periodo'}. Puede elegirlos de «Otros ciclos».`}
            </div>
          )}

          {otrosUnidades.length > 0 && (
            <div className="mt-4 border-t border-dashed border-slate-300 pt-4">
              <button
                type="button"
                onClick={() => setShowOtros(v => !v)}
                className="w-full flex justify-between items-center text-left font-bold text-slate-700 text-sm uppercase tracking-wider mb-3"
              >
                <span>Otros ciclos ({otrosUnidades.length} cursos)</span>
                <span className="text-xs text-primary normal-case font-semibold">{otrosVisibles ? 'Ocultar' : 'Mostrar'}</span>
              </button>
              {otrosVisibles && renderGrupos(groupedOtros)}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-100 bg-white flex justify-between items-center">
          <div className="text-sm text-slate-600 font-medium">
            <span className="text-primary-dark font-bold">{cargaForm.unidades_didacticas_ids.length}</span> cursos seleccionados
          </div>
          
          <div className="flex space-x-3 items-center">
            <div className="flex space-x-2 mr-4">
              <select 
                className="input-field text-sm"
                value={cargaForm.turno}
                onChange={e => setCargaForm({...cargaForm, turno: e.target.value})}
              >
                <option value="Mañana">Mañana</option>
                <option value="Tarde">Tarde</option>
                <option value="Noche">Noche</option>
              </select>
              <select 
                className="input-field text-sm"
                value={cargaForm.seccion}
                onChange={e => setCargaForm({...cargaForm, seccion: e.target.value})}
              >
                <option value="A">Sec A</option>
                <option value="B">Sec B</option>
                <option value="C">Sec C</option>
              </select>
            </div>
            
            <button 
              type="button"
              onClick={onClose}
              className="btn-ghost"
            >
              Cancelar
            </button>
            <button 
              type="button"
              onClick={handleCreateCarga}
              disabled={saving || cargaForm.unidades_didacticas_ids.length === 0}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Asignación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
