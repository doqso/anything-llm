const { contentForDiff } = require("../../jobs/helpers");

describe("contentForDiff", () => {
  it("strips an OCR detection block before the link marker", () => {
    const a =
      "Algo de texto.\n[Imagen: foo] (Contenido detectado: hola mundo) (Enlace: https://x.com/a.png)\nMás texto.";
    const b =
      "Algo de texto.\n[Imagen: foo] (Contenido detectado: HOLA MUNDOS) (Enlace: https://x.com/a.png)\nMás texto.";
    expect(contentForDiff(a)).toBe(contentForDiff(b));
  });

  it("still detects an image swap (different URL / alt)", () => {
    const a =
      "[Imagen: foo] (Contenido detectado: x) (Enlace: https://x.com/a.png)";
    const b =
      "[Imagen: bar] (Contenido detectado: x) (Enlace: https://x.com/b.png)";
    expect(contentForDiff(a)).not.toBe(contentForDiff(b));
  });

  it("survives parentheses inside the OCR text", () => {
    const a =
      "before [Imagen: x] (Contenido detectado: foo (a) bar (b)) (Enlace: https://x.com/i.png) after";
    const b =
      "before [Imagen: x] (Contenido detectado: completely different) (Enlace: https://x.com/i.png) after";
    expect(contentForDiff(a)).toBe(contentForDiff(b));
  });

  it("is a no-op for content without OCR markers", () => {
    const t = "Plain page content without any image OCR.";
    expect(contentForDiff(t)).toBe(t);
  });

  it("handles non-string input gracefully", () => {
    expect(contentForDiff(null)).toBeNull();
    expect(contentForDiff(undefined)).toBeUndefined();
  });
});
