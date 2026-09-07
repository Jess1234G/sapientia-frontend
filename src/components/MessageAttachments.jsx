// src/components/MessageAttachments.jsx

import { useEffect, useState } from 'react';

import { FiFileText, FiImage } from 'react-icons/fi';

function formatSize(bytes) {
  if (!bytes || bytes <= 0) {
    return '';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImageThumbnail({ attachment, onGetImageUrl }) {
  const [url, setUrl] = useState(
    attachment.previewUrl || null
  );
  const [status, setStatus] = useState(
    attachment.previewUrl ? 'ready' : 'loading'
  );

  useEffect(() => {
    if (attachment.previewUrl) {
      setUrl(attachment.previewUrl);
      setStatus('ready');
      return undefined;
    }

    let cancelled = false;

    setStatus('loading');

    Promise.resolve(
      onGetImageUrl?.(attachment.attachmentId)
    )
      .then((resolvedUrl) => {
        if (cancelled) {
          return;
        }

        if (resolvedUrl) {
          setUrl(resolvedUrl);
          setStatus('ready');
        } else {
          setStatus('error');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    attachment.attachmentId,
    attachment.previewUrl,
    onGetImageUrl,
  ]);

  const alt = attachment.filename || 'Imagen adjunta';

  if (status === 'loading') {
    return (
      <span
        className="message-attachment-thumb is-loading"
        role="img"
        aria-label={`Cargando ${alt}`}
      >
        <FiImage size={18} strokeWidth={1.6} />
      </span>
    );
  }

  if (status === 'error' || !url) {
    return (
      <span
        className="message-attachment-thumb is-error"
        role="img"
        aria-label={`No disponible: ${alt}`}
        title={`No disponible: ${alt}`}
      >
        <FiImage size={18} strokeWidth={1.6} />
      </span>
    );
  }

  return (
    <a
      className="message-attachment-thumb-link"
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Abrir ${alt}`}
      title={`Abrir ${alt}`}
    >
      <img
        className="message-attachment-thumb"
        src={url}
        alt={alt}
      />
    </a>
  );
}

export default function MessageAttachments({
  attachments,
  onGetImageUrl,
}) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div
      className="message-attachments"
      role="list"
      aria-label="Archivos adjuntos al mensaje"
    >
      {attachments.map((attachment) => (
        <div
          key={attachment.attachmentId}
          className="message-attachment-card"
          role="listitem"
        >
          {attachment.kind === 'image' ? (
            <ImageThumbnail
              attachment={attachment}
              onGetImageUrl={onGetImageUrl}
            />
          ) : (
            <span
              className="message-attachment-icon"
              aria-hidden="true"
            >
              <FiFileText size={18} strokeWidth={1.6} />
            </span>
          )}

          <div className="message-attachment-meta">
            <span
              className="message-attachment-name"
              title={attachment.filename}
            >
              {attachment.filename}
            </span>

            {formatSize(attachment.size) && (
              <span className="message-attachment-size">
                {formatSize(attachment.size)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
