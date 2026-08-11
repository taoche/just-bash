/** Find the closing parenthesis for an extglob starting at `openIndex`. */
export function findExtglobClose(value: string, openIndex: number): number {
  let depth = 1;
  let braceDepth = 0;
  let quote: "'" | '"' | undefined;

  for (let index = openIndex + 1; index < value.length; index++) {
    const character = value[index];

    if (quote) {
      if (character === "\\" && quote === '"' && index + 1 < value.length) {
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (character === "\\" && index + 1 < value.length) {
      index += 1;
      continue;
    }

    if (character === "`") {
      index = findBacktickClose(value, index);
      if (index === -1) return -1;
      continue;
    }

    if (character === "[") {
      const close = findBracketExpressionEnd(value, index);
      if (close !== -1) {
        index = close;
        continue;
      }
    }

    if (character === "{") {
      braceDepth += 1;
      continue;
    }

    if (character === "}" && braceDepth > 0) {
      braceDepth -= 1;
      continue;
    }

    if (braceDepth > 0) continue;

    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

/** Split top-level extglob alternatives without interpreting quoted or nested text. */
export function splitExtglobAlternatives(content: string): string[] {
  const alternatives: string[] = [];
  let start = 0;
  let depth = 0;
  let braceDepth = 0;
  let quote: "'" | '"' | undefined;

  for (let index = 0; index < content.length; index++) {
    const character = content[index];

    if (quote) {
      if (character === "\\" && quote === '"' && index + 1 < content.length) {
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (character === "\\" && index + 1 < content.length) {
      index += 1;
      continue;
    }

    if (character === "`") {
      index = findBacktickClose(content, index);
      if (index === -1) break;
      continue;
    }

    if (character === "[") {
      const close = findBracketExpressionEnd(content, index);
      if (close !== -1) {
        index = close;
        continue;
      }
    }

    if (character === "{") {
      braceDepth += 1;
      continue;
    }

    if (character === "}" && braceDepth > 0) {
      braceDepth -= 1;
      continue;
    }

    if (braceDepth > 0) continue;

    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    } else if (character === "|" && depth === 0) {
      alternatives.push(content.slice(start, index));
      start = index + 1;
    }
  }

  alternatives.push(content.slice(start));
  return alternatives;
}

function findBracketExpressionEnd(value: string, start: number): number {
  let index = start + 1;
  if (value[index] === "!" || value[index] === "^") index += 1;
  if (value[index] === "]") index += 1;

  while (index < value.length) {
    if (value[index] === "\\" && index + 1 < value.length) {
      index += 2;
      continue;
    }

    if (
      value[index] === "[" &&
      (value[index + 1] === ":" ||
        value[index + 1] === "." ||
        value[index + 1] === "=")
    ) {
      const delimiter = value[index + 1];
      const close = value.indexOf(`${delimiter}]`, index + 2);
      if (close !== -1) {
        index = close + 2;
        continue;
      }
    }

    if (value[index] === "]") return index;
    index += 1;
  }

  return -1;
}

function findBacktickClose(value: string, start: number): number {
  for (let index = start + 1; index < value.length; index++) {
    if (value[index] === "\\" && index + 1 < value.length) {
      index += 1;
    } else if (value[index] === "`") {
      return index;
    }
  }

  return -1;
}
