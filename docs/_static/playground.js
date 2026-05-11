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

async function ensureFixtures(pyodide) {
  try { pyodide.FS.mkdir("tests"); } catch (e) {}
  for (const name of TEST_FILES) {
    const text = await fetchText("./tests/" + name);
    pyodide.FS.writeFile("tests/" + name, text);
  }
}

async function runScript(scriptName, outputEl) {
  outputEl.textContent = "Loading Python (~7 MB, first time only)...";
  const pyodide = await getPyodide();
  await ensureFixtures(pyodide);
  const source = await fetchText("./" + scriptName);

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
    const last = group[group.length - 1];
    const wrap = document.createElement("div");
    wrap.className = "playground";
    const btn = document.createElement("button");
    btn.className = "playground-run";
    btn.textContent = "Run " + filename;
    const out = document.createElement("pre");
    out.className = "playground-output";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      runScript(filename, out).finally(() => { btn.disabled = false; });
    });
    wrap.appendChild(btn);
    wrap.appendChild(out);
    last.parentNode.insertBefore(wrap, last.nextSibling);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", enhance);
} else {
  enhance();
}
