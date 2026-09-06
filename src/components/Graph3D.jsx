import { useEffect, useState } from 'react';
import { auth } from '../firebase';

const POLLING_INTERVAL_MS = 2000;

export default function Graph3D({ artifactId }) {
  const [status, setStatus] = useState('pending');
  const [htmlUrl, setHtmlUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!artifactId) {
      setStatus('pending');
      setHtmlUrl('');
      setError('');
      return undefined;
    }

    let cancelled = false;
    let intervalId = null;

    const loadGraph = async () => {
      try {
        const user = auth.currentUser;

        if (!user) {
          throw new Error('No hay un usuario autenticado.');
        }

        const idToken = await user.getIdToken();

        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL}/api/v1/graphs/${artifactId}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${idToken}`,
              Accept: 'application/json',
            },
          }
        );

        if (!response.ok) {
          let detail = `Error HTTP ${response.status}`;

          try {
            const data = await response.json();
            detail = data?.detail || detail;
          } catch {
            // Conservamos el error HTTP original.
          }

          throw new Error(detail);
        }

        const data = await response.json();

        if (cancelled) {
          return;
        }

        setStatus(data?.status || 'pending');
        setHtmlUrl(data?.html_url || '');
        setError(data?.error || '');

        if (data?.status === 'completed' || data?.status === 'failed') {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      } catch (requestError) {
        if (cancelled) {
          return;
        }

        console.error('Error al consultar el gráfico 3D:', requestError);
        setStatus('failed');
        setHtmlUrl('');
        setError(
          requestError?.message ||
            'No fue posible obtener el gráfico 3D.'
        );

        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    };

    loadGraph();

    intervalId = window.setInterval(
      loadGraph,
      POLLING_INTERVAL_MS
    );

    return () => {
      cancelled = true;

      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [artifactId]);

  if (!artifactId) {
    return null;
  }

  if (status === 'pending' || status === 'running') {
    return (
      <div className="mt-5 flex h-[400px] w-full items-center justify-center rounded-2xl border border-[#2e2e2e] bg-[#0f0f0f] text-sm text-gray-400">
        Generando gráfico 3D...
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="mt-5 flex min-h-[120px] w-full items-center justify-center rounded-2xl border border-[#2e2e2e] bg-[#0f0f0f] px-5 text-sm text-red-400">
        {error || 'No se pudo generar el gráfico 3D.'}
      </div>
    );
  }

  if (status === 'completed' && htmlUrl) {
    return (
      <div className="mt-5 h-[400px] w-full overflow-hidden rounded-2xl border border-[#2e2e2e] bg-[#0f0f0f]">
        <iframe
          src={htmlUrl}
          className="h-full w-full border-0"
          title="Gráfico 3D Sapientia"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="mt-5 flex min-h-[120px] w-full items-center justify-center rounded-2xl border border-[#2e2e2e] bg-[#0f0f0f] px-5 text-sm text-gray-400">
      El gráfico todavía no está disponible.
    </div>
  );
}