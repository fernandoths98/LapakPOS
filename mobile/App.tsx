/**
 * Lapak — Indonesian merchant POS
 *
 * @format
 */

import React from 'react';
import {Appearance, StatusBar, StyleSheet} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

// The app has a single light design (src/theme/tokens.ts) — pin the RN
// appearance to light so a device in system dark mode still gets it, matching
// the native `forceDarkAllowed=false` theme.
Appearance.setColorScheme('light');
import {NavigationContainer} from '@react-navigation/native';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from './src/state/api/queryClient';
import {RootNavigator} from './src/app/RootNavigator';
import {colors} from './src/theme/tokens';
import {SyncStatusBar} from './src/components/SyncStatusBar';
import {useSyncManager} from './src/state/offline/syncManager';

// One safe-area boundary protects every screen consistently. SyncStatusBar
// owns the top inset because it sits above NavigationContainer; the root
// SafeAreaView owns the left, right, and bottom insets for all navigators.
function App() {
  useSyncManager();

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <QueryClientProvider client={queryClient}>
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
          <SyncStatusBar />
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </SafeAreaView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});

export default App;
