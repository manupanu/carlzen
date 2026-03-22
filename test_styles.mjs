import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Chessboard } from 'react-chessboard';

const options = {
      position: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
      squareStyles: { e2: { backgroundColor: 'yellow' } }
};
try {
  let html = renderToString(createElement(Chessboard, { options }));
  if (html.includes('yellow')) {
      console.log("SQUARESTYLE IS RENDERED");
  } else {
      console.log("SQUARESTYLE IS MISSING");
  }
} catch(e) { console.log(e.message); }
