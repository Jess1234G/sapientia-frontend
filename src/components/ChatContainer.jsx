// src/components/ChatContainer.jsx

import ThinkingIndicator from './ThinkingIndicator';
import Message from './Message';

export default function ChatContainer({
  messages,
  loading,
  chatEndRef,
  onCopyMessage,
  onEditMessage,
  onGetImageUrl,
}) {
  return (
    <div className="chat-scroll-area flex-1 overflow-y-auto">
      <div className="chat-content-shell">
        {messages.length === 0 && (
          <div className="welcome-area">
            <div className="welcome-logo">
              <img
                src="/vitruvian-man.png"
                alt="Sapientia"
                className="h-16 w-16 rounded-full object-cover"
              />
            </div>

            <h2 className="welcome-title">
              ¿En qué puedo ayudarte hoy?
            </h2>

            <p className="welcome-subtitle">
              Pregunta sobre cálculo, física, programación o
              adjunta una imagen de un ejercicio.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            onCopy={onCopyMessage}
            onEdit={onEditMessage}
            onGetImageUrl={onGetImageUrl}
          />
        ))}

        {loading && (
          <article className="message-row message-row-assistant">
            <ThinkingIndicator active />
          </article>
        )}

        <div ref={chatEndRef} />
      </div>
    </div>
  );
}