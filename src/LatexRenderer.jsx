// src/LatexRenderer.jsx

import React from 'react';
import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/**
 * Determina si el contenido dentro de [...] parece realmente
 * una expresión matemática LaTeX.
 *
 * No depende de una lista cerrada de comandos: cualquier comando
 * LaTeX (backslash + letras), exponentes/subíndices u operadores
 * matemáticos se reconocen como matemática.
 */
function looksLikeLatex(value) {
  if (!value) return false;

  const text = value.trim();

  if (!text) return false;

  // Cualquier comando LaTeX (backslash seguido de letras).
  if (/\\[a-zA-Z]+/.test(text)) {
    return true;
  }

  // Exponentes o subíndices.
  if (/[A-Za-z0-9)\]}](\^|_)/.test(text)) {
    return true;
  }

  // Operadores matemáticos con contenido alfanumérico.
  if (
    /(?:[=<>]|[+\-*/])/.test(text) &&
    /[A-Za-z0-9]/.test(text)
  ) {
    return true;
  }

  return false;
}

/**
 * Convierte expresiones matemáticas escritas entre corchetes:
 *
 *   [\int_0^1 x^2\,dx]
 *
 * en:
 *
 *   $$
 *   \int_0^1 x^2\,dx
 *   $$
 *
 * Los corchetes normales ([texto]) se conservan.
 *
 * NOTA: usamos template literals (no String.replace) para generar
 * `$$`, de modo que el doble dólar se conserva literalmente.
 */
function normalizeBracketMath(content) {
  let result = '';
  let i = 0;

  while (i < content.length) {
    if (content[i] !== '[') {
      result += content[i];
      i += 1;
      continue;
    }

    let depth = 1;
    let j = i + 1;

    while (j < content.length && depth > 0) {
      if (content[j] === '[') {
        depth += 1;
      } else if (content[j] === ']') {
        depth -= 1;
      }

      j += 1;
    }

    // Corchete sin pareja: se conserva intacto.
    if (depth !== 0) {
      result += '[';
      i += 1;
      continue;
    }

    const inner = content.slice(i + 1, j - 1).trim();

    if (looksLikeLatex(inner)) {
      result += `\n\n$$\n${inner}\n$$\n\n`;
    } else {
      result += `[${inner}]`;
    }

    i = j;
  }

  return result;
}

/**
 * Protege los bloques de código para que la normalización
 * matemática nunca modifique su contenido.
 */
function normalizeNonCodeContent(content) {
  const parts = content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);

  return parts
    .map((part, index) => {
      // Elementos impares = bloques de código.
      if (index % 2 === 1) {
        return part;
      }

      return normalizeMathContent(part);
    })
    .join('');
}

/**
 * Normalización principal de delimitadores matemáticos.
 *
 * IMPORTANTE: usamos split/join (y no String.replace con cadena de
 * reemplazo) porque JavaScript interpreta `$$` dentro de la cadena
 * de reemplazo de String.replace como un único `$` literal, lo que
 * colapsaba `$$` -> `$` y rompía el renderizado de bloque.
 */
function normalizeMathContent(content) {
  let result = content;

  // \(...\) → $...$ (inline)
  result = result.split('\\(').join('$');
  result = result.split('\\)').join('$');

  // \[...\] → $$...$$ (bloque)
  result = result.split('\\[').join('\n\n$$\n');
  result = result.split('\\]').join('\n$$\n\n');

  // Proteger $$...$$ y $...$ que ya están correctamente delimitados.
  const mathBlocks = [];

  result = result.replace(
    /\$\$[\s\S]*?\$\$|\$(?!\$)[\s\S]*?\$(?!\$)/g,
    (match) => {
      const placeholder =
        `SAPIENTIA_MATH_${mathBlocks.length}_PLACEHOLDER`;
      mathBlocks.push(match);
      return placeholder;
    }
  );

  // Convertir [...] → $$...$$
  result = normalizeBracketMath(result);

  // Restaurar (split/join para no someter `$$` a la sustitución de $).
  mathBlocks.forEach((math, index) => {
    result = result
      .split(`SAPIENTIA_MATH_${index}_PLACEHOLDER`)
      .join(math);
  });

  return result;
}

export default function LatexRenderer({ content }) {
  if (!content) {
    return null;
  }

  const cleanContent = normalizeNonCodeContent(content);

  if (!cleanContent.trim()) {
    return null;
  }

  return (
    <div
      className="latex-renderer"
      style={{
        lineHeight: '1.8',
        fontSize: '1.1rem',
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  );
}