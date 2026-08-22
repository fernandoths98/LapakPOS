const React = require('react');
const { View } = require('react-native');

const Icon = props => React.createElement(View, { ...props, testID: props.testID || 'icon' });

module.exports = new Proxy(
  { __esModule: true },
  {
    get(target, property) {
      if (property === '__esModule') return true;
      return Icon;
    },
  },
);
