function looksLikeSvgMarkup(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("<svg") || trimmed.startsWith("<?xml");
}

function extractFromObject(value: Record<string, unknown>): string | null {
  const directSvg = value.svg;
  if (typeof directSvg === "string" && looksLikeSvgMarkup(directSvg)) {
    return directSvg;
  }

  const data = value.data;
  if (typeof data === "string") {
    if (looksLikeSvgMarkup(data)) {
      return data;
    }

    const svg = extractQuiverSvg(data);
    if (svg) return svg;
  }
  if (Array.isArray(data)) {
    for (const entry of data) {
      const svg = extractQuiverSvg(entry);
      if (svg) return svg;
    }
  } else if (data && typeof data === "object") {
    const svg = extractQuiverSvg(data);
    if (svg) return svg;
  }

  const generations = value.generations;
  if (Array.isArray(generations)) {
    for (const entry of generations) {
      const svg = extractQuiverSvg(entry);
      if (svg) return svg;
    }
  }

  return null;
}

export function extractQuiverSvg(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (looksLikeSvgMarkup(trimmed)) {
      return trimmed;
    }

    try {
      return extractQuiverSvg(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const svg = extractQuiverSvg(entry);
      if (svg) return svg;
    }
    return null;
  }

  if (value && typeof value === "object") {
    return extractFromObject(value as Record<string, unknown>);
  }

  return null;
}
