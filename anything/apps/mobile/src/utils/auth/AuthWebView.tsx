/**
 * ⚠ ANYTHING PLATFORM — DO NOT REWRITE THIS FILE ⚠
 *
 * Shipped v2 auth WebView. Handles both native (iOS/Android WebView +
 * onShouldStartLoadWithRequest → fetch /api/auth/token → setAuth) and web
 * (iframe + window.addEventListener('message') listening for AUTH_SUCCESS
 * postMessage from /api/auth/expo-web-success). BOTH code paths are
 * load-bearing; do NOT delete the web branch because you're only testing
 * native, and vice versa. The postMessage contract { type, jwt, user } must
 * stay in sync with /api/auth/expo-web-success/route.ts.
 */
'use client';

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview/lib/WebViewTypes';
import { useAuthStore } from './store';

const callbackUrl = '/api/auth/token';
const callbackQueryString = `callbackUrl=${callbackUrl}`;

// JS injected into the WebView to perform the token exchange from inside the
// page itself. The session cookie set during sign-in lives in the WebView's
// cookie store; a `fetch` issued from the React Native JS context (expo/fetch)
// runs on a separate networking stack that does NOT carry that cookie, so the
// token route sees no session and returns 401 — leaving the modal stuck on
// "Signing In...". Running the fetch in-page with `credentials: 'include'`
// keeps it same-origin with the sign-in cookie and hands the result back over
// the same `{ type, jwt, user }` postMessage contract the web iframe path uses.
const buildTokenExchangeScript = (tokenUrl: string) => `
  (function () {
    fetch(${JSON.stringify(tokenUrl)}, { credentials: 'include' })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (data && data.jwt) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'AUTH_SUCCESS', jwt: data.jwt, user: data.user })
          );
        } else {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'AUTH_ERROR', error: (data && data.error) || 'Unauthorized' })
          );
        }
      })
      .catch(function (err) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'AUTH_ERROR', error: String(err) })
        );
      });
    true;
  })();
`;

// Normalize the expected origin once. `new URL(...).origin` strips trailing
// slashes, paths, and query — so a stray slash in EXPO_PUBLIC_PROXY_BASE_URL
// no longer silently drops every postMessage from the auth iframe.
const allowedOrigin = (() => {
  const raw = process.env.EXPO_PUBLIC_PROXY_BASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
})();

interface AuthWebViewProps {
	mode: 'signup' | 'signin';
	proxyURL: string;
	baseURL: string;
}

interface AuthMessageData {
	type: 'AUTH_SUCCESS' | 'AUTH_ERROR';
	jwt?: string;
	user?: {
		id: string;
		email: string;
		name: string;
		image: string;
	};
	error?: string;
}

/**
 * This renders a WebView for authentication and handles both web and native platforms.
 */
export const AuthWebView = ({ mode, proxyURL, baseURL }: AuthWebViewProps) => {
  const [currentURI, setURI] = useState(`${baseURL}/account/${mode}?${callbackQueryString}`);
  const { auth, setAuth, isReady } = useAuthStore();
  const isAuthenticated = isReady ? !!auth : null;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const webViewRef = useRef<WebView>(null);
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    if (isAuthenticated) {
      router.back();
    }
  }, [isAuthenticated]);
  useEffect(() => {
    if (isAuthenticated) {
      return;
    }
    setURI(`${baseURL}/account/${mode}?${callbackQueryString}`);
  }, [mode, baseURL, isAuthenticated]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) {
      return;
    }
    const handleMessage = (event: MessageEvent<AuthMessageData>) => {
      // Verify the origin for security. Compare normalized origins so a
      // trailing slash or path in EXPO_PUBLIC_PROXY_BASE_URL doesn't drop
      // legitimate messages. Surface drops via console.warn instead of
      // silently swallowing them.
      if (allowedOrigin && event.origin !== allowedOrigin) {
        console.warn(
          `AuthWebView: dropping message from unexpected origin ${event.origin}; expected ${allowedOrigin}`
        );
        return;
      }
      if (event.data.type === 'AUTH_SUCCESS') {
        setAuth({
          jwt: event.data.jwt!,
          user: event.data.user!,
        });
      } else if (event.data.type === 'AUTH_ERROR') {
        console.error('Auth error:', event.data.error);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [setAuth]);

  if (Platform.OS === 'web') {
    const handleIframeError = () => {
      console.error('Failed to load auth iframe');
    };

    return (
      <iframe
        ref={iframeRef}
        title="Authentication"
        src={`${proxyURL}/account/${mode}?callbackUrl=/api/auth/expo-web-success`}
        style={{ width: '100%', height: '100%', border: 'none' }}
        onError={handleIframeError}
      />
    );
  }
  return (
    <WebView
      ref={webViewRef}
      sharedCookiesEnabled
      source={{
        uri: currentURI,
        headers: {
          'x-createxyz-project-group-id': process.env.EXPO_PUBLIC_PROJECT_GROUP_ID!,
          host: process.env.EXPO_PUBLIC_HOST!,
          'x-forwarded-host': process.env.EXPO_PUBLIC_HOST!,
          'x-createxyz-host': process.env.EXPO_PUBLIC_HOST!,
        },
      }}
      onMessage={(event) => {
        let data: AuthMessageData;
        try {
          data = JSON.parse(event.nativeEvent.data) as AuthMessageData;
        } catch {
          return;
        }
        if (data?.type === 'AUTH_SUCCESS' && data.jwt) {
          setAuth({ jwt: data.jwt, user: data.user! });
        } else if (data?.type === 'AUTH_ERROR') {
          console.error('Auth error:', data.error);
        }
      }}
      onShouldStartLoadWithRequest={(request: WebViewNavigation) => {
        if (request.url === `${baseURL}${callbackUrl}`) {
          // Run the token exchange inside the WebView so the sign-in session
          // cookie travels with the request. A React Native fetch here hits a
          // cookieless networking stack and gets a 401, leaving the modal
          // stuck on "Signing In...".
          webViewRef.current?.injectJavaScript(buildTokenExchangeScript(request.url));
          return false;
        }
        if (request.url === currentURI) return true;

        // Add query string properly by checking if URL already has parameters
        const hasParams = request.url.includes('?');
        const separator = hasParams ? '&' : '?';
        // Only rewrite the proxy origin when we actually have one. An empty
        // proxyURL makes String.prototype.replaceAll('', baseURL) insert
        // baseURL between every code unit of request.url, which blows the
        // Hermes UTF-16 allocator and aborts the app (SIGABRT in
        // stringPrototypeReplaceAll). Falling back to request.url leaves the
        // WebView on its current origin instead of crashing.
        const newURL = proxyURL
          ? request.url.replaceAll(proxyURL, baseURL)
          : request.url;
        if (newURL.endsWith(callbackUrl)) {
          setURI(newURL);
          return false;
        }
        setURI(`${newURL}${separator}${callbackQueryString}`);
        return false;
      }}
      style={{ flex: 1 }}
    />
  );
};
