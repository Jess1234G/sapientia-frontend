// src/components/AttachmentButton.jsx

import { FiPaperclip } from 'react-icons/fi';

const ACCEPT_TYPES =
  'image/png,image/jpeg,image/webp,application/pdf,text/plain,.png,.jpg,.jpeg,.webp,.pdf,.txt';

export default function AttachmentButton({
  inputRef,
  onChange,
  hasAttachments,
}) {
  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_TYPES}
        multiple
        onChange={onChange}
        className="hidden"
      />

      <button
        type="button"
        onClick={handleClick}
        className="image-button"
        title={
          hasAttachments
            ? 'Añadir más archivos'
            : 'Adjuntar archivos'
        }
        aria-label={
          hasAttachments
            ? 'Añadir más archivos'
            : 'Adjuntar archivos'
        }
      >
        <FiPaperclip
          size={17}
          strokeWidth={1.7}
        />
      </button>

      {hasAttachments && (
        <span
          className="selected-file-dot"
          title="Hay archivos adjuntos"
          aria-label="Hay archivos adjuntos"
        />
      )}
    </>
  );
}