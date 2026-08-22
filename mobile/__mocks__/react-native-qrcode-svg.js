const React = require('react');
const { View } = require('react-native');

module.exports = props => React.createElement(View, { ...props, testID: 'qr-code' });
