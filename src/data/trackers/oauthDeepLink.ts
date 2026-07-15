import { Linking, Alert } from 'react-native';

async function handleUrl(url: string | null): Promise<void> {
  console.log('[DeepLink] Received URL:', url);
  if (!url) return;

  // Handle Google Drive Auth redirect
  if (url.includes('oauth2redirect')) {
    try {
      console.log('[DeepLink] Routing to Google Auth...');
      const { handleGoogleRedirect } = require('../googleAuth');
      await handleGoogleRedirect(url);
    } catch (err: any) {
      console.error('[DeepLink] Google login failed:', err);
      Alert.alert('Login failed', `Could not sign in to Google: ${err.message || err}`);
    }
    return;
  }
}

// One shared listener for Google Drive redirect, dispatching by URL marker.
export function initOAuthDeepLinkListener(): () => void {
  Linking.getInitialURL().then(handleUrl);
  const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
  return () => sub.remove();
}
