import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Chessboard } from 'react-chessboard';

const props = {
      position: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
      customArrows: [{ startSquare: 'e2', endSquare: 'e4', color: 'red' }]
};
try {
  let html = renderToString(createElement(Chessboard, props));
  if (html.includes('arrowhead') || html.includes('<path')) {
      console.log("FLAT PROPS RENDERED SVG ARROWS!");
  } else {
      console.log("FLAT MAP FAILED!");
  }
} catch(e) { console.log(e.message); }
