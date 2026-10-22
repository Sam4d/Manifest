function references(text, ext) {
  const out = new Set();
  // Bounded, direct tokens: never search across an entire module for a later `from`.
  const patterns =
    ext === ".css" || ext === ".scss"
      ? [
          /url\([ \t\r\n]{0,256}['"]?([^)'"\s]{1,4096})['"]?[ \t\r\n]{0,256}\)/gi,
          /@import[ \t\r\n]{1,256}['"]([^'"\r\n]{1,4096})['"]/gi,
        ]
      : [
          /\b(?:src|href|poster|action)[ \t\r\n]{0,256}=[ \t\r\n]{0,256}['"]([^'"\r\n]{1,4096})['"]/gi,
          /\bfrom[ \t\r\n]{1,256}['"]([^'"\r\n]{1,4096})['"]/g,
          /\bimport[ \t\r\n]{1,256}['"]([^'"\r\n]{1,4096})['"]/g,
          /\b(?:import|require)[ \t\r\n]{0,256}\([ \t\r\n]{0,256}['"]([^'"\r\n]{1,4096})['"][ \t\r\n]{0,256}\)/g,
        ];
  for (const pattern of patterns)
    for (const match of text.matchAll(pattern)) {
      out.add(match[1]);
      if (out.size >= 2000) return [...out];
    }
  return [...out];
}
async function htmlStructure(source) {
  const { parse } = await import("parse5");
  const document = parse(source);
  let count = 0,
    truncated = false;
  const titles = [],
    headings = [],
    elements = {},
    content = [],
    metadata = [];
  function plain(node) {
    const stack = [node],
      parts = [];
    let length = 0;
    while (stack.length && length < 30000) {
      const current = stack.pop();
      if (current.nodeName === "#text") {
        parts.push(current.value);
        length += current.value.length;
      } else
        for (let i = (current.childNodes || []).length - 1; i >= 0; i--)
          stack.push(current.childNodes[i]);
    }
    return parts.join(" ").slice(0, 30000);
  }
  function visit(node, depth = 0) {
    if (count >= 2000 || depth > 80) {
      truncated = true;
      return null;
    }
    if (!node.tagName) {
      const children = (node.childNodes || [])
        .map((child) => visit(child, depth + 1))
        .filter(Boolean);
      return children;
    }
    const tag = node.tagName,
      attrs = Object.fromEntries(
        (node.attrs || []).map((a) => [a.name, a.value]),
      );
    if (tag === "title") titles.push(plain(node).trim());
    if (tag === "meta")
      metadata.push({
        name: attrs.name || attrs.property || attrs["http-equiv"] || "",
        content: attrs.content || "",
      });
    if (/^(script|style|head|template)$/.test(tag)) {
      if (tag === "head")
        for (const child of node.childNodes || []) visit(child, depth + 1);
      return null;
    }
    if (/^h[1-6]$/.test(tag))
      headings.push({
        level: Number(tag[1]),
        text: plain(node).replace(/\s+/g, " ").trim(),
      });
    if (
      /^(header|nav|main|section|article|aside|footer|form|video|img|button|input)$/.test(
        tag,
      )
    )
      elements[tag] = (elements[tag] || 0) + 1;
    if (/^(p|h[1-6]|li|label|button)$/.test(tag))
      content.push(plain(node).replace(/\s+/g, " ").trim());
    count++;
    const children = (node.childNodes || [])
      .map((child) => visit(child, depth + 1))
      .flat()
      .filter(Boolean);
    return {
      tag,
      ...(attrs.id ? { id: attrs.id } : {}),
      ...(attrs.class
        ? { classes: attrs.class.split(/\s+/).slice(0, 20) }
        : {}),
      ...(attrs.role ? { role: attrs.role } : {}),
      children,
    };
  }
  const layout = visit(document).flat();
  return {
    title: titles[0] || "",
    headings: headings.slice(0, 200),
    elements,
    content: content.join("\n").slice(0, 30000),
    metadata: metadata.slice(0, 100),
    layout,
    layoutTruncated: truncated,
  };
}

module.exports = { references, htmlStructure };
