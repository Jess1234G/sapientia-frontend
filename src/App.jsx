// src/App.jsx

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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

/*
 * ============================================================
 * ADJUNTOS — Tipos y límites (espejo del backend)
 * ============================================================
 *
 * El backend (POST /api/v1/attachments) solo acepta:
 *   image/png, image/jpeg, image/webp, application/pdf, text/plain
 *
 * Límites:
 *   imágenes  -> 10 MB
 *   documentos -> 20 MB
 *
 * El backend sigue siendo la autoridad final; estos valores
 * solo sirven para mejorar la UX (validación ligera en cliente).
 */
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.pdf',
  '.txt',
]);

const EXTENSION_TO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
};

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * Convierte una respuesta de error de la API en un mensaje legible.
 */
async function describeApiError(response) {
  let detail = '';

  try {
    const text = await response.text();

    if (text) {
      try {
        const parsed = JSON.parse(text);
        detail = parsed?.detail || parsed?.message || '';
      } catch {
        detail = text;
      }
    }
  } catch {
    // Conservamos el estado HTTP como única fuente.
  }

  switch (response.status) {
    case 400:
      return `Archivo no válido${detail ? `: ${detail}` : '.'}`;
    case 413:
      return 'El archivo supera el tamaño máximo permitido.';
    case 401:
      return 'Sesión expirada. Vuelve a iniciar sesión.';
    case 500:
      return 'Error del servidor al subir el archivo.';
    default:
      return `No se pudo subir el archivo (HTTP ${response.status}).`;
  }
}

/**
 * Sube un único archivo a POST /api/v1/attachments.
 */
