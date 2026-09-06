// src/components/ChatHeader.jsx

import { FiShare2 } from 'react-icons/fi';

export default function ChatHeader({ title, onShare }) {
  return (
    <header className="conversation-header flex h-[62px] flex-shrink-0 items-center justify-between px-7">
      <h1 className="truncate text-[17px] font-semibold text-[#cbc7b7]">
        {title}
      </h1>

      <button
        type="button"
        onClick={onShare}
        className="share-button"
        title="Compartir"
        aria-label="Compartir"
      >
        <FiShare2
          size={15}
          strokeWidth={1.7}
        />

        <span>Compartir</span>
      </button>
    </header>
  );
}