import { Redirect } from 'expo-router';

/**
 * Root entry. The app's main surface is the `(tabs)` group, and there is no
 * root index screen — without this redirect the bare launch URL `jdig:///`
 * resolves to nothing and Expo Router shows "Unmatched Route". Send the user
 * straight to the Projects tab.
 */
export default function Index() {
  return <Redirect href="/(tabs)/projects" />;
}
