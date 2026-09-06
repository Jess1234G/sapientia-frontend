// src/components/ThinkingIndicator.jsx

import { FiCpu, FiChevronRight } from 'react-icons/fi';

export default function ThinkingIndicator({
  thinkingTime = null,
  active = false,
}) {
  if (active) {
    return (
      <div className="thinking-wrapper">
        <div className="thinking-row thinking-active">
          <FiCpu
            size={15}
            strokeWidth={1.7}
          />

          <span>Pensando...</span>
        </div>

        <div
          className="thinking-dots"
          aria-label="Sapientia está pensando"
        >
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (!thinkingTime) {
    return null;
  }

  return (
    <div className="thinking-row">
      <FiCpu
        size={15}
        strokeWidth={1.7}
      />

      <span>
        Pensado durante {thinkingTime}{' '}
        {thinkingTime === 1 ? 'segundo' : 'segundos'}
      </span>

      <FiChevronRight
        size={12}
        strokeWidth={1.7}
      />
    </div>
  );
}