async function uploadAttachmentFile(file, idToken) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(
    `${API_BASE_URL}/api/v1/attachments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error(await describeApiError(response));
  }

  const data = await response.json();
  return data.attachment_id;
}

/**
 * Sube los adjuntos de forma secuencial, conservando el orden
 * seleccionado por el usuario, y devuelve sus attachment_id.
 */
async function uploadAttachments(attachmentsList, idToken) {
  const ids = [];

  for (const attachment of attachmentsList) {
    try {
      const attachmentId = await uploadAttachmentFile(
        attachment.file,
        idToken
      );
      ids.push(attachmentId);
    } catch (error) {
      throw new Error(
        `No se pudo subir "${attachment.file.name}": ${error.message}`
      );
    }
  }

  return ids;
}

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

function toTimestamp(value) {
  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp)
    ? timestamp
    : Date.now();
}

function mapBackendConversation(item) {
  return {
    id: item.conversation_id,
    conversationId: item.conversation_id,
    title: item.title || 'Nueva conversación',
    timestamp: toTimestamp(item.updated_at),
    isPinned: item.is_pinned ?? false,
    messages: [],
  };
}

function mapBackendMessages(messages, conversationId) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.map((message, index) => ({
    id: `${conversationId}-${index}-${message.role}`,
    type: message.role === 'user' ? 'user' : 'sapientia',
    content: message.content || '',
    graphData: null,
    thinkingTime: 0,
    attachments: (message.attachments || []).map(
      (attachment) => ({
        attachmentId: attachment.attachment_id,
        filename: attachment.filename,
        contentType: attachment.content_type,
        size: attachment.size,
        kind: (attachment.content_type || '').startsWith(
          'image/'
        )
          ? 'image'
          : 'document',
        previewUrl: null,
      })
    ),
  }));
}

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [chats, setChats] = useState([]);

  const [activeChatId, setActiveChatId] = useState(null);

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const [chatHistory, setChatHistory] = useState([]);

  const [historyLoading, setHistoryLoading] = useState(false);

  const historyLoadSeq = useRef(0);
  const selectSeq = useRef(0);

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const chatEndRef = useRef(null);
  const attachmentsRef = useRef([]);
  const messageUrlsRef = useRef([]);

  const clearMessageUrls = () => {
    messageUrlsRef.current.forEach((url) => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    });

    messageUrlsRef.current = [];
  };

  const getAttachmentUrl = useCallback(
    async (attachmentId) => {
      if (!user) {
        return null;
      }

      try {
        const idToken = await user.getIdToken();

        const response = await fetch(
          `${API_BASE_URL}/api/v1/attachments/${attachmentId}/url`,
          {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          }
        );

        if (!response.ok) {
          return null;
        }

        const data = await response.json();

        return data.url || null;
      } catch {
        return null;
      }
    },
    [user]
  );

  const buildMessageAttachments = (
    selected,
    uploadedIds
  ) =>
    selected.map((item, index) => {
      const isImage = item.kind === 'image';
      const previewUrl = isImage
        ? URL.createObjectURL(item.file)
        : null;

      if (previewUrl) {
        messageUrlsRef.current.push(previewUrl);
      }

      return {
        attachmentId: uploadedIds[index],
        filename: item.file.name,
        contentType: item.file.type || '',
        size: item.file.size,
        kind: item.kind,
        previewUrl,
      };
    });

  const clearComposerAttachments = () => {
    attachmentsRef.current.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });

    setAttachments([]);
  };

  const fetchFileFromAttachment = async (attachment) => {
    if (!user) {
      throw new Error('Sin sesión.');
    }

    const idToken = await user.getIdToken();

    const urlResponse = await fetch(
      `${API_BASE_URL}/api/v1/attachments/${attachment.attachmentId}/url`,
      {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      }
    );

    if (!urlResponse.ok) {
      throw new Error(`HTTP ${urlResponse.status}`);
    }

    const data = await urlResponse.json();
    const url = data.url;

    if (!url) {
      throw new Error('Sin URL de descarga.');
    }

    const blobResponse = await fetch(url);

    if (!blobResponse.ok) {
      throw new Error(`HTTP ${blobResponse.status}`);
    }

    const blob = await blobResponse.blob();

    return new File([blob], attachment.filename, {
      type: attachment.contentType || 'application/octet-stream',
    });
  };

  const focusTextarea = () => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();

      const length =
        textareaRef.current?.value.length || 0;

      textareaRef.current?.setSelectionRange(
        length,
        length
      );

      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height =
          `${Math.min(
            textareaRef.current.scrollHeight,
            170
          )}px`;
      }
    });
  };

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
    clearMessageUrls();
    setChatHistory([]);
    setMessage('');

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const handleRenameChat = async (chatId, newTitle) => {
    const title = newTitle?.trim();

    if (!title) {
      return;
    }

    const chat = chats.find((item) => item.id === chatId);

    if (!chat) {
      return;
    }

    if (!chat.conversationId || !user) {
      setChats((prev) =>
        prev.map((item) =>
          item.id === chatId
            ? { ...item, title }
            : item
        )
      );
      return;
    }

    try {
      const idToken = await user.getIdToken();

      const response = await fetch(
        `${API_BASE_URL}/api/v1/history/conversations/${chat.conversationId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title }),
        }
      );

      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}`);
      }

      const data = await response.json();

      setChats((prev) =>
        prev.map((item) =>
          item.id === chatId
            ? { ...item, title: data.title || title }
            : item
        )
      );
    } catch (error) {
      console.error('Error al renombrar:', error);
      alert('No se pudo renombrar la conversación.');
    }
  };

  const handlePinChat = async (chatId) => {
    const chat = chats.find((item) => item.id === chatId);

    if (!chat) {
      return;
    }

    const nextPinned = !chat.isPinned;

    if (!chat.conversationId || !user) {
      setChats((prev) =>
        prev.map((item) =>
          item.id === chatId
            ? { ...item, isPinned: nextPinned }
            : item
        )
      );
      return;
    }

    try {
      const idToken = await user.getIdToken();

      const response = await fetch(
        `${API_BASE_URL}/api/v1/history/conversations/${chat.conversationId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_pinned: nextPinned }),
        }
      );

      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}`);
      }

      const data = await response.json();

      setChats((prev) =>
        prev.map((item) =>
          item.id === chatId
            ? { ...item, isPinned: data.is_pinned ?? false }
            : item
        )
      );
    } catch (error) {
      console.error('Error al fijar el chat:', error);
      alert('No se pudo actualizar el chat.');
    }
  };

  const handleDeleteChat = async (chatId) => {
    if (
      !window.confirm(
        '¿Estás seguro de que quieres eliminar este chat?'
      )
    ) {
      return;
    }

    const chat = chats.find((item) => item.id === chatId);

    if (!chat) {
      return;
    }

    if (chat.conversationId && user) {
      try {
        const idToken = await user.getIdToken();

        const response = await fetch(
          `${API_BASE_URL}/api/v1/history/conversations/${chat.conversationId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          }
        );

        if (response.status !== 204) {
          throw new Error(`Error HTTP ${response.status}`);
        }
      } catch (error) {
        console.error('Error al eliminar:', error);
        alert('No se pudo eliminar la conversación.');
        return;
      }
    }

    const remaining = chats.filter(
      (item) => item.id !== chatId
    );

    setChats(remaining);

    if (chatId === activeChatId) {
      const nextChat = remaining[0] || null;

      if (nextChat) {
        handleSelectChat(nextChat.id);
      } else {
        setActiveChatId(null);
        setChatHistory([]);
      }
    }
  };

  const handleSelectChat = async (chatId) => {
    const selectedChat = chats.find(
      (chat) => chat.id === chatId
    );

    const seq = ++selectSeq.current;

    clearMessageUrls();

    setActiveChatId(chatId);
    setMessage('');

    if (!selectedChat?.conversationId || !user) {
      setChatHistory(selectedChat?.messages || []);
    } else {
      setChatHistory([]);
      setHistoryLoading(true);

      try {
        const idToken = await user.getIdToken();

        const response = await fetch(
          `${API_BASE_URL}/api/v1/history/conversations/${selectedChat.conversationId}`,
          {
            headers: {
              Authorization: `Bearer ${idToken}`,
              Accept: 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Error HTTP ${response.status}`);
        }

        const data = await response.json();

        if (seq !== selectSeq.current) {
          return;
        }

        const messages = mapBackendMessages(
          data.messages,
          selectedChat.conversationId
        );

        setChatHistory(messages);
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === chatId
              ? { ...chat, messages }
              : chat
          )
        );
      } catch (error) {
        if (seq === selectSeq.current) {
          console.error(
            'Error al cargar la conversación:',
            error
          );
          setChatHistory([]);
        }
      } finally {
        if (seq === selectSeq.current) {
          setHistoryLoading(false);
        }
      }
    }

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const loadHistory = async (currentUser) => {
    const seq = ++historyLoadSeq.current;

    setHistoryLoading(true);

    try {
      const idToken = await currentUser.getIdToken();

      const response = await fetch(
        `${API_BASE_URL}/api/v1/history/conversations`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}`);
      }

      const data = await response.json();

      if (seq !== historyLoadSeq.current) {
        return;
      }

      setChats((data.items || []).map(mapBackendConversation));
      setActiveChatId(null);
      setChatHistory([]);
    } catch (error) {
      if (seq === historyLoadSeq.current) {
        console.error('Error al cargar el historial:', error);
        setChats([]);
        setActiveChatId(null);
        setChatHistory([]);
      }
    } finally {
      if (seq === historyLoadSeq.current) {
        setHistoryLoading(false);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);

        if (currentUser) {
          loadHistory(currentUser);
        } else {
          historyLoadSeq.current += 1;
          selectSeq.current += 1;
          setChats([]);
          setChatHistory([]);
          setActiveChatId(null);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [chatHistory, loading]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      clearMessageUrls();

      attachmentsRef.current.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, []);

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
      clearMessageUrls();
      setChatHistory([]);
      setActiveChatId(null);
      setChats([]);
    } catch (error) {
      console.error(
        'Error al cerrar sesión:',
        error
      );
    }
  };

  const handleFilesChange = (event) => {
    const files = Array.from(
      event.target.files || []
    );

    event.target.value = '';

    if (files.length === 0) {
      return;
    }

    const accepted = [];
    const rejected = [];

    for (const file of files) {
      const name = file.name || '';

      const ext = name.includes('.')
        ? `.${name
            .slice(name.lastIndexOf('.') + 1)
            .toLowerCase()}`
        : '';

      let mime = (file.type || '').toLowerCase();

      if (!mime && ext && EXTENSION_TO_MIME[ext]) {
        mime = EXTENSION_TO_MIME[ext];
      }

      if (!ALLOWED_MIME_TYPES.has(mime)) {
        rejected.push(`${name}: tipo no permitido.`);
        continue;
      }

      if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
        rejected.push(`${name}: extensión no permitida.`);
        continue;
      }

      const isImage = IMAGE_MIME_TYPES.has(mime);
      const maxSize = isImage
        ? MAX_IMAGE_SIZE_BYTES
        : MAX_DOCUMENT_SIZE_BYTES;

      if (file.size > maxSize) {
        rejected.push(
          `${name}: supera el límite de ${
            maxSize / (1024 * 1024)
          } MB.`
        );
        continue;
      }

      accepted.push({
        id: `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}`,
        file,
        previewUrl: isImage
          ? URL.createObjectURL(file)
          : null,
        kind: isImage ? 'image' : 'document',
      });
    }

    if (rejected.length > 0) {
      setAttachmentError(rejected.join(' '));
    } else {
      setAttachmentError('');
    }

    if (accepted.length > 0) {
      setAttachments((prev) => [
        ...prev,
        ...accepted,
      ]);
    }
  };

  const removeAttachment = (id) => {
    const target = attachments.find(
      (item) => item.id === id
    );

    if (target?.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
    }

    setAttachments((prev) =>
      prev.filter((item) => item.id !== id)
    );
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

    attachmentsRef.current.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });

    setAttachments([]);

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

    if (!pregunta && attachments.length === 0) {
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

    /*
     * Snapshot de los adjuntos ANTES de cualquier reset. Los
     * objetos File sobreviven aunque el estado local se limpie
     * más adelante.
     */
    const selectedAttachments = attachments;

    const firstImage =
      selectedAttachments.find(
        (item) => item.kind === 'image'
      ) || null;

    const userMessage = {
      id: `${Date.now()}-user`,
      type: 'user',
      content:
        pregunta ||
        (firstImage
          ? '(imagen adjunta)'
          : '(archivo adjunto)'),
    };

    const nextMessages = [
      ...chatHistory,
      userMessage,
    ];

    setLoading(true);

    const requestStart =
      performance.now();

    let uploadsDone = false;

    try {
      const idToken =
        await user.getIdToken();

      // 1) Subir adjuntos de forma secuencial (conserva el orden).
      let uploadedAttachmentIds = [];

      if (selectedAttachments.length > 0) {
        uploadedAttachmentIds = await uploadAttachments(
          selectedAttachments,
          idToken
        );
      }

      uploadsDone = true;

      // 2) Construir la metadata de attachments del mensaje.
      userMessage.attachments = buildMessageAttachments(
        selectedAttachments,
        uploadedAttachmentIds
      );

      // 3) Limpiar el compositor (revoca solo URLs del compositor).
      resetInput();
      setAttachmentError('');

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

      if (firstImage) {
        const formData = new FormData();

        formData.append(
          'image',
          firstImage.file
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

      // 4) Añadir el mensaje del usuario al chat (tras subida + visión).
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
          (firstImage
            ? 'Analiza esta imagen y explícame lo que contiene.'
            : 'He adjuntado un archivo.'),
        conversation_id:
          conversationId,
        vision_text: visionText,
        attachment_ids: uploadedAttachmentIds,
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

      /*
       * Si la subida de adjuntos falló, NO enviamos el mensaje al
       * chat. Conservamos los archivos en el compositor y mostramos
       * el error inline para que el usuario pueda reintentar.
       */
      if (!uploadsDone) {
        setAttachmentError(
          error?.message ||
            'No se pudo subir el archivo.'
        );
        return;
      }

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

  const editUserMessage = async (message) => {
    if (!message) {
      return;
    }

    const content = message.content || '';
    const historicalAttachments = message.attachments || [];

    const isPlaceholder =
      content === '(imagen adjunta)' ||
      content === '(archivo adjunto)';

    setEditing(true);
    setAttachmentError('');

    // 1) Limpiar adjuntos actuales del compositor (revocar URLs).
    clearComposerAttachments();

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // 2) Recuperar el texto.
    setMessage(isPlaceholder ? '' : content);

    // 3) Reconstruir los adjuntos históricos.
    if (historicalAttachments.length === 0) {
      setEditing(false);
      focusTextarea();
      return;
    }

    const reconstructed = [];
    const failed = [];

    for (const attachment of historicalAttachments) {
      try {
        const file = await fetchFileFromAttachment(
          attachment
        );
        const isImage = attachment.kind === 'image';

        reconstructed.push({
          id: `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 9)}`,
          file,
          previewUrl: isImage
            ? URL.createObjectURL(file)
            : null,
          kind: attachment.kind,
        });
      } catch (error) {
        console.error(
          'No se pudo recuperar el adjunto:',
          attachment.filename,
          error
        );
        failed.push(attachment.filename);
      }
    }

    if (reconstructed.length > 0) {
      setAttachments(reconstructed);
    }

    if (failed.length > 0) {
      setAttachmentError(
        `No se pudo recuperar: ${failed.join(', ')}.`
      );
    }

    setEditing(false);
    focusTextarea();
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
            onGetImageUrl={getAttachmentUrl}
          />

          <InputBar
            value={message}
            onChange={setMessage}
            onSend={sendRequest}
            onKeyDown={handleKeyDown}
            onInput={autoResize}
            loading={loading || historyLoading || editing}
            attachments={attachments}
            attachmentError={attachmentError}
            editing={editing}
            onRemoveAttachment={removeAttachment}
            fileInputRef={fileInputRef}
            onFilesChange={handleFilesChange}
            textareaRef={textareaRef}
          />
        </section>
      </main>
    </div>
  );
}