// src/components/Message.jsx

import {
  FiCopy,
  FiEdit3,
} from 'react-icons/fi';

import LatexRenderer from '../LatexRenderer';
import ThinkingIndicator from './ThinkingIndicator';
import Graph3D from './Graph3D';

export default function Message({
  message,
  onCopy,
  onEdit,
}) {
  const isUser = message.type === 'user';
  const isSapientia = message.type === 'sapientia';

  return (
    <article
      className={`message-row ${
        isUser
          ? 'message-row-user'
          : 'message-row-assistant'
      }`}
    >
      {isSapientia && (
        <ThinkingIndicator
          thinkingTime={message.thinkingTime}
        />
      )}

      <div
        className={`message-content ${
          isUser
            ? 'user-message-content'
            : 'assistant-message-content'
        }`}
      >
        {isUser ? (
          <div className="user-bubble">
            <LatexRenderer content={message.content} />
          </div>
        ) : (
          <div className="assistant-text">
            <LatexRenderer content={message.content} />

            <Graph3D artifactId={message.graphArtifactId} />
          </div>
        )}

        <div className="message-actions">
          <button
            type="button"
            onClick={() => onCopy(message.content)}
            title="Copiar"
            aria-label="Copiar mensaje"
          >
            <FiCopy
              size={14}
              strokeWidth={1.7}
            />
          </button>

          {isUser && (
            <button
              type="button"
              onClick={() => onEdit(message.content)}
              title="Editar"
              aria-label="Editar mensaje"
            >
              <FiEdit3
                size={14}
                strokeWidth={1.7}
              />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}