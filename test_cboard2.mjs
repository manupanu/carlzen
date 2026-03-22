import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Chessboard } from 'react-chessboard';

const options = {
      position: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
      arrows: [{ startSquare: 'e2', endSquare: 'e4', color: 'red' }]
};
try {
  let html = renderToString(createElement(Chessboard, { options }));
  if (html.includes('arrowhead') || html.includes('<path')) {
      console.log("SVG IS RENDERED WITH OPTIONS PROP");
  } else {
      console.log("SVG MISSING IN OPTIONS PROP");
      
      let html2 = renderToString(createElement(Chessboard, { customArrows: options.arrows }));
      if (html2.includes('arrowhead') || html2.includes('<path')) {
          console.log("SVG IS RENDERED WITH CUSTOMARROWS PROP");
      } else {
          console.log("SVG COMPLETELY MISSING IN BOTH");
      }
  }
} catch(e) { console.log(e.message); }
