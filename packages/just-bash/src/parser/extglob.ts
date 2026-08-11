type Quote = "'" | '"' | "$'";

/** Find the closing parenthesis for an extglob starting at `openIndex`. */
export function findExtglobClose(value: string, openIndex: number): number {
  let depth = 1;
  let quote: Quote | undefined;

  for (let index = openIndex + 1; index < value.length; index++) {
    const character = value[index];

    if (quote) {
      if (character === "\\" && quote !== "'" && index + 1 < value.length) {
        index += 1;
      } else if (character === (quote === "$'" ? "'" : quote)) {
        quote = undefined;
      }
      continue;
    }

    if (character === "$" && value[index + 1] === "'") {
      quote = "$'";
      index += 1;
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
export function splitExtglobAlternatives(
  content: string,
  maximum: number = Number.POSITIVE_INFINITY,
): string[] | null {
  const alternatives: string[] = [];
  const braceEnds = findBraceEnds(content);
  let start = 0;
  let depth = 0;
  let quote: Quote | undefined;

  for (let index = 0; index < content.length; index++) {
    const character = content[index];

    if (quote) {
      if (character === "\\" && quote !== "'" && index + 1 < content.length) {
        index += 1;
      } else if (character === (quote === "$'" ? "'" : quote)) {
        quote = undefined;
      }
      continue;
    }

    if (character === "$" && content[index + 1] === "'") {
      quote = "$'";
      index += 1;
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

    if (braceEnds[index] > 0) {
      index = braceEnds[index] - 1;
      continue;
    }

    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    } else if (character === "|" && depth === 0) {
      if (alternatives.length >= maximum - 1) return null;
      alternatives.push(content.slice(start, index));
      start = index + 1;
    }
  }

  alternatives.push(content.slice(start));
  return alternatives;
}

function findBraceEnds(value: string): Int32Array {
  const ends = new Int32Array(value.length);
  const starts: number[] = [];
  let quote: Quote | undefined;

  for (let index = 0; index < value.length; index++) {
    const character = value[index];

    if (quote) {
      if (character === "\\" && quote !== "'" && index + 1 < value.length) {
        index += 1;
      } else if (character === (quote === "$'" ? "'" : quote)) {
        quote = undefined;
      }
      continue;
    }

    if (character === "$" && value[index + 1] === "'") {
      quote = "$'";
      index += 1;
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
      if (index === -1) return ends;
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
      starts.push(index);
    } else if (character === "}") {
      const start = starts.pop();
      if (start !== undefined) {
        ends[start] = index + 1;
      }
    }
  }

  return ends;
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
