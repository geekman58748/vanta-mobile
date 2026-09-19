/**
 * VANTA PRIVACY PROTOCOL — WebView Shell
 * 
 * Your exact HTML design renders in the WebView.
 * This shell bridges the MWA wallet connection:
 *   WebView postMessage → React Native → MWA transact() → result back to WebView
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { Buffer } from 'buffer';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

// Hermes doesn't have Buffer — polyfill it globally before anything uses it
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

// Resolve the HTML asset to a local file URI
const htmlAsset = Asset.fromModule(require('./web/vanta-app.html'));

export default function App() {
  const webViewRef = useRef(null);
  const [htmlUri, setHtmlUri] = useState(null);

  useEffect(() => {
    (async () => {
      await htmlAsset.downloadAsync();
      setHtmlUri(htmlAsset.localUri);
    })();
  }, []);

  // Send a message back to the WebView's JavaScript
  const sendToWeb = useCallback((jsCode) => {
    webViewRef.current?.injectJavaScript(jsCode);
  }, []);

  // Handle messages from the WebView
  const onMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      // No wallet bridge needed — session keys are derived client-side.
      // The WebView handles everything via tweetnacl + localStorage.
      if (false) { // placeholder to keep structure

        // WebView asked us to send a stealth transaction
        try {
          const { StealthAddress } = require('./src/stealth/stealth');
          const recipient = StealthAddress.generateRecipient();
          const stealth = StealthAddress.generateStealthAddress(recipient.metaAddress);
          const stealthPubkey = new PublicKey(stealth.stealthAddress);

          await transact(async (wallet) => {
            const auth = await wallet.authorize({
              cluster: 'devnet',
              identity: { name: 'Vanta Privacy Protocol' },
            });
            const fromPubkey = new PublicKey(auth.accounts[0].publicKey);

            const tx = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey,
                toPubkey: stealthPubkey,
                lamports: 0.01 * LAMPORTS_PER_SOL,
              })
            );
            const { blockhash } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            tx.feePayer = fromPubkey;

            const sigs = await wallet.signAndSendTransactions({ transactions: [tx] });
            const sig = typeof sigs[0] === 'string' ? sigs[0] : sigs[0].toString();

            // Tell WebView the stealth tx was sent
            sendToWeb(`onStealthTxSent();`);
          });
        } catch (err) {
          console.error('Native bridge error:', err);
        }
      }
    } catch (parseErr) {
      // Not JSON, ignore
    }
  }, [sendToWeb]);

  return (
    <View style={styles.container}>
      <ExpoStatusBar style="light" />
      {htmlUri && (
      <WebView
        ref={webViewRef}
        source={{ uri: htmlUri }}
        style={styles.webview}
        onMessage={onMessage}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        mixedContentMode="always"
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        androidHardwareAccelerationEnabled={true}
        androidLayerType="hardware"
        renderToHardwareTextureAndroid={true}
        automaticallyAdjustContentInsets={false}
        contentInset={{ top: 0, bottom: 0 }}
      />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090E',
  },
  webview: {
    flex: 1,
    backgroundColor: '#07090E',
  },
});
