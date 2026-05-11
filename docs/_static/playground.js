// Pyodide-powered Run button for SDXPY code samples.
// Docs:
//   https://pyodide.org/en/stable/usage/quickstart.html
//   https://pyodide.org/en/stable/usage/api/js-api.html

const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.0/full/";

// Start small: only these files get a Run button on this page.
const ALLOWED = new Set(["brute_force_1.py", "brute_force_2.py"]);

// Hard-coded for the dup chapter's tests/ fixtures. The .sh files invoke
// `python <name>.py tests/*.txt`; we mirror that argv exactly.
const TEST_FILES = ["a1.txt", "a2.txt", "a3.txt", "b1.txt", "b2.txt", "c1.txt"];

let pyodidePromise = null;
function getPyodide() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = PYODIDE_INDEX_URL + "pyodide.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      return await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
    })();
  }
  return pyodidePromise;
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("fetch " + url + " -> " + r.status);
  return await r.text();
}

const sourceCache = new Map();
async function fetchSource(filename) {
  if (!sourceCache.has(filename)) {
    sourceCache.set(filename, fetchText("./" + filename));
  }
  return sourceCache.get(filename);
}

// Syntax highlighting for the modal source.
// Docs: https://highlightjs.org/usage/
const HLJS_BASE = "https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0";
let hljsPromise = null;
function getHljs() {
  if (!hljsPromise) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = HLJS_BASE + "/styles/github.min.css";
    document.head.appendChild(link);
    hljsPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = HLJS_BASE + "/highlight.min.js";
      s.onload = () => resolve(window.hljs);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return hljsPromise;
}

let modalEl = null;
function getModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement("div");
  modalEl.className = "playground-modal-backdrop";
  modalEl.hidden = true;
  modalEl.innerHTML =
    '<div class="playground-modal" role="dialog" aria-modal="true">' +
      '<div class="playground-modal-header">' +
        '<span class="playground-modal-title"></span>' +
        '<button class="playground-modal-close" aria-label="Close">×</button>' +
      '</div>' +
      '<pre class="playground-modal-source"><code class="language-python"></code></pre>' +
    '</div>';
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeModal();
  });
  modalEl.querySelector(".playground-modal-close").addEventListener("click", closeModal);
  document.body.appendChild(modalEl);
  return modalEl;
}
function openModal(title, source) {
  const m = getModal();
  m.querySelector(".playground-modal-title").textContent = title;
  const codeEl = m.querySelector(".playground-modal-source code");
  codeEl.textContent = source;
  codeEl.className = "language-python";
  delete codeEl.dataset.highlighted;
  m.hidden = false;
  document.addEventListener("keydown", onModalKey);
  getHljs().then((hljs) => {
    if (hljs) hljs.highlightElement(codeEl);
  }).catch(() => {});
}
function closeModal() {
  if (modalEl) modalEl.hidden = true;
  document.removeEventListener("keydown", onModalKey);
}
function onModalKey(e) {
  if (e.key === "Escape") closeModal();
}

async function ensureFixtures(pyodide) {
  try { pyodide.FS.mkdir("tests"); } catch (e) {}
  for (const name of TEST_FILES) {
    const text = await fetchText("./tests/" + name);
    pyodide.FS.writeFile("tests/" + name, text);
  }
}

async function runScript(scriptName, outputEl, overrideSource) {
  outputEl.textContent = "Loading Python (~7 MB, first time only)...";
  const pyodide = await getPyodide();
  await ensureFixtures(pyodide);
  const source = overrideSource !== undefined ? overrideSource : await fetchSource(scriptName);

  let captured = "";
  pyodide.setStdout({ batched: (s) => { captured += s + "\n"; } });
  pyodide.setStderr({ batched: (s) => { captured += s + "\n"; } });

  const argv = [scriptName, ...TEST_FILES.map(n => "tests/" + n)];
  pyodide.globals.set("__sdxpy_argv", pyodide.toPy(argv));
  pyodide.runPython("import sys; sys.argv = list(__sdxpy_argv)");

  outputEl.textContent = "Running...";
  try {
    pyodide.runPython(source);
    outputEl.textContent = captured || "(no output)";
  } catch (e) {
    outputEl.textContent = captured + "\n" + e.message;
  }
}

