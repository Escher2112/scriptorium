// Scriptorium engine bundle: Toast UI Editor + ProseMirror + colour plugin + Prism highlighting, one IIFE.
import Editor from '@toast-ui/editor';
import colorSyntax from '@toast-ui/editor-plugin-color-syntax';
import codeSyntaxHighlight from '@toast-ui/editor-plugin-code-syntax-highlight';
import { undo, redo, undoDepth, redoDepth } from 'prosemirror-history';
import { EditorState } from 'prosemirror-state';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-fortran';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-powershell';
import 'prismjs/components/prism-latex';
const hl = [codeSyntaxHighlight, { highlighter: Prism }];
window.toastui = window.toastui || {};
window.toastui.Editor = Editor;
Editor.plugin = Object.assign(Editor.plugin || {}, { colorSyntax, codeSyntaxHighlight: hl });
// expose the engine's own history so the app can chain: engine undo first, document snapshots after
window.toastui.pmHistory = { undo, redo, undoDepth, redoDepth };
window.toastui.pm = { EditorState };   // lets the app rebuild a view's state (fresh history) on document load
