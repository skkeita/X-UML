/*
 * Import de code Java → script X-UML (diagramme de classes).
 * Lit les classes, classes abstraites, interfaces, énumérations et records de premier niveau :
 * héritage, interfaces réalisées, attributs et opérations avec leur visibilité.
 * Les corps des méthodes sont ignorés ; les constructeurs aussi (convention UML usuelle).
 */

const VIS: Record<string, string> = { public: '+', private: '-', protected: '#' };

/** Retire commentaires, chaînes et caractères (leur contenu pourrait contenir des accolades). */
function clean(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/@\w+(\([^)]*\))?/g, ' '); // annotations
}

/** Indice de l'accolade fermante correspondant à celle en `open`. */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return i;
  }
  return s.length - 1;
}

/** Corps d'un type, réduit à ses déclarations de premier niveau (blocs internes remplacés par « ; »). */
function topLevel(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '{') {
      if (depth === 0) {
        out.push(`${cur.trim()} {}`);
        cur = '';
      }
      depth++;
      continue;
    }
    if (ch === '}') {
      depth--;
      continue;
    }
    if (depth > 0) continue;
    if (ch === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const simpleType = (t: string) =>
  t
    .replace(/\s+/g, ' ')
    .replace(/\bjava\.\w+(\.\w+)*\.(\w+)/g, '$2')
    .replace(/\bString\b/g, 'string')
    .replace(/\bInteger\b/g, 'int')
    .replace(/\bBoolean\b/g, 'bool')
    .replace(/\bboolean\b/g, 'bool')
    .replace(/\bDouble\b/g, 'double')
    .replace(/\bFloat\b/g, 'double')
    .replace(/\bLong\b/g, 'long')
    .replace(/\bLocalDate\b/g, 'Date')
    .trim();

interface JavaType {
  name: string;
  keyword: string;
  parents: string[];
  interfaces: string[];
  members: string[];
}

const TYPE_DECL = /\b((?:(?:public|protected|private|abstract|final|static|sealed|non-sealed|strictfp)\s+)*)(class|interface|enum|record)\s+([A-Za-z_]\w*)\s*(<[^{]*?>)?\s*(\([^)]*\))?\s*(?:extends\s+([^{]+?))?\s*(?:implements\s+([^{]+?))?\s*(?:permits\s+[^{]+?)?\s*\{/g;

/** Virgules de premier niveau (hors < >, ( ), { }). */
function splitTopComma(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if ('<({['.includes(ch)) depth++;
    if ('>)}]'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const splitList = (s?: string) =>
  (s ?? '')
    .split(/,(?![^<]*>)/)
    .map((x) => x.replace(/<.*$/, '').trim())
    .filter(Boolean);

function parseTypes(code: string): JavaType[] {
  const types: JavaType[] = [];
  TYPE_DECL.lastIndex = 0;
  let m: RegExpExecArray | null;
  let skipUntil = -1;
  while ((m = TYPE_DECL.exec(code))) {
    const openIdx = m.index + m[0].length - 1;
    if (m.index < skipUntil) continue; // type imbriqué : ignoré (on ne garde que le premier niveau)
    const close = matchBrace(code, openIdx);
    skipUntil = close;
    const [, mods, kw, name, , recordParams, ext, impl] = m;
    const isInterface = kw === 'interface';
    const keyword = kw === 'enum' ? 'enum' : isInterface ? 'interface' : /\babstract\b/.test(mods) ? 'abstract class' : 'class';
    const body = code.slice(openIdx + 1, close);
    const members: string[] = [];

    // Composants d'un record : des attributs.
    if (kw === 'record' && recordParams) {
      for (const p of recordParams.slice(1, -1).split(/,(?![^<]*>)/).map((x) => x.trim()).filter(Boolean)) {
        const parts = p.split(/\s+/);
        const n = parts.pop() ?? '';
        members.push(`- ${n}: ${simpleType(parts.join(' '))}`);
      }
    }

    const decls = topLevel(body);
    let rest = decls;
    // Énumération : la première déclaration liste les constantes.
    if (kw === 'enum' && decls.length) {
      const first = decls[0].replace(/\{\}$/, '');
      for (const c of first.split(/,(?![^(]*\))/).map((x) => x.replace(/\(.*$/s, '').trim()).filter((x) => /^[A-Za-z_]\w*$/.test(x))) members.push(c);
      rest = decls.slice(1);
    }

    for (const d of rest) {
      const isMethod = /\(/.test(d) && (/\{\}$/.test(d) || /\)\s*(throws\s+[\w.,\s]+)?$/.test(d));
      const text = d.replace(/\s*\{\}$/, '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const vis = (text.match(/\b(public|private|protected)\b/)?.[1] ?? (isInterface ? 'public' : '')) as string;
      const sym = VIS[vis] ?? '~';
      const isStatic = /\bstatic\b/.test(text);
      const core = text.replace(/\b(public|private|protected|static|final|abstract|synchronized|native|default|transient|volatile)\b/g, '').replace(/^<[^>]+>\s*/, '').trim();
      if (isMethod) {
        const mm = /^(.*?)([A-Za-z_]\w*)\s*\(([^)]*)\)/.exec(core);
        if (!mm) continue;
        const [, retRaw, mname, paramsRaw] = mm;
        if (!retRaw.trim()) continue; // constructeur
        const params = paramsRaw
          .split(/,(?![^<]*>)/)
          .map((p) => p.trim().replace(/\bfinal\b\s*/, ''))
          .filter(Boolean)
          .map((p) => {
            const parts = p.split(/\s+/);
            const n = parts.pop() ?? '';
            return `${n}: ${simpleType(parts.join(' '))}`;
          });
        members.push(`${sym} ${isStatic ? '{static} ' : ''}${mname}(${params.join(', ')}): ${simpleType(retRaw)}`);
      } else {
        // Type imbriqué : ignoré (seuls les types de premier niveau sont importés).
        if (/^(class|interface|enum|record)\b/.test(core)) continue;
        // Champ(s) : « int a = 3, b » → un attribut par nom (le type peut contenir < , >).
        let depth = 0;
        let i = 0;
        for (; i < core.length; i++) {
          const ch = core[i];
          if (ch === '<') depth++;
          else if (ch === '>') depth--;
          else if (/\s/.test(ch) && depth === 0 && core.slice(0, i).trim() && !/[<,]\s*$/.test(core.slice(0, i))) break;
        }
        const type = simpleType(core.slice(0, i));
        const names = splitTopComma(core.slice(i))
          .map((x) => x.split('=')[0].trim())
          .filter((x) => /^[A-Za-z_]\w*(\[\])*$/.test(x));
        for (const n of names) members.push(`${sym} ${isStatic ? '{static} ' : ''}${n.replace(/\[\]/g, '')}: ${type}${/\[\]/.test(n) ? '[]' : ''}`);
      }
    }
    types.push({
      name,
      keyword,
      parents: isInterface ? splitList(ext) : splitList(ext).slice(0, 1),
      interfaces: isInterface ? [] : splitList(impl),
      members,
    });
  }
  return types;
}

/** Code Java (un ou plusieurs fichiers concaténés) → script X-UML. null si aucun type n'est trouvé. */
export function javaToScript(source: string): string | null {
  const types = parseTypes(clean(source));
  if (types.length === 0) return null;
  const blocks = types.map((t) => {
    const clauses = `${t.parents.length ? ` extends ${t.parents.join(', ')}` : ''}${t.interfaces.length ? ` implements ${t.interfaces.join(', ')}` : ''}`;
    if (t.members.length === 0) return `${t.keyword} ${t.name}${clauses}`;
    return `${t.keyword} ${t.name}${clauses} {\n${t.members.map((m) => `  ${m}`).join('\n')}\n}`;
  });
  return `// Importé depuis du code Java\n\n${blocks.join('\n\n')}\n`;
}
