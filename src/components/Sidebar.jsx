// src/components/Sidebar.jsx

import { useMemo, useState } from 'react';

import {
  FiSearch,
  FiSidebar,
  FiPlus,
  FiMoreHorizontal,
  FiMapPin,
  FiShare2,
  FiTrash2,
  FiEdit3,
} from 'react-icons/fi';

export default function Sidebar({
  isOpen,
  toggleSidebar,
  chats,
  activeChatId,
  onSelectChat,
  onCreateChat,
  onRename,
  onPin,
  onDelete,
  onShare,
  user,
  initials,
  onLogout,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const [contextMenu, setContextMenu] = useState({
    chatId: null,
    x: 0,
    y: 0,
    isOpen: false,
  });

  const groupedChats = useMemo(() => {
    if (!chats) return {};

    const now = Date.now();

    const oneDay = 86400000;
    const sevenDays = 7 * oneDay;
    const thirtyDays = 30 * oneDay;

    const groups = {
      today: [],
      sevenDays: [],
      thirtyDays: [],
      older: [],
    };

    const normalizedSearch = searchTerm.trim().toLowerCase();

    chats
      .filter((chat) => {
        if (!normalizedSearch) {
          return true;
        }

        return chat.title
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .forEach((chat) => {
        const diff = now - chat.timestamp;

        if (diff < oneDay) {
          groups.today.push(chat);
        } else if (diff < sevenDays) {
          groups.sevenDays.push(chat);
        } else if (diff < thirtyDays) {
          groups.thirtyDays.push(chat);
        } else {
          groups.older.push(chat);
        }
      });

    return groups;
  }, [chats, searchTerm]);

  const handleContextMenu = (event, chatId) => {
    event.preventDefault();

    setContextMenu({
      chatId,
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 210),
      isOpen: true,
    });
  };

  const closeContextMenu = () => {
    setContextMenu({
      chatId: null,
      x: 0,
      y: 0,
      isOpen: false,
    });
  };

  if (!isOpen) {
    return null;
  }

  const groupLabels = {
    today: 'Hoy',
    sevenDays: '7 Días',
    thirtyDays: '30 Días',
    older: 'Anteriores',
  };

  return (
    <aside className="sidebar-container">
      <div className="sidebar-top">
        <div className="sidebar-brand-row">
          <div className="sidebar-brand">
            <img
              src="/vitruvian-man.png"
              alt="Logo Sapientia"
              className="sidebar-logo"
            />

            <div className="sidebar-wordmark">
              <img
                src="/sapientia-wordmark.png"
                alt="Sapientia"
              />
            </div>
          </div>

          <div className="sidebar-actions">
            <button
              type="button"
              onClick={() =>
                setSearchOpen((value) => !value)
              }
              className="sidebar-icon-button"
              title="Buscar"
              aria-label="Buscar"
            >
              <FiSearch
                size={19}
                strokeWidth={1.65}
              />
            </button>

            <button
              type="button"
              onClick={toggleSidebar}
              className="sidebar-icon-button"
              title="Ocultar barra lateral"
              aria-label="Ocultar barra lateral"
            >
              <FiSidebar
                size={19}
                strokeWidth={1.65}
              />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="sidebar-search-wrapper">
            <FiSearch
              size={14}
              strokeWidth={1.6}
            />

            <input
              autoFocus
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(event.target.value)
              }
              placeholder="Buscar chats"
              className="sidebar-search-input"
            />
          </div>
        )}

        <button
          type="button"
          onClick={onCreateChat}
          className="new-chat-button"
        >
          <span className="new-chat-icon">
            <FiPlus
              size={13}
              strokeWidth={1.8}
            />
          </span>

          <span>Nuevo chat</span>
        </button>
      </div>

      <div
        className="sidebar-history"
        onClick={() => {
          if (contextMenu.isOpen) {
            closeContextMenu();
          }
        }}
      >
        {Object.entries(groupedChats).map(
          ([key, chatList]) => {
            if (chatList.length === 0) {
              return null;
            }

            return (
              <section
                key={key}
                className="chat-group"
              >
                <div className="chat-group-title">
                  {groupLabels[key]}
                </div>

                {chatList.map((chat) => {
                  const active =
                    activeChatId === chat.id;

                  return (
                    <div
                      key={chat.id}
                      onClick={() =>
                        onSelectChat(chat.id)
                      }
                      onContextMenu={(event) =>
                        handleContextMenu(
                          event,
                          chat.id
                        )
                      }
                      className={`chat-list-item ${
                        active
                          ? 'chat-list-item-active'
                          : ''
                      }`}
                    >
                      <div className="chat-list-title">
                        {chat.isPinned && (
                          <FiMapPin
                            size={11}
                            strokeWidth={1.7}
                            className="chat-pin-icon"
                            title="Chat fijado"
                          />
                        )}

                        <span title={chat.title}>
                          {chat.title}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();

                          handleContextMenu(
                            event,
                            chat.id
                          );
                        }}
                        className="chat-more-button"
                        title="Opciones"
                        aria-label="Opciones"
                      >
                        <FiMoreHorizontal
                          size={16}
                          strokeWidth={1.7}
                        />
                      </button>
                    </div>
                  );
                })}
              </section>
            );
          }
        )}

        {Object.values(groupedChats).every(
          (chatList) => chatList.length === 0
        ) && (
          <div className="empty-history">
            No hay conversaciones que coincidan.
          </div>
        )}
      </div>

      <div className="sidebar-profile">
        <div className="profile-card">
          <div className="profile-left">
            <div className="profile-avatar">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={
                    user.displayName ||
                    'Usuario'
                  }
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                initials || 'U'
              )}
            </div>

            <div className="profile-info">
              <span className="profile-name">
                {user?.displayName || 'Usuario'}
              </span>

              <span className="profile-email">
                {user?.email || ''}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="profile-menu-button"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <FiMoreHorizontal
              size={17}
              strokeWidth={1.7}
            />
          </button>
        </div>
      </div>

      {contextMenu.isOpen && (
        <div
          className="chat-context-menu"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
          }}
          onMouseLeave={closeContextMenu}
        >
          <button
            type="button"
            onClick={() => {
              const currentChat = chats.find(
                (chat) =>
                  chat.id ===
                  contextMenu.chatId
              );

              const newTitle = window.prompt(
                'Nuevo nombre:',
                currentChat?.title || ''
              );

              if (newTitle?.trim()) {
                onRename(
                  contextMenu.chatId,
                  newTitle.trim()
                );
              }

              closeContextMenu();
            }}
          >
            <FiEdit3
              size={13}
              strokeWidth={1.7}
            />

            <span>Rename</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onPin(contextMenu.chatId);
              closeContextMenu();
            }}
          >
            <FiMapPin
              size={13}
              strokeWidth={1.7}
            />

            <span>Pin</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onShare?.();
              closeContextMenu();
            }}
          >
            <FiShare2
              size={13}
              strokeWidth={1.7}
            />

            <span>Share</span>
          </button>

          <button
            type="button"
            className="context-danger"
            onClick={() => {
              onDelete(contextMenu.chatId);
              closeContextMenu();
            }}
          >
            <FiTrash2
              size={13}
              strokeWidth={1.7}
            />

            <span>Delete</span>
          </button>
        </div>
      )}
    </aside>
  );
}