function enhance() {
  const blocks = Array.from(document.querySelectorAll("div[data-inc]"));
  const byFile = new Map();
  for (const b of blocks) {
    const f = b.getAttribute("data-inc");
    if (!ALLOWED.has(f)) continue;
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(b);
  }
  for (const [filename, group] of byFile) {
    const outName = filename.replace(/\.py$/, ".out");
    const outBlock = document.querySelector('div[data-inc="' + outName + '"]');
    const anchor = outBlock || group[group.length - 1];
    const wrap = document.createElement("div");
    wrap.className = "playground";
    const btn = document.createElement("button");
    btn.className = "playground-run";
    btn.textContent = "▶ python " + filename + " tests/*.txt";
    const info = document.createElement("button");
    info.className = "playground-secondary";
    info.type = "button";
    info.setAttribute("aria-label", "Show full source of " + filename);
    info.textContent = "View source";
    const edit = document.createElement("button");
    edit.className = "playground-secondary";
    edit.type = "button";
    edit.setAttribute("aria-label", "Edit source of " + filename);
    edit.textContent = "Edit ▾";
    const editor = document.createElement("div");
    editor.className = "playground-editor";
    editor.hidden = true;
    const textarea = document.createElement("textarea");
    textarea.className = "playground-editor-textarea";
    textarea.spellcheck = false;
    const editRun = document.createElement("button");
    editRun.className = "playground-run playground-editor-run";
    editRun.type = "button";
    editRun.textContent = "▶ Run edited";
    editRun.disabled = true;
    let originalSource = "";
    textarea.addEventListener("input", () => {
      editRun.disabled = textarea.value === originalSource;
    });
    const reset = document.createElement("button");
    reset.className = "playground-editor-reset";
    reset.type = "button";
    reset.textContent = "reset to original";
    const editorControls = document.createElement("div");
    editorControls.className = "playground-editor-controls";
    editorControls.appendChild(editRun);
    editorControls.appendChild(reset);
    editor.appendChild(textarea);
    editor.appendChild(editorControls);
    const out = document.createElement("pre");
    out.className = "playground-output";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      runScript(filename, out).finally(() => { btn.disabled = false; });
    });
    editRun.addEventListener("click", () => {
      editRun.disabled = true;
      runScript(filename, out, textarea.value).finally(() => { editRun.disabled = false; });
    });
    info.addEventListener("click", async () => {
      info.disabled = true;
      try {
        const src = await fetchSource(filename);
        openModal(filename, src);
      } finally {
        info.disabled = false;
      }
    });
    edit.addEventListener("click", async () => {
      if (editor.hidden) {
        edit.disabled = true;
        try {
          if (!originalSource) {
            originalSource = await fetchSource(filename);
            textarea.value = originalSource;
            editRun.disabled = true;
          }
          editor.hidden = false;
          edit.setAttribute("aria-pressed", "true");
          edit.textContent = "Edit ▴";
          textarea.focus();
        } finally {
          edit.disabled = false;
        }
      } else {
        editor.hidden = true;
        edit.removeAttribute("aria-pressed");
        edit.textContent = "Edit ▾";
      }
    });
    reset.addEventListener("click", async () => {
      if (!originalSource) originalSource = await fetchSource(filename);
      textarea.value = originalSource;
      editRun.disabled = true;
      textarea.focus();
    });
    wrap.appendChild(btn);
    wrap.appendChild(info);
    wrap.appendChild(edit);
    wrap.appendChild(editor);
    wrap.appendChild(out);
    anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", enhance);
} else {
  enhance();
}
