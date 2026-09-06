// src/components/AttachmentPreview.jsx

import { FiFileText, FiX } from 'react-icons/fi';

function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentPreview({
  attachments,
  onRemove,
  disabled,
}) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div
      className="attachment-preview-area"
      role="list"
      aria-label="Archivos adjuntos"
    >
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="attachment-card"
          role="listitem"
        >
          {attachment.kind === 'image' &&
          attachment.previewUrl ? (
            <img
              className="attachment-thumbnail"
              src={attachment.previewUrl}
              alt={attachment.file.name}
            />
          ) : (
            <span
              className="attachment-doc-icon"
              aria-hidden="true"
            >
              <FiFileText
                size={18}
                strokeWidth={1.6}
              />
            </span>
          )}

          <div className="attachment-meta">
            <span
              className="attachment-name"
              title={attachment.file.name}
            >
              {attachment.file.name}
            </span>

            <span className="attachment-size">
              {formatSize(attachment.file.size)}
            </span>
          </div>

          <button
            type="button"
            className="attachment-remove"
            onClick={() => onRemove(attachment.id)}
            disabled={disabled}
            title={`Quitar ${attachment.file.name}`}
            aria-label={`Quitar ${attachment.file.name}`}
          >
            <FiX size={14} strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}
