// src/components/AttachmentButton.jsx

import { FiPaperclip } from 'react-icons/fi';

export default function AttachmentButton({
  inputRef,
  onChange,
  selectedFile,
}) {
  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onChange}
        className="hidden"
      />

      <button
        type="button"
        onClick={handleClick}
        className="image-button"
        title={
          selectedFile
            ? selectedFile.name
            : 'Adjuntar imagen'
        }
        aria-label={
          selectedFile
            ? selectedFile.name
            : 'Adjuntar imagen'
        }
      >
        <FiPaperclip
          size={17}
          strokeWidth={1.7}
        />
      </button>

      {selectedFile && (
        <span
          className="selected-file-dot"
          title={`Imagen seleccionada: ${selectedFile.name}`}
          aria-label={`Imagen seleccionada: ${selectedFile.name}`}
        />
      )}
    </>
  );
}