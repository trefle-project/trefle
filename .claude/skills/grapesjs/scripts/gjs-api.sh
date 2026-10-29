#!/usr/bin/env bash
# Look up the real GrapesJS API in the typings installed in this project,
# instead of recalling method names from memory.
#
#   gjs-api.sh <pattern>          grep the typings, with context
#   gjs-api.sh --type <Name>      print a full interface / type / enum block
#   gjs-api.sh --events           list the typed event enums and their string values
#   gjs-api.sh --version          installed grapesjs / @grapesjs/* / grapesjs-* versions
#
# Run it from anywhere inside the project. Resolution works with npm, pnpm,
# yarn and monorepo workspaces.

set -uo pipefail

# This script exists to print things. If the reader stops early — `| head -5`,
# `| grep -q`, a pager quit — that is success, not failure. Without this trap
# bash exits 141 (SIGPIPE), which a caller running `set -e` reports as a broken
# lookup.
trap 'exit 0' PIPE

die() { echo "$@" >&2; exit 1; }

# Resolve grapesjs through node first — that handles pnpm's nested store,
# yarn workspaces and monorepo subdirectories. Fall back to a path walk.
resolve_pkg_dir() {
  local dir
  dir="$(node -e "
    try {
      console.log(require('path').dirname(require.resolve('grapesjs/package.json', { paths: [process.cwd()] })));
    } catch (e) { process.exit(1); }
  " 2>/dev/null)" && [ -n "$dir" ] && { echo "$dir"; return 0; }

  dir="$PWD"
  while [ "$dir" != "/" ]; do
    [ -d "$dir/node_modules/grapesjs" ] && { echo "$dir/node_modules/grapesjs"; return 0; }
    dir="$(dirname "$dir")"
  done
  return 1
}

find_dts() {
  local pkg types
  pkg="$(resolve_pkg_dir)" || return 1

  # Prefer whatever package.json declares, so this keeps working if the path moves.
  types="$(node -p "
    try { require('$pkg/package.json').types || require('$pkg/package.json').typings || '' }
    catch (e) { '' }
  " 2>/dev/null)"

  [ -n "$types" ] && [ -f "$pkg/$types" ] && { echo "$pkg/$types"; return 0; }

  for p in dist/index.d.ts dist/grapes.d.ts index.d.ts; do
    [ -f "$pkg/$p" ] && { echo "$pkg/$p"; return 0; }
  done
  return 1
}

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; }

case "${1:---help}" in
  --help|-h) usage; exit 0 ;;
esac

DTS="$(find_dts)" || die "grapesjs typings not found. Is grapesjs installed in this project?
Tried require.resolve('grapesjs/package.json') and a node_modules walk up from $PWD.
If grapesjs is not installed yet, rely on the verified API in the skill's reference files."

case "$1" in
  --version)
    node -e "
      const path = require('path');
      let root;
      try { root = path.dirname(require.resolve('grapesjs/package.json', { paths: [process.cwd()] })); }
      catch (e) { root = null; }
      if (root) console.log('grapesjs', require(root + '/package.json').version, '(resolved)');
      // Also report what the project *declares*, which may be a range.
      const dirs = [process.cwd()];
      let d = process.cwd();
      while (d !== path.parse(d).root) { d = path.dirname(d); dirs.push(d); }
      for (const dir of dirs) {
        let pkg;
        try { pkg = require(dir + '/package.json'); } catch (e) { continue; }
        const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
        const hits = Object.entries(deps).filter(([k]) =>
          k === 'grapesjs' || k.startsWith('@grapesjs/') || k.startsWith('grapesjs-'));
        if (hits.length) {
          console.log('declared in ' + dir + '/package.json:');
          for (const [k, v] of hits) console.log('  ' + k + ' ' + v);
          break;
        }
      }
    "
    ;;

  --type)
    NAME="${2:-}"
    [ -n "$NAME" ] || die "usage: gjs-api.sh --type <InterfaceOrTypeOrEnumName>"
    echo "# typings: $DTS"
    # Print from the declaration line to its closing brace at column 0 of the
    # block. The line cap lives inside awk rather than in a `| head`, so there is
    # no internal pipe for a downstream reader to break (see the PIPE trap above).
    awk -v name="$NAME" '
      $0 ~ ("(interface|type|enum|declare class|class) " name "([ <:{]|$)") { inblk = 1 }
      inblk { print NR": "$0; if (++n >= 200) exit }
      inblk && /^}/ { exit }
    ' "$DTS"
    ;;

  --events)
    echo "# typings: $DTS"
    awk '
      /^declare enum [A-Za-z]*Events/ { inblk = 1; print ""; print $0; next }
      inblk && /= "/ { print $0; next }
      inblk && /^}/ { print "}"; inblk = 0 }
    ' "$DTS"
    ;;

  *)
    echo "# typings: $DTS"
    # Capture first, then cap — grep has finished before anything is printed, so
    # a reader that stops early cannot kill it mid-scan.
    matches="$(grep -nE -B1 -A3 -- "$1" "$DTS" 2>/dev/null || true)"
    if [ -z "$matches" ]; then
      echo "no match for '$1' in the installed typings"
    else
      awk 'NR<=80' <<<"$matches"
    fi
    ;;
esac

exit 0
