import React from 'react';
import ReactDOM from 'react-dom';

ReactDOM.render(<div>Hello world</div>, document.getElementById('root'));

// Hot Module Replacement
if (module.hot) {
  module.hot.accept();
}