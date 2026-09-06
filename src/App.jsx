// src/App.jsx

import { useState, useRef, useEffect, useMemo } from 'react';
import './App.css';

import Sidebar from './components/Sidebar';
import ChatHeader from './components/ChatHeader';
import ChatContainer from './components/ChatContainer';
import InputBar from './components/InputBar';

import { auth, googleProvider } from './firebase';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';

import axios from 'axios';

import { FiMenu } from 'react-icons/fi';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Procesa una respuesta Server-Sent Events obtenida mediante fetch().
 *
 * El backend de Sapientia envía eventos con esta estructura:
 *
 * data: {"type":"answer","content":"..."}
 *
 * data: {"type":"graph_created","content":"{\"artifact_id\":\"...\"}"}
 *
 * data: {"type":"done","content":"{\"conversation_id\":\"...\"}"}
 *
 * data: {"type":"error","content":"..."}
 */
async function consumeSSEResponse(response, onEvent) {
  if (!response.ok) {
    let detail = `Error HTTP ${response.status}`;

    try {
      const errorText = await response.text();

      if (errorText) {
        try {
          const parsed = JSON.parse(errorText);
          detail =
            parsed?.detail ||
            parsed?.message ||
            errorText;
        } catch {
          detail = errorText;
        }
      }
    } catch {
      // Conservamos el error HTTP original.
    }

    throw new Error(detail);
  }

  if (!response.body) {
    throw new Error(
      'El backend no devolvió un cuerpo de streaming SSE.'
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');

  let buffer = '';

  const processEventBlock = (block) => {
    const lines = block.split(/\r?\n/);

    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length === 0) {
      return;
    }

    const data = dataLines.join('\n').trim();

    if (!data || data === '[DONE]') {
      return;
    }

    let payload;

    try {
      payload = JSON.parse(data);
    } catch (error) {
      console.error(
        'SSE devolvió JSON inválido:',
        data,
        error
      );
      return;
    }

    onEvent(payload);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      const blocks = buffer.split(/\r?\n\r?\n/);

      buffer = blocks.pop() || '';

      for (const block of blocks) {
        processEventBlock(block);
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      processEventBlock(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [chats, setChats] = useState([
    {
      id: '1',
      conversationId: null,
      title: 'Saludo IA',
      timestamp: Date.now() - 5000000,
      isPinned: false,
      messages: [],
    },
    {
      id: '2',
      conversationId: null,
      title: 'Calculadora científica Play Store',
      timestamp: Date.now() - 20000000,
      isPinned: false,
      messages: [],
    },
    {
      id: '3',
      conversationId: null,
      title: 'Plan app tutor IA',
      timestamp: Date.now() - 40000000,
      isPinned: true,
      messages: [],
    },
  ]);

  const [activeChatId, setActiveChatId] = useState('1');

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [message, setMessage] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);

  const [chatHistory, setChatHistory] = useState([]);

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const chatEndRef = useRef(null);

  const activeChat = useMemo(
    () =>
      chats.find(
        (chat) => chat.id === activeChatId
      ) || null,
    [chats, activeChatId]
  );

  const activeChatTitle =
    activeChat?.title || 'Nuevo chat';

  const createNewChat = () => {
    const newChat = {
      id: Date.now().toString(),
      conversationId: null,
      title: 'Nuevo chat',
      timestamp: Date.now(),
      isPinned: false,
      messages: [],
    };

    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setChatHistory([]);
    setMessage('');

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const handleRenameChat = (chatId, newTitle) => {
    const title = newTitle?.trim();

    if (!title) {
      return;
    }

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              title,
            }
          : chat
      )
    );
  };

  const handlePinChat = (chatId) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              isPinned: !chat.isPinned,
            }
          : chat
      )
    );
  };

  const handleDeleteChat = (chatId) => {
    if (
      !window.confirm(
        '¿Estás seguro de que quieres eliminar este chat?'
      )
    ) {
      return;
    }

    setChats((prev) => {
      const remaining = prev.filter(
        (chat) => chat.id !== chatId
      );

      if (chatId === activeChatId) {
        const nextChat = remaining[0] || null;

        setActiveChatId(nextChat?.id || null);
        setChatHistory(nextChat?.messages || []);
      }

      return remaining;
    });
  };

  const handleSelectChat = (chatId) => {
    const selectedChat = chats.find(
      (chat) => chat.id === chatId
    );

    setActiveChatId(chatId);
    setChatHistory(
      selectedChat?.messages || []
    );
    setMessage('');

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [chatHistory, loading]);

  const login = async () => {
    try {
      await signInWithPopup(
        auth,
        googleProvider
      );
    } catch (error) {
      alert(
        'Error al iniciar sesión: ' +
          error.message
      );
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setChatHistory([]);
      setActiveChatId(null);
    } catch (error) {
      console.error(
        'Error al cerrar sesión:',
        error
      );
    }
  };

  const handleImageChange = (event) => {
    const selectedFile =
      event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    setImage(selectedFile);
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(
        window.location.href
      );

      alert(
        'Enlace copiado al portapapeles'
      );
    } catch (error) {
      console.error(
        'No se pudo copiar el enlace:',
        error
      );
    }
  };

  const resetInput = () => {
    setMessage('');
    setImage(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (textareaRef.current) {
      textareaRef.current.style.height =
        'auto';
    }
  };

  const updateChatMessages = (
    chatId,
    messages
  ) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages,
              timestamp: Date.now(),
            }
          : chat
      )
    );

    setChatHistory(messages);
  };

  const updateChatConversationId = (
    chatId,
    conversationId
  ) => {
    if (!conversationId) {
      return;
    }

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              conversationId,
            }
          : chat
      )
    );
  };


  const sendRequest = async () => {
    const pregunta = message.trim();

    if (!pregunta && !image) {
      return;
    }

    if (!user) {
      alert('Inicia sesión para continuar.');
      return;
    }

    if (!API_BASE_URL) {
      alert(
        'VITE_API_BASE_URL no está configurada.'
      );
      return;
    }

    let targetChatId = activeChatId;

    if (!targetChatId) {
      const newChat = {
        id: Date.now().toString(),
        conversationId: null,
        title:
          pregunta || 'Nuevo chat',
        timestamp: Date.now(),
        isPinned: false,
        messages: [],
      };

      setChats((prev) => [
        newChat,
        ...prev,
      ]);

      setActiveChatId(newChat.id);

      targetChatId = newChat.id;
    }

    const currentChat =
      chats.find(
        (chat) => chat.id === targetChatId
      ) || null;

    const userMessage = {
      id: `${Date.now()}-user`,
      type: 'user',
      content:
        pregunta || '(imagen adjunta)',
    };

    const nextMessages = [
      ...chatHistory,
      userMessage,
    ];

    setChatHistory(nextMessages);

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === targetChatId
          ? {
              ...chat,
              messages: nextMessages,
              timestamp: Date.now(),
              title:
                chat.title === 'Nuevo chat' &&
                pregunta
                  ? pregunta.slice(0, 42)
                  : chat.title,
            }
          : chat
      )
    );

    const hasImage = Boolean(image);
    const selectedImage = image;

    setLoading(true);
    resetInput();

    const requestStart =
      performance.now();

    try {
      const idToken =
        await user.getIdToken();

      /*
       * ============================================================
       * VISIÓN → OCR → CHAT MODERNO
       * ============================================================
       *
       * La imagen se analiza primero mediante el endpoint moderno
       * de visión. El resultado estructurado se transforma en
       * vision_text y luego continúa por /api/v1/chat/message.
       */

      let visionText = '';

      if (hasImage) {
        const formData = new FormData();

        formData.append(
          'image',
          selectedImage
        );

        const visionResponse = await axios.post(
          `${API_BASE_URL}/api/v1/vision/analyze`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          }
        );

        const visionResult =
          visionResponse.data || {};

        const texto =
          visionResult.texto || '';

        const formulas = Array.isArray(
          visionResult.formulas
        )
          ? visionResult.formulas
          : [];

        const tipo =
          visionResult.tipo || 'otro';

        const descripcion =
          visionResult.descripcion || '';

        visionText = [
          texto
            ? `Texto extraído:\n${texto}`
            : '',
          formulas.length
            ? `Fórmulas:\n${formulas.join('\n')}`
            : '',
          `Tipo: ${tipo}`,
          descripcion
            ? `Descripción: ${descripcion}`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n');
      }

      /*
       * ============================================================
       * CHAT MODERNO — SSE
       * ============================================================
       */

      const conversationId =
        currentChat?.conversationId ||
        '';

      const payload = {
        message:
          pregunta ||
          (hasImage
            ? 'Analiza esta imagen y explícame lo que contiene.'
            : ''),
        conversation_id:
          conversationId,
        vision_text: visionText,
        attachment_ids: [],
      };

      const response = await fetch(
        `${API_BASE_URL}/api/v1/chat/message`,
        {
          method: 'POST',
          headers: {
            Authorization:
              `Bearer ${idToken}`,
            'Content-Type':
              'application/json',
            Accept:
              'text/event-stream',
          },
          body: JSON.stringify(payload),
        }
      );

      let assistantContent = '';

      let assistantMessageId = null;

      let conversationIdFromServer =
        conversationId;

      let graphArtifactId = null;
      let graphTaskId = null;

      let graphRequested = false;

      const createOrUpdateAssistantMessage =
        (extra = {}) => {
          if (!assistantMessageId) {
            assistantMessageId = `${Date.now()}-assistant`;
          }

          return {
            id: assistantMessageId,
            type: 'sapientia',
            content: assistantContent,
            graphData: null,
            thinkingTime: 0,

            /*
             * Estos campos ya quedan almacenados
             * en el estado del mensaje para que
             * los componentes posteriores puedan
             * utilizarlos al integrar el gráfico
             * mediante html_url.
             */
            graphRequested,
            graphArtifactId,
            graphTaskId,

            ...extra,
          };
        };


      await consumeSSEResponse(
        response,
        (event) => {
          if (!event?.type) {
            return;
          }

          switch (event.type) {
            case 'answer': {
              const content =
                event.content || '';

              if (!content) {
                return;
              }

              assistantContent += content;

              const assistantMessage =
                createOrUpdateAssistantMessage();

              const messagesWithAssistant =
                assistantMessage
                  ? [
                      ...nextMessages,
                      assistantMessage,
                    ]
                  : nextMessages;

              updateChatMessages(
                targetChatId,
                messagesWithAssistant
              );

              break;
            }

            case 'graph_request': {
              graphRequested =
                String(
                  event.content || ''
                ).toLowerCase() ===
                'true';

              if (assistantMessageId) {
                const currentMessages =
                  [
                    ...nextMessages,
                  ];

                const assistantIndex =
                  currentMessages.findIndex(
                    (item) =>
                      item.id ===
                      assistantMessageId
                  );

                if (
                  assistantIndex >= 0
                ) {
                  currentMessages[
                    assistantIndex
                  ] = {
                    ...currentMessages[
                      assistantIndex
                    ],
                    graphRequested,
                  };

                  updateChatMessages(
                    targetChatId,
                    currentMessages
                  );
                }
              }

              break;
            }

            case 'graph_created': {
              try {
                const graphPayload =
                  JSON.parse(
                    event.content || '{}'
                  );

                graphArtifactId =
                  graphPayload.artifact_id ||
                  null;

                graphTaskId =
                  graphPayload.task_id ||
                  null;
              } catch (error) {
                console.error(
                  'No se pudo interpretar graph_created:',
                  error
                );
              }

              if (assistantMessageId) {
                const messages =
                  [
                    ...nextMessages,
                  ];

                const assistantIndex =
                  messages.findIndex(
                    (item) =>
                      item.id ===
                      assistantMessageId
                  );

                if (
                  assistantIndex >= 0
                ) {
                  messages[
                    assistantIndex
                  ] = {
                    ...messages[
                      assistantIndex
                    ],
                    graphRequested: true,
                    graphArtifactId,
                    graphTaskId,
                  };

                  updateChatMessages(
                    targetChatId,
                    messages
                  );
                }
              }

              break;
            }

            case 'done': {
              try {
                const donePayload =
                  JSON.parse(
                    event.content || '{}'
                  );

                if (
                  donePayload.conversation_id
                ) {
                  conversationIdFromServer =
                    donePayload.conversation_id;
                }

                if (
                  donePayload
                    .graph_artifact_id
                ) {
                  graphArtifactId =
                    donePayload.graph_artifact_id;
                }

                if (
                  donePayload.graph_task_id
                ) {
                  graphTaskId =
                    donePayload.graph_task_id;
                }

                if (
                  typeof donePayload
                    .graph_requested ===
                  'boolean'
                ) {
                  graphRequested =
                    donePayload.graph_requested;
                }
              } catch (error) {
                console.error(
                  'No se pudo interpretar done:',
                  error
                );
              }

              if (
                conversationIdFromServer
              ) {
                updateChatConversationId(
                  targetChatId,
                  conversationIdFromServer
                );
              }

              const elapsedSeconds =
                Math.max(
                  1,
                  Math.round(
                    (performance.now() -
                      requestStart) /
                      1000
                  )
                );

              if (assistantContent) {
                const finalAssistantMessage =
                  createOrUpdateAssistantMessage(
                    {
                      thinkingTime:
                        elapsedSeconds,
                      graphRequested,
                      graphArtifactId,
                      graphTaskId,
                    }
                  );

                const finalMessages = [
                  ...nextMessages,
                  finalAssistantMessage,
                ];

                updateChatMessages(
                  targetChatId,
                  finalMessages
                );
              }

              break;
            }


            case 'error': {
              throw new Error(
                event.content ||
                  'Sapientia devolvió un error.'
              );
            }

            case 'reasoning':
              /*
               * El backend actual declara este tipo
               * en el esquema, pero el flujo de
               * ReasoningService puede no emitirlo.
               *
               * No lo mostramos todavía.
               */
              break;

            default:
              break;
          }
        }
      );

      /*
       * Si el stream terminó correctamente pero
       * nunca llegó un evento answer, no creamos
       * un mensaje vacío.
       */
      if (!assistantContent) {
        throw new Error(
          'Sapientia no devolvió contenido.'
        );
      }
    } catch (error) {
      console.error(
        'Error en sendRequest:',
        error
      );

      const errorContent =
        error?.response?.data?.detail ||
        error?.message ||
        'Error desconocido.';

      const errorMessage = {
        id: `${Date.now()}-error`,
        type: 'sapientia',
        content: `Error: ${errorContent}`,
        graphData: null,
      };

      const errorMessages = [
        ...nextMessages,
        errorMessage,
      ];

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === targetChatId
            ? {
                ...chat,
                messages: errorMessages,
                timestamp: Date.now(),
              }
            : chat
        )
      );

      setChatHistory(errorMessages);
    } finally {
      setLoading(false);
    }
  };


  const handleKeyDown = (event) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendRequest();
    }
  };

  const autoResize = (event) => {
    const element = event.target;

    element.style.height = 'auto';

    element.style.height =
      `${Math.min(
        element.scrollHeight,
        170
      )}px`;
  };

  const editUserMessage = (content) => {
    if (
      !content ||
      content === '(imagen adjunta)'
    ) {
      return;
    }

    setMessage(content);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();

      textareaRef.current?.setSelectionRange(
        content.length,
        content.length
      );

      if (textareaRef.current) {
        textareaRef.current.style.height =
          'auto';

        textareaRef.current.style.height =
          `${Math.min(
            textareaRef.current
              .scrollHeight,
            170
          )}px`;
      }
    });
  };

  const copyMessage = async (content) => {
    try {
      await navigator.clipboard.writeText(
        content
      );
    } catch (error) {
      console.error(
        'No se pudo copiar el mensaje:',
        error
      );
    }
  };

  const initials = user?.displayName
    ? user.displayName
        .split(' ')
        .map(
          (word) => word[0]
        )
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() ||
      'U';

  if (authLoading) {
    return (
      <div className="sapientia-app flex h-screen items-center justify-center bg-[#121212] text-gray-400">
        Cargando...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="sapientia-app flex h-screen flex-col items-center justify-center gap-6 bg-[#121212] px-6 text-gray-200">
        <div className="flex items-center gap-4">
          <img
            src="/vitruvian-man.png"
            alt="Logo Sapientia"
            className="h-16 w-16 rounded-full object-cover"
          />

          <h1 className="text-5xl font-semibold tracking-tight text-[#cbc7b7]">
            Sapientia
          </h1>
        </div>

        <p className="text-sm text-gray-500">
          Inicia sesión para comenzar
        </p>

        <button
          onClick={login}
          className="rounded-full bg-[#eee8dc] px-7 py-3 font-medium text-[#202020] transition hover:bg-white"
        >
          Iniciar sesión con Google
        </button>
      </div>
    );
  }

  return (
    <div className="sapientia-app flex h-screen overflow-hidden bg-[#121212] text-[#e7e5df]">
      <Sidebar
        isOpen={isSidebarOpen}
        toggleSidebar={() =>
          setIsSidebarOpen(
            (value) => !value
          )
        }
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onCreateChat={createNewChat}
        onRename={handleRenameChat}
        onPin={handlePinChat}
        onDelete={handleDeleteChat}
        onShare={handleShare}
        user={user}
        initials={initials}
        onLogout={logout}
      />

      {!isSidebarOpen && (
        <button
          type="button"
          onClick={() =>
            setIsSidebarOpen(true)
          }
          className="sidebar-open-button"
          aria-label="Abrir barra lateral"
        >
          <FiMenu
            size={18}
            strokeWidth={1.8}
          />
        </button>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col bg-[#121212]">
        <ChatHeader
          title={activeChatTitle}
          onShare={handleShare}
        />

        <section className="relative flex min-h-0 flex-1 flex-col">
          <ChatContainer
            messages={chatHistory}
            loading={loading}
            chatEndRef={chatEndRef}
            onCopyMessage={copyMessage}
            onEditMessage={editUserMessage}
          />

          <InputBar
            value={message}
            onChange={setMessage}
            onSend={sendRequest}
            onKeyDown={handleKeyDown}
            onInput={autoResize}
            loading={loading}
            image={image}
            fileInputRef={fileInputRef}
            onImageChange={
              handleImageChange
            }
            textareaRef={textareaRef}
          />
        </section>
      </main>
    </div>
  );
}