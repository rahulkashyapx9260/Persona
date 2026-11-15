/**
 * Persona — schedule-driven contact renaming.
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {Platform, StatusBar, Text, UIManager, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {Ambient} from './src/components/Ambient';
import {Navigator, Route} from './src/navigation/Navigator';
import {
  ContactNames as ContactNamesModule,
  isNativeModuleAvailable,
} from './src/native/ContactNames';
import {ContactDetailScreen} from './src/screens/ContactDetailScreen';
import {ContactsScreen} from './src/screens/ContactsScreen';
import {HistoryScreen} from './src/screens/HistoryScreen';
import {LandingScreen} from './src/screens/LandingScreen';
import {OnboardingScreen} from './src/screens/OnboardingScreen';
import {SCREEN_TITLES, ScreenName} from './src/screens/routes';
import {
  AlarmsScreen,
  AppearanceScreen,
  NotificationsScreen,
  SettingsScreen,
} from './src/screens/SettingsScreens';
import {AppDataProvider, useAppData} from './src/state/AppData';
import {
  Colors,
  ThemeProvider,
  useIsDark,
  useThemedStyles,
} from './src/theme';

// LayoutAnimation is still opt-in on Android.
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function renderScreen(route: Route<ScreenName>) {
  switch (route.name) {
    case 'contacts':
      return <ContactsScreen />;
    case 'contact':
      return <ContactDetailScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'notifications':
      return <NotificationsScreen />;
    case 'alarms':
      return <AlarmsScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'appearance':
      return <AppearanceScreen />;
    case 'home':
    default:
      return <LandingScreen />;
  }
}

/**
 * Shows the first-run flow until the permissions it asks for are settled.
 *
 * The flag is stored natively rather than in component state so a cold start
 * after onboarding goes straight to the app, and a fresh install always sees
 * it once.
 */
function Gate() {
  const {permissions, moduleMissing} = useAppData();
  const [checked, setChecked] = useState(false);
  const [onboarded, setOnboarded] = useState(true);

  useEffect(() => {
    if (moduleMissing) {
      setChecked(true);
      return;
    }
    let cancelled = false;
    ContactNamesModule.getPreference('onboarded', '0')
      .then(value => {
        if (!cancelled) {
          setOnboarded(value === '1');
          setChecked(true);
        }
      })
      .catch(() => !cancelled && setChecked(true));
    return () => {
      cancelled = true;
    };
  }, [moduleMissing]);

  // Nothing is drawn until the flag is known, so the app never flashes the
  // landing page before the first-run flow.
  if (!checked) {
    return null;
  }

  if (!onboarded || (permissions && !permissions.contacts)) {
    return <OnboardingScreen onDone={() => setOnboarded(true)} />;
  }

  return (
    <Navigator<ScreenName>
      initial="home"
      render={renderScreen}
      title={route => SCREEN_TITLES[route.name]}
    />
  );
}

function Shell() {
  const styles = useThemedStyles(makeStyles);
  const isDark = useIsDark();

  if (!isNativeModuleAvailable()) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.title}>Native module missing</Text>
          <Text style={styles.paragraph}>
            ContactModule is not registered. Stop Metro and run a full rebuild
            with "npm run android" — reloading JS is not enough after adding
            native code.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      {/* RN 0.88 drops StatusBar.backgroundColor under edge-to-edge; the
          SafeAreaView's background shows through instead. */}
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Ambient>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <AppDataProvider>
            <Gate />
          </AppDataProvider>
        </SafeAreaView>
      </Ambient>
    </>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const makeStyles = (c: Colors) =>
  ({
    safeArea: {flex: 1, backgroundColor: 'transparent'},
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    },
    title: {color: c.text, fontSize: 20, fontWeight: '700'},
    paragraph: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
  }) as const;

export default App;
