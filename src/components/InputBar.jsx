// src/components/InputBar.jsx

import { FiCpu, FiSend } from 'react-icons/fi';
import AttachmentButton from './AttachmentButton';
import AttachmentPreview from './AttachmentPreview';

export default function InputBar({
  value,
  onChange,
  onSend,
  onKeyDown,
  onInput,
  loading,
  attachments,
  attachmentError,
  onRemoveAttachment,
  fileInputRef,
  onFilesChange,
  textareaRef,
}) {
  const hasAttachments = attachments.length > 0;

  const isDisabled =
    loading || (!value.trim() && !hasAttachments);

  return (
    <div className="input-area">
      <div className="input-wrapper">
        <AttachmentPreview
          attachments={attachments}
          onRemove={onRemoveAttachment}
          disabled={loading}
        />

        {attachmentError && (
          <p className="attachment-error" role="alert">
            {attachmentError}
          </p>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          onKeyDown={onKeyDown}
          onInput={onInput}
          rows={1}
          placeholder="Mensaje Sapientia"
          className="chat-textarea"
          aria-label="Mensaje Sapientia"
        />

        <div className="input-toolbar">
          <div className="input-toolbar-left">
            <button
              type="button"
              className="deepthink-button"
              title="DeepThink"
              aria-label="DeepThink"
            >
              <FiCpu
                size={13}
                strokeWidth={1.7}
              />

              <span>DeepThink</span>
            </button>

            <AttachmentButton
              inputRef={fileInputRef}
              onChange={onFilesChange}
              hasAttachments={hasAttachments}
            />
          </div>

          <button
            type="button"
            onClick={onSend}
            disabled={isDisabled}
            className={`send-button ${
              isDisabled
                ? 'send-button-disabled'
                : ''
            }`}
            title="Enviar"
            aria-label="Enviar"
          >
            <FiSend
              size={17}
              strokeWidth={1.9}
            />
          </button>
        </div>
      </div>

      <p className="input-disclaimer">
        IA generada, solo para referencia
      </p>
    </div>
  );
}