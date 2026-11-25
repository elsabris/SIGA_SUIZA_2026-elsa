// Subida y apertura de documentos guardados en el backend (mod-programas-estudio).
import { apiClient } from '../api/client';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** Sube un archivo y devuelve { id, nombre, url } (url relativa /api/...). */
export async function uploadDocument(file, categoria = 'otro') {
  const form = new FormData();
  form.append('file', file);
  form.append('categoria', categoria);
  const res = await fetch(`${apiClient.baseURL}/api/mod-programas-estudio/documentos`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    throw new Error(data?.detail || `No se pudo subir el archivo (HTTP ${res.status})`);
  }
  return data;
}

export function isStoredDocument(url) {
  return typeof url === 'string' && /\/api\/mod-programas-estudio\/documentos\/\d+/.test(url);
}

/**
 * Abre un documento en una pestaña nueva sin recargar la aplicación.
 * Los enlaces antiguos (simulados) no tienen archivo real y se informa al usuario.
 */
export async function openDocument(url, toast) {
  const notify = (type, msg) => {
    const t = toast?.toast || toast;
    if (t && typeof t[type] === 'function') t[type](msg);
  };
  if (!url) {
    notify('warning', 'Este registro no tiene un documento adjunto.');
    return;
  }
  if (/^https?:\/\//i.test(url) && !url.includes('/api/mod-programas-estudio/documentos/')) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!isStoredDocument(url)) {
    notify('warning', 'Este documento se registró sin archivo real (versión anterior). Pida al docente que lo vuelva a subir.');
    return;
  }
  // Abrir la pestaña antes del fetch para que el navegador no la bloquee
  const win = window.open('', '_blank');
  try {
    const path = url.slice(url.indexOf('/api/'));
    const res = await fetch(`${apiClient.baseURL}${path}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(res.status === 404 ? 'El documento ya no existe.' : `Error HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    if (win) {
      win.location.href = objectUrl;
    } else {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
  } catch (err) {
    if (win) win.close();
    notify('error', `No se pudo abrir el documento: ${err.message}`);
  }
}
