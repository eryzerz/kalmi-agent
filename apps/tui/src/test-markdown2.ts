import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

marked.setOptions({
  renderer: new TerminalRenderer(),
});

const result = marked.parse('# Hello\n\nThis is **bold** and `code`.\n\n- list item 1\n- list item 2\n\n```js\nconst x = 1;\n```') as string;
console.log(result